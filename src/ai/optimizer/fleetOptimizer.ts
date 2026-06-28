/* eslint-disable class-methods-use-this, no-await-in-loop */
import { AiConfig, MultiFleetSuggestion, SimulationResult } from '@/ai/types';
import { suggestFleet } from '@/ai/client';
import { matchDestination, checkBranchConditions } from '@/ai/routeMatcher';
import { validateSuggestion, buildValidationMessage } from '@/ai/suggestionValidator';
import { mapConfig } from '@/ai/config';
import { simulatorAdapter, AdapterSimulationContext } from '@/ai/adapter/simulatorAdapter';

export interface OptimizationOptions {
  config: AiConfig;
  userRequest: string;
  fleetContext: string;
  knowledgeContext: string;
  adapterContext: AdapterSimulationContext;
  onStatusUpdate?: (msg: string, suggestion?: MultiFleetSuggestion) => void;
  checkCancelled?: () => boolean;
}

export class FleetOptimizer {
  /**
   * ハイブリッド自律最適化を実行します (Phase 1: LLM生成 -> Phase 2: ローカル決定論的評価・探索)
   */
  public async optimize(options: OptimizationOptions): Promise<MultiFleetSuggestion | null> {
    const {
      config,
      userRequest,
      fleetContext,
      knowledgeContext,
      adapterContext,
      onStatusUpdate,
      checkCancelled,
    } = options;

    let bestSuggestion: MultiFleetSuggestion | null = null;
    let highestScore = -1;
    let consecutiveFailures = 0;
    const MAX_GENERATIONS = 6;

    let currentFeedback = 'これは第1世代（初期試行）です。手持ち情報から自由にアセンブルを組み立ててください。';

    for (let generation = 1; generation <= MAX_GENERATIONS; generation += 1) {
      if (checkCancelled && checkCancelled()) {
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      let suggestion: MultiFleetSuggestion | null = null;
      const combinedRequest = `${userRequest}\n\n【第 ${generation} 世代探索フィードバック】\n${currentFeedback}\n(前世代スコア: ${highestScore > 0 ? highestScore : '未評価'}。よりボス到達率・ボス旗艦撃破率が高くなる装備・編成のマイナーチェンジまたは新規アセンブル案を作成してください。)`;
      suggestion = await suggestFleet(config, combinedRequest, fleetContext, knowledgeContext);

      if (checkCancelled && checkCancelled()) {
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      if (!suggestion) {
        consecutiveFailures += 1;
        if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: AIによる提案生成に失敗しました (${consecutiveFailures}/3)`);

        if (consecutiveFailures >= 3) {
          if (onStatusUpdate) onStatusUpdate('⚠️ AIの提案生成失敗が3回連続したため、安全装置により探索を自動停止しました。');
          break;
        }
        currentFeedback = '前世代の提案生成に失敗しました。ルールを守って正確なJSONを出力してください。';
        continue;
      }

      consecutiveFailures = 0;

      // 海域ルート条件チェック
      const dest = matchDestination(mapConfig, userRequest);
      if (dest) {
        const branchErrors = checkBranchConditions(dest, suggestion);
        if (branchErrors.length > 0) {
          if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: ルート条件不一致 (${branchErrors.join(', ')})`, suggestion);
          currentFeedback = `【ルート不一致エラー】提案された編成はルート条件を満たしていません: ${branchErrors.join(', ')}`;
          continue;
        }
      }

      // 所持在庫チェック
      const validation = validateSuggestion(
        suggestion,
        adapterContext.itemStocks,
        adapterContext.items,
        adapterContext.ships,
        adapterContext.shipStocks,
      );
      if (!validation.isValid) {
        const errMsg = buildValidationMessage(validation);
        if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: 所持制限不一致 (${errMsg})`, suggestion);
        currentFeedback = `【在庫エラー】${errMsg}`;
        continue;
      }

      if (checkCancelled && checkCancelled()) {
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: シミュレーション検証中 (5000回)...`, suggestion);

      // ユーザーのリクエスト文から海域IDを抽出してアダプターへ引渡し
      let mapIdToApply = suggestion.mapId;
      if (!mapIdToApply) {
        const match = userRequest.match(/([1-7])-([1-7])/);
        if (match) mapIdToApply = parseInt(`${match[1]}${match[2]}`, 10);
      }
      if (!mapIdToApply) mapIdToApply = 65; // デフォルト6-5

      // アダプター経由での計算実行
      const simResult: SimulationResult = await simulatorAdapter.executeSimulation(
        suggestion,
        adapterContext,
        mapIdToApply,
      );

      const reach = simResult.bossReachRate ?? 0;
      const win = simResult.bossSWinRate ?? 0;
      const sinkRate = simResult.bossFlagshipSinkRate ?? 0;
      const buckets = simResult.bucketsUsed ?? 0;
      const fitnessScore = sinkRate * 100 + reach * 10 + win;

      if (fitnessScore > highestScore) {
        highestScore = fitnessScore;
        bestSuggestion = suggestion;
        if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: ベスト編成更新！ (到達率:${reach}%, 旗艦撃破率:${sinkRate}%, S勝利率:${win}%, バケツ:${buckets}個)`, suggestion);
      } else if (onStatusUpdate) {
        onStatusUpdate(`第 ${generation} 世代: 検証完了 (到達率:${reach}%, 旗艦撃破率:${sinkRate}%, S勝利率:${win}%, バケツ:${buckets}個)`, suggestion);
      }

      // 戦術アドバイス(レビュー)の自動生成
      const reviewTactics: string[] = [];
      if (reach < 60) {
        if (simResult.battleLogSummary?.includes('対潜') || simResult.highestRetreatNode?.includes('D') || simResult.highestRetreatNode?.includes('B')) {
          reviewTactics.push('・【戦術レビュー】対潜マスでの事故が大破撤退の主要因です。先制対潜が可能な艦娘やソナー・爆雷装備を導入してください。');
        } else if (simResult.battleLogSummary?.includes('空襲') || simResult.battleLogSummary?.includes('航空')) {
          reviewTactics.push('・【戦術レビュー】敵航空攻撃による被害が甚大です。秋月型等の対空カットイン艦や対空電探・高角砲を装備し防空を強化してください。');
        } else {
          reviewTactics.push('・【戦術レビュー】水上戦マスでの大破撤退が多発しています。過剰火力よりも命中率（電探・★付き主砲）や守備力（増設バルジ・警戒陣）を重視してください。');
        }
      }
      if (reach >= 40 && sinkRate < 70) {
        reviewTactics.push('・【戦術レビュー】ボス到達率に対して旗艦撃破率が不足しています。夜戦カットイン（魚雷CI/主魚電CI/夜偵/照明弾）や対地特効装備（三式弾/WG42/士魂隊/内火艇/大発）を増強してください。');
      }
      if (buckets >= 4.0) {
        reviewTactics.push('・【戦術レビュー】修理バケツ消費が多めです。補強増設へのバルジ装着や小口径主砲+電探セットで安定性を高めてください。');
      }

      const tacticsText = reviewTactics.length > 0 ? reviewTactics.join('\n') : '・【戦術レビュー】バランス良好です。さらなる微調整で勝率極大化を狙ってください。';

      currentFeedback = `
【第 ${generation} 世代のシミュレータ出撃統計 ＆ 戦術レビュー分析】
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

    return bestSuggestion;
  }
}

export const fleetOptimizer = new FleetOptimizer();
