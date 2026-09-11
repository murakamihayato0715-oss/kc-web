/* eslint-disable class-methods-use-this */
// 📄 src/ai/optimizer/fleetOptimizer.ts
//
// 「自律攻略エージェント」のコピペ方式版。
// API通信は一切行わない。1世代ごとに
//   1. buildNextPrompt() でコピー用プロンプトを提督に渡す
//   2. 提督が任意のチャットAIに貼り付けて回答をもらう
//   3. submitRoundReply(pastedText) でその回答を解析・在庫検証・シミュレーション実行
// を繰り返す、半自律（人間が橋渡しする）最適化ループとして再設計している。
import { MultiFleetSuggestion, SimulationResult } from '@/ai/types';
import { matchDestination, checkBranchConditions } from '@/ai/routeMatcher';
import { validateSuggestion, buildValidationMessage } from '@/ai/suggestionValidator';
import { parseAiReply } from '@/ai/responseParser';
import { buildOptimizationRoundPrompt } from '@/ai/promptBuilder';
import { mapConfig } from '@/ai/config';
import { simulatorAdapter, AdapterSimulationContext } from '@/ai/adapter/simulatorAdapter';

export interface RoundOutcome {
  ok: boolean;
  generation: number;
  statusMessage: string;
  suggestion?: MultiFleetSuggestion;
  simResult?: SimulationResult;
  isNewBest?: boolean;
  finished: boolean;
}

export class ManualFleetOptimizer {
  public readonly maxGenerations: number;

  private generation = 0;

  private bestSuggestion: MultiFleetSuggestion | null = null;

  private highestScore = -1;

  private feedback = 'これは第1世代（初期試行）です。手持ち情報から自由にアセンブルを組み立ててください。';

  constructor(
    private userRequest: string,
    private fleetContext: string,
    private knowledgeContext: string,
    private adapterContext: AdapterSimulationContext,
    maxGenerations = 8,
  ) {
    this.maxGenerations = maxGenerations;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get best(): MultiFleetSuggestion | null {
    return this.bestSuggestion;
  }

  get isFinished(): boolean {
    return this.generation >= this.maxGenerations;
  }

  /** 次の世代でコピーしてもらうプロンプトを生成する（呼ぶたびに世代が1つ進む） */
  buildNextPrompt(): string {
    this.generation += 1;
    return buildOptimizationRoundPrompt(
      `${this.userRequest}\n\n(前世代スコア: ${this.highestScore > 0 ? this.highestScore : '未評価'}。よりボス到達率・ボス旗艦撃破率が高くなる装備・編成のマイナーチェンジまたは新規アセンブル案を作成してください。)`,
      this.fleetContext,
      this.knowledgeContext,
      this.feedback,
      this.adapterContext.itemStocks,
      this.adapterContext.items,
    );
  }

  /** 提督が貼り付けたAIの回答を解析・検証・シミュレーションする */
  async submitRoundReply(pastedText: string): Promise<RoundOutcome> {
    const { generation } = this;
    const parsed = parseAiReply(pastedText, this.adapterContext.itemStocks, this.adapterContext.items);

    if (!parsed.suggestion || !parsed.suggestion.fleets || parsed.suggestion.fleets.length === 0) {
      this.feedback = '前回の回答からは有効な編成JSONを読み取れませんでした。返却JSONフォーマットを厳守し、JSON以外のテキストを含めずに出力し直してください。';
      return {
        ok: false,
        generation,
        statusMessage: `第 ${generation} 世代: 編成JSONを読み取れませんでした。AIへの依頼文をもう一度貼り付けて、回答を取得し直してください。`,
        finished: this.isFinished,
      };
    }

    const { suggestion } = parsed;

    const dest = matchDestination(mapConfig, this.userRequest);
    if (dest) {
      const branchErrors = checkBranchConditions(dest, suggestion);
      if (branchErrors.length > 0) {
        this.feedback = `【ルート不一致エラー】提案された編成はルート条件を満たしていません: ${branchErrors.join(', ')}。編成を修正してください。`;
        return {
          ok: false,
          generation,
          statusMessage: `第 ${generation} 世代: ルート条件不一致 (${branchErrors.join(', ')})`,
          suggestion,
          finished: this.isFinished,
        };
      }
    }

    const validation = validateSuggestion(
      suggestion,
      this.adapterContext.itemStocks,
      this.adapterContext.items,
      this.adapterContext.ships,
      this.adapterContext.shipStocks,
    );
    if (!validation.isValid) {
      const errMsg = buildValidationMessage(validation);
      this.feedback = `【在庫エラー】${errMsg}`;
      return {
        ok: false,
        generation,
        statusMessage: `第 ${generation} 世代: 所持制限不一致 (${errMsg})`,
        suggestion,
        finished: this.isFinished,
      };
    }

    let mapIdToApply = suggestion.mapId;
    if (!mapIdToApply) {
      const match = this.userRequest.match(/([1-7])-([1-7])/);
      if (match) mapIdToApply = parseInt(`${match[1]}${match[2]}`, 10);
    }
    if (!mapIdToApply) mapIdToApply = 65;

    const simResult = await simulatorAdapter.executeSimulation(suggestion, this.adapterContext, mapIdToApply);

    const reach = simResult.bossReachRate ?? 0;
    const win = simResult.bossSWinRate ?? 0;
    const sinkRate = simResult.bossFlagshipSinkRate ?? 0;
    const buckets = simResult.bucketsUsed ?? 0;
    const fitnessScore = sinkRate * 100 + reach * 10 + win;

    let isNewBest = false;
    if (fitnessScore > this.highestScore) {
      this.highestScore = fitnessScore;
      this.bestSuggestion = suggestion;
      isNewBest = true;
    }

    this.feedback = this.buildFeedback(simResult, reach, win, sinkRate, buckets);

    const statusMessage = isNewBest
      ? `★ 第 ${generation} 世代: ベスト編成更新！ (到達率:${reach}%, 旗艦撃破率:${sinkRate}%, S勝利率:${win}%, バケツ:${buckets}個)`
      : `第 ${generation} 世代: 検証完了 (到達率:${reach}%, 旗艦撃破率:${sinkRate}%, S勝利率:${win}%, バケツ:${buckets}個)`;

    return {
      ok: true,
      generation,
      statusMessage,
      suggestion,
      simResult,
      isNewBest,
      finished: this.isFinished,
    };
  }

  private buildFeedback(simResult: SimulationResult, reach: number, win: number, sinkRate: number, buckets: number): string {
    const reviewTactics: string[] = [];
    const summaryText = simResult.battleLogSummary || '';
    const retreatNode = simResult.highestRetreatNode || '不明';

    if (reach < 70) {
      if (summaryText.includes('対潜') || ['B', 'C', 'D', 'H', 'K'].some((n) => retreatNode.includes(n))) {
        reviewTactics.push(`・【道中安定性診断】${retreatNode}マス付近の潜水艦による被害が目立ちます。過剰な水上火力を調整し、先制対潜攻撃可能な艦娘（ソナー/爆雷）を1〜2隻組み込んで道中撤退を防止してください。`);
      }
      if (summaryText.includes('空襲') || summaryText.includes('航空') || summaryText.includes('制空')) {
        reviewTactics.push(`・【対空・制空診断】${retreatNode}マスでの空襲・航空攻撃による被害が多発しています。対空カットイン艦（秋月型/高角砲+対空電探）や水戦・水爆を補強し、艦隊全体の対空防御を固めてください。`);
      }
      reviewTactics.push(`・【水上戦・耐久診断】${retreatNode}マスでの大破撤退対策として、単なる過剰火力追求を避け、命中率（電探・★付き主砲）による確実な敵撃破と、補強増設へのバルジ装着や警戒陣・複縦陣の活用で守備力と安定性を高めてください。`);
    }

    if (sinkRate < 80) {
      reviewTactics.push(`・【ボス撃破力診断】ボス到達後の撃破率（現在${sinkRate}%）を極大化するため、離島棲姫・集積地棲姫等の陸上型ボスには三式弾・WG42・士魂隊・内火艇・大発動艇を集中配備し、水上ボスには運の高い艦への夜戦カットイン（魚雷CI/主魚電CI）や夜偵・照明弾を強化してください。`);
    }

    if (buckets >= 3.0) {
      reviewTactics.push(`・【コスト・修復診断】修理バケツ消費（平均${buckets}個）を抑えるため、小口径主砲+電探セットでの回避命中強化や中破ストッパー・装甲バルジの追加を検討してください。`);
    }

    const tacticsText = reviewTactics.length > 0 ? reviewTactics.join('\n') : '・【総合診断】全体バランスが極めて良好です。さらなる微調整で到達率と撃破率の100%極限追求を行ってください。';

    return `
【第 ${this.generation} 世代のシミュレータ出撃統計 ＆ 戦術レビュー分析】
・ボス到達率: ${reach}%
・ボス旗艦撃破率: ${sinkRate}%
・ボスS勝利率: ${win}%
・バケツ平均消費: ${buckets}個
・最大の撤退壁: 道中は「 ${simResult.highestRetreatNode || '不明'} マス 」での大破撤退が最多です。
・戦闘分析: ${simResult.battleLogSummary || '特記なし'}

【改善のための次世代戦術指示】
${tacticsText}
    `.trim();
  }
}
