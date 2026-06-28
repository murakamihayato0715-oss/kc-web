/* eslint-disable */
import { AiConfig, MultiFleetSuggestion, ChatMessage, SimulationResult } from './types';
import { validateSuggestion, buildValidationMessage } from './suggestionValidator';

import ItemStock from '../classes/item/itemStock';
import ItemMaster from '../classes/item/itemMaster';
import ShipMaster from '../classes/fleet/shipMaster';
import ShipStock from '../classes/fleet/shipStock';
import { matchDestination, checkBranchConditions } from '@/ai/routeMatcher';
import { mapConfig } from '@/ai/config';

const COMMON_SUGGESTION_RULES = `
【アセンブリ構築・自律探索の厳格ルール】
1. **手持ち装備の完全一致と在庫管理の厳守（最重要・絶対遵守）**:
   - 提供された「【提督の手持ち情報】」の「【所持装備一覧】」に一字一句違わず書かれている装備名・改修値（★+X）のみを提案に使用してください。リストにない架空の装備を捏造してはいけません。
   - 各装備の所持個数の制限を超えて、艦隊全体に重複して割り当てることは厳禁です。
2. **スロットの完全埋めと強力装備の最適化（空きスロット厳禁）**:
   - 各艦娘の全スロット（通常枠＋補強増設枠）を必ず所持リスト内の強力な装備で完全に埋めてください。装備欄を未装備・空欄にしてはいけません。
   - 戦艦には主砲2＋水上機＋徹甲弾/電探、空母や航巡には制空権（航空優勢・確保）に必要な水戦・水爆・艦戦、対地ボス（6-4等）には三式弾・WG42・士魂隊・内火艇・大発動艇を最優先でアセンブルしてください。
3. **指定艦娘・ルート要求の絶対尊重**:
   - 提督が「長門陸奥秋津洲」等を指定した場合は、所持リストにある該当艦娘（長門改二、陸奥改二、秋津洲改、Commandant Teste改、日進甲等）を最優先で艦隊に組み込んでください。
4. **補強増設（拡張スロット）の必須装着ルール**:
   - 手持ち艦娘リストに \`[補強増設あり]\` と表記されている艦娘には、所持リストにあるタービン、測距儀、増設バルジ、見張員、機銃、戦闘糧食等の対応装備を「補強増設: 装備名★+X」として絶対に空欄にせず必ずセットしてください。
5. **基地航空隊の専用装備（陸攻・陸戦・陸偵）配置規則**:
   - 基地航空隊の装備スロットには、艦載機だけでなく所持リストにある「一式陸攻」「陸攻」「陸上偵察機」「九六式陸攻」などの基地専用機・陸上攻撃機・陸戦を優先して配置してください。
6. **海域ごとの出撃可能基地数の遵守（特に6-5等）**:
   - 6-5海域では第1・第2基地航空隊の2部隊のみが出撃可能です（第3基地は防空専用）。6-5では第3基地航空隊を出撃編成せず空（または防空）とし、第1・第2基地航空隊に陸攻・陸戦・陸偵を集中配備してください。
7. **海域ID (mapId) の明記**:
   - リクエストされた海域（6-4なら64、6-5なら65、5-5なら55）の数値IDを、返却JSONの \`mapId\` プロパティに必ず設定してください。
`;

async function fetchAiText(
  config: AiConfig,
  messages: Array<{ role: string; content: string }>,
  isJsonMode = false,
): Promise<{ text: string | null; rawData: any; finishReason?: string }> {
  const provider = config.provider || 'ollama';
  const modelName = config.model || (provider === 'gemini' ? 'gemini-2.5-flash' : 'qwen3.5:9b-long');

  console.log('[KC-データログ] 📤 AI送信メッセージ・プロンプト:', messages);

  try {
    if (provider === 'gemini') {
      if (!config.apiKey || !config.apiKey.trim()) {
        console.warn('[KC-エージェント] ⚠️ Gemini APIが選択されていますが、API Keyが空です。「⚙️ AI設定」からキーを入力してください。');
        return { text: null, rawData: { error: 'Gemini API Keyが未設定です。「⚙️ AI設定」画面からAPI Keyを入力・保存してください。' } };
      }

      console.log(`[KC-データログ] 🚀 Gemini APIへ通信開始 (モデル: ${modelName})`);
      const cleanApiKey = config.apiKey.trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanApiKey}`;
      const contents = messages.map((m) => ({
        role: m.role === 'user' || m.role === 'system' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: 16384,
            temperature: isJsonMode ? 0.1 : 0.5,
          },
        }),
      });
      const data = await res.json();
      console.log('[KC-データログ] 📥 Gemini APIレスポンス生データ:', data);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[KC-エージェント] ⚠️ Gemini APIの利用上限 (429 Too Many Requests) に達しました。リクエスト頻度を抑制します。');
        }
        console.error('[KC-エージェント] ❌ Gemini API通信エラー:', data);
        return { text: null, rawData: data };
      }
      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
        console.warn('[KC-エージェント] ⚠️ AIの回答がトークン制限(max_tokens)により途中で強制切断・未完了となりました。');
      }
      let text = candidate?.content?.parts?.[0]?.text || null;
      if (text) {
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }
      return { text, rawData: data, finishReason };
    } else {
      // Ollama Native / OpenAI Compatible API
      // 1. まず OpenAI 互換エンドポイントを試す
      const body: any = {
        model: modelName,
        messages,
        temperature: isJsonMode ? 0.1 : 0.5,
        max_tokens: 16384,
        options: {
          num_predict: 16384,
          num_ctx: 32768,
          temperature: isJsonMode ? 0.1 : 0.5,
        },
      };
      if (isJsonMode) {
        body.response_format = { type: 'json_object' };
      }

      let res = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let data = await res.json();
      console.log('[KC-データログ] 📥 Ollama/OpenAI APIレスポンス生データ:', data);

      let choice = data.choices?.[0];
      let finishReason = choice?.finish_reason || data.finish_reason;
      let text = choice?.message?.content ||
                 data.message?.content ||
                 data.response ||
                 data.content ||
                 data.text || null;

      // もし思考モデルで content が空、または finish_reason が length だった場合、Ollama Native /api/chat で直接フォールバック
      if (!text || finishReason === 'length') {
        console.warn('[KC-エージェント] /v1/chat/completionsで応答が空またはトークン制限に達したため、Ollama Native API (/api/chat) で再試行します...');
        const nativeBody = {
          model: modelName,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            num_predict: 16384,
            temperature: isJsonMode ? 0.1 : 0.5,
          },
        };
        const nativeRes = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nativeBody),
        });
        if (nativeRes.ok) {
          const nativeData = await nativeRes.json();
          console.log('[KC-データログ] 📥 Ollama Native API (/api/chat) レスポンス生データ:', nativeData);
          data = nativeData;
          text = nativeData.message?.content || nativeData.message?.reasoning || nativeData.message?.thinking || nativeData.response || null;
          finishReason = nativeData.done_reason || (nativeData.done ? 'stop' : 'length');
        }
      }

      if (finishReason === 'length') {
        console.warn('[KC-エージェント] ⚠️ AIの回答がトークン制限(max_tokens)により途中で強制切断・未完了となりました。');
      }

      if (text) {
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
        text = text.replace(/<think>[\s\S]*/gi, '').trim();
      }

      return { text, rawData: data, finishReason };
    }
  } catch (err) {
    console.error('[KC-エージェント] API通信例外エラー:', err);
    return { text: null, rawData: { exception: String(err) } };
  }
}

function parseAndRepairJson(text: string): any {
  let cleaned = text.trim();
  // 思考タグの削ぎ落とし
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    cleaned = cleaned.substring(firstBrace);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // ブラケット/カッコの修復を試みる
    let repaired = cleaned;
    const lastBrace = repaired.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < repaired.length - 1) {
      repaired = repaired.substring(0, lastBrace + 1);
    }
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i += 1) repaired += ']';
    for (let i = 0; i < openBraces - closeBraces; i += 1) repaired += '}';

    try {
      return JSON.parse(repaired);
    } catch (e2) {
      return null;
    }
  }
}

export async function suggestFleet(
  config: AiConfig,
  userRequest: string,
  fleetContext = '',
  knowledgeContext = '',
  retryCount = 0,
): Promise<MultiFleetSuggestion | null> {
  const prompt = `【絶対厳守ルール】思考プロセス（Thinking Process）、挨拶、前置き、Markdownのコードブロック記法（\`\`\`json ... \`\`\`）は一切出力しないでください。1文字目から純粋なJSONオブジェクト（{）のみを出力し、最後まで完全なJSONとして完結させてください。

以下のゲーム仕様および【アセンブリ構築・自律探索の厳格ルール】を前提として、最高の勝率を叩き出すための編成・装備を提案してください。

${COMMON_SUGGESTION_RULES}

${knowledgeContext ? `${knowledgeContext}\n` : ''}
${fleetContext ? `【提督の手持ち情報と現在編成】\n${fleetContext}\n` : ''}

リクエスト: ${userRequest}

【返却 JSON フォーマット（JSON以外のテキスト出力厳禁）】
{
  "fleets": [
    {
      "ships": [
        { "name": "艦娘名 (LvXX)", "slot": 1, "equipments": ["装備名★+X", "装備名★+Y"] }
      ],
      "comment": "この編成の解説"
    }
  ],
  "comment": "全体的な解説を100文字以内で"
}`;

  try {
    const { text, rawData, finishReason } = await fetchAiText(config, [{ role: 'user', content: prompt }], true);
    if (!text) {
      console.warn('[KC-エージェント] suggestFleet: AI応答テキストが空でした。');
      if (retryCount < 1) {
        console.warn('[KC-エージェント] 🔄 自動リトライを実行します (試行 2/2)...');
        return suggestFleet(config, `${userRequest}\n※前回の出力が空でした。思考を即座にスキップし1文字目から純粋なJSONのみを出力してください。`, fleetContext, knowledgeContext, retryCount + 1);
      }
      return null;
    }

    const parsed = parseAndRepairJson(text);
    if (parsed && typeof parsed === 'object' && parsed.fleets) {
      console.log('[KC-データログ] 💡 AI提案編成(パース/修復成功):', parsed);
      return parsed as MultiFleetSuggestion;
    }

    console.warn('[KC-エージェント] suggestFleet: JSONパース/修復に失敗しました。');
    if (retryCount < 1) {
      console.warn('[KC-エージェント] 🔄 自動リトライを実行します (試行 2/2)...');
      return suggestFleet(config, `${userRequest}\n※前回の出力が途切れました。思考プロセスや解説テキストを一切出力せず、1文字目から純粋なJSONのみを出力してください。`, fleetContext, knowledgeContext, retryCount + 1);
    }

    return null;
  } catch (err) {
    console.error('Local Ollama Connection Error in suggestFleet:', err);
    return null;
  }
}

export async function suggestAndOptimizeFleet(
  config: AiConfig,
  userRequest: string,
  setting: any,
  fleetContext: string,
  knowledgeContext: string,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
  shipMasters: ShipMaster[],
  shipStocks: ShipStock[],
  runSimulationFn: (suggestion: MultiFleetSuggestion) => Promise<SimulationResult>,
  onStatusUpdate?: (msg: string, suggestion?: MultiFleetSuggestion) => void,
  checkCancelled?: () => boolean,
): Promise<MultiFleetSuggestion | null> {

  let currentFeedback = 'これは第1世代（初期試行）です。手持ち情報から自由にアセンブルを組み立ててください。';
  let bestSuggestion: MultiFleetSuggestion | null = null;
  let highestScore = -1;
  let consecutiveFailures = 0;
  const MAX_GENERATIONS = 8;

  try {
    for (let generation = 1; generation <= MAX_GENERATIONS; generation++) {
      // 1. 中断機能の判定
      if (checkCancelled && checkCancelled()) {
        console.log('[KC-エージェント] ユーザーによって探索が中断されました。');
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      console.log(`[KC-エージェント] 第 ${generation} 世代の最適化探索を開始します...`);
      if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代の最適化提案を生成中...`);

      const combinedRequest = `${userRequest}\n\n【シミュレータからのフィードバック（前世代のファクトデータ）】\n${currentFeedback}`;
      const suggestion = await suggestFleet(config, combinedRequest, fleetContext, knowledgeContext);

      // 中断再確認
      if (checkCancelled && checkCancelled()) {
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      // 3. 安全装置（セーフティ）：連続3回失敗で自動停止
      if (!suggestion) {
        consecutiveFailures += 1;
        console.warn(`[KC-エージェント] 第 ${generation} 世代の提案生成に失敗しました (${consecutiveFailures}/3回)`);
        if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: AIによる提案生成に失敗しました (${consecutiveFailures}/3)`);

        if (consecutiveFailures >= 3) {
          console.error('[KC-エージェント] AI提案生成が3回連続で失敗したため、安全装置により探索を停止します。');
          if (onStatusUpdate) onStatusUpdate('⚠️ AIの提案生成失敗が3回連続したため、安全装置により探索を自動停止しました。');
          break;
        }

        currentFeedback = '前世代の提案生成に失敗しました。アセンブルルールを守って正確なJSONを出力してください。';
        continue;
      }

      // 成功したら失敗カウントをリセット
      consecutiveFailures = 0;

      const dest = matchDestination(mapConfig, userRequest); // 海域設定を取得
      if (dest) {
         const branchErrors = checkBranchConditions(dest, suggestion);
         if (branchErrors.length > 0) {
           console.warn(`[KC-エージェント] 第 ${generation} 世代: ルート不一致エラー (${branchErrors.join(', ')})`);
           if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: ルート条件不一致 (${branchErrors.join(', ')})`, suggestion);
           currentFeedback = `【ルート不一致エラー】提案された編成はルート条件を満たしていません: ${branchErrors.join(', ')}。編成を修正してください。`;
           continue; // AIに失敗を伝えて次の生成へ
         }
      }

      const validation = validateSuggestion(
        suggestion, 
        itemStocks, 
        itemMasters, 
        shipMasters, 
        shipStocks
      );
      if (!validation.isValid) {
         const errMsg = buildValidationMessage(validation);
         console.warn(`[KC-エージェント] 第 ${generation} 世代: 在庫エラー (${errMsg})`);
         if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: 所持制限不一致 (${errMsg})`, suggestion);
         currentFeedback = `【在庫エラー】${errMsg}`;
         continue;
      }

      if (checkCancelled && checkCancelled()) {
        if (onStatusUpdate) onStatusUpdate('ユーザーによって自律探索が中断されました。');
        break;
      }

      if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: シミュレーション検証中 (5000回)...`, suggestion);
      const simResult = await runSimulationFn(suggestion);
      console.log(`[デバッグ] 世代${generation}のシミュレーション結果詳細:`, JSON.stringify(simResult, null, 2));

      const reach = simResult.bossReachRate ?? 0;
      const win = simResult.bossSWinRate ?? 0;
      const fitnessScore = reach * win;

      console.log(`[デバッグ] 世代${generation} 計算スコア: ${fitnessScore} (到達率:${reach}% * 勝率:${win}%)`);

      if (fitnessScore > highestScore) {
        highestScore = fitnessScore;
        bestSuggestion = suggestion;
        console.log(`[デバッグ] ベスト編成を更新しました！世代:${generation}, 新最高スコア: ${highestScore}`);
        if (onStatusUpdate) onStatusUpdate(`★ 第 ${generation} 世代: ベスト編成更新！(到達率:${reach}%, S勝利率:${win}%)`, suggestion);
      } else {
        console.log(`[デバッグ] ベスト更新なし (現在の最高スコア: ${highestScore})`);
        if (onStatusUpdate) onStatusUpdate(`第 ${generation} 世代: 検証完了 (到達率:${reach}%, S勝利率:${win}%)`, suggestion);
      }

      if (simResult.bossSWinRate >= 85) {
        console.log('[KC-エージェント] 目標勝率を達成したため、早期正常終了します。');
        if (onStatusUpdate) onStatusUpdate('🎯 目標勝率(85%以上)を達成したため、探索を正常終了します。');
        break;
      }

      currentFeedback = `
【第 ${generation} 世代のシミュレータ出撃統計レポート】
・ボス到達率: ${simResult.bossReachRate}% 
・ボスS勝利率: ${simResult.bossSWinRate}%
・最大の壁: 道中は「 ${simResult.highestRetreatNode} マス 」での大破撤退が最も多発しています。
・戦闘ボトルネックの分析: ${simResult.battleLogSummary}
      `.trim();
    }
  } catch (error) {
    console.error('[KC-エージェント] ループ実行中に例外エラーが発生しました:', error);
    if (onStatusUpdate) onStatusUpdate(`探索ループ中にエラーが発生しました: ${error}`);
  }

  return bestSuggestion;
}

// 📄 src/ai/client.ts (最下部の chatWithAi 関数を以下に差し替え)

// 📄 src/ai/client.ts (最下部の chatWithAi 関数を以下に差し替え)

export async function chatWithAi(
  config: AiConfig,
  chatHistory: ChatMessage[],
  fleetContext = '',
  knowledgeContext = '',
  mode = 'fleet',
): Promise<ChatMessage | null> {
  const modelName = config.model || 'qwen3.5:9b-long';

  let modeInstruction = '';
  switch (mode) {
    case 'chat':
      modeInstruction = '【現在の指示モード: 攻略解説（通常の会話）】\n提督からの質問や相談に対して、JSON構造体は絶対に出力せず、通常のテキスト（マークダウン形式）で詳細かつ分かりやすく回答してください。"suggestion" オブジェクトは含めないでください。';
      break;
    case 'equip':
      modeInstruction = '【現在の指示モード: 装備換装】\n艦娘の装備換装・最適配置を中心に提案してください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。';
      break;
    case 'map':
      modeInstruction = '【現在の指示モード: 海域選定・フルアセンブル】\n攻略目的に適した海域の選定および最適な艦娘・装備の選定を行ってください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。';
      break;
    case 'adjust':
      modeInstruction = '【現在の指示モード: 編成修正・微調整】\n現在の編成の弱点を補う微調整提案を行ってください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。';
      break;
    case 'fleet':
    default:
      modeInstruction = '【現在の指示モード: 新規編成構築】\n海域や目的に合わせた最適な艦娘選定と装備配置を提案してください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。';
      break;
  }

  const systemInstructionText = `以下のゲーム仕様および【アセンブリ構築・自律探索の厳格ルール】を前提として回答してください。

${modeInstruction}

【言語および出力制限の絶対ルール】
・思考プロセス（Thinking Process）や英語の状況分析テキスト（例: "The user is asking..." や "<think>" など）は一切出力しないでください。1文字目から必ず日本語のみで回答してください。

【知識・質問対応の補足ルール】
・ユーザーからゲーム内の一般的な知識（例：ドイツ艦のリスト、仕様の解説、歴史的背景など）について質問された場合は、手持ち情報データに限定されず、艦これの一般的な知識・データに基づいて柔軟かつ丁寧に回答してください。
・【所持装備一覧】や【手持ち艦娘】の制限ルールは、具体的な「実出撃用の艦隊編成・アセンブリ構築」を提案・計算する際にのみ厳密に適用してください。

【アセンブリ構築・スロット配置の厳格ルール】
・5スロット艦娘（大和改二重、武蔵改二、伊勢改二等）は、必ず全5スロットに適切な装備（主砲、徹甲弾、電探、水上機、副砲等）を漏れなく充填してください。
・補強増設スロット（補強増設あり）を持つ艦娘には、必ず タービン、ボイラー、一式徹甲弾改、水雷戦隊 熟練見張員、機銃、電探 など「その艦娘が補強増設枠に装備可能なアイテム」のみを100%割り振ってください。補強増設に装備不可能な主砲や水上機等を補強増設枠に配置することは固く禁止します。
・海域攻略（特に5-5等）では、ボスマス到達に必要な33式索敵値（水上電探、水上偵察機、彩雲等）を必ず十分に確保した装備構成にしてください。
・戦闘糧食、秋刀魚の缶詰、応急修理要員、応急修理女神などの「消費アイテム」は、提督から明示的な指示がない限り、原則としてアセンブリへの配置を自重してください。
・イベント海域における「出撃札（札）」は、【改R4計画艦隊】や【ナルヴィク防衛主隊】のようにイベントごとに固有の名称が付きます。提督から特定の札名や海域ごとの札温存・再利用に関する指示（例:「第一海域の札がついた艦を優先」「主力を温存」）があった場合は、手持ち艦娘の出撃札タグを参照して柔軟かつ最適な編成を提案してください。

※出力文字数制限によるJSONの途切れを防ぐため、JSON出力時の「message」や「comment」の解説テキストは簡潔（200文字以内）にまとめてください。

【編成提案時の返却 JSON フォーマット（デッキビルダー形式準拠・ハルシネーション完全防止）】
{
  "message": "提督へのチャットでの回答メッセージ（マークダウン形式、編成の意図や理由を簡潔に記述）",
  "suggestion": {
    "mapId": null,
    "fleets": [
      {
        "ships": [
          { "name": "大和改二重(Lv95)", "slot": 1, "equipments": ["試製51cm連装砲★+3", "46cm三連装砲改二★+0", "試製15cm9連装高角砲★+0", "紫雲改(熟練)★+0", "15m二重測距儀+21号電探改二★+6", "補強増設: 15m二重測距儀+21号電探改二★+0"] }
        ],
        "comment": "この編成の解説"
      }
    ],
    "comment": "全体的な解説"
  }
}
※指示された海域がある場合（5-5なら55、7-1なら71）は mapId を数値に変更してください。装備名には必ず手持ち装備一覧に存在する正確な名称と改修値（★+N）を記述してください。`;

  const messages = chatHistory.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.role === 'user' ? msg.message : JSON.stringify({ message: msg.message, suggestion: msg.suggestion })
  }));

  messages.unshift({ role: 'system', content: systemInstructionText });
  
  if (fleetContext || knowledgeContext) {
    const contextText = `【提督の手持ち情報と現在編成】\n${fleetContext}\n\n【知識ベース】\n${knowledgeContext}`;
    messages.unshift({ role: 'system', content: contextText });
  }

  try {
    const { text, rawData } = await fetchAiText(config, messages, false);
    if (!text) {
      console.warn('[KC-エージェント] chatWithAi: AI応答テキストが空でした。受信用構造:', rawData);
      const errInfo = rawData ? JSON.stringify(rawData, null, 2) : 'データなし';
      return {
        role: 'model',
        message: `⚠️ AIからの回答テキストが空でした。\n\n【デバッグ用レスポンスデータ】\n\`\`\`json\n${errInfo}\n\`\`\``,
        suggestion: undefined,
      };
    }

    let cleaned = text.trim();
    // 思考タグや英語のメタテキストを排除
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    }

    // テキスト内に { と } が含まれているか判定し、JSON部分の抽出を試みる
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed && typeof parsed === 'object' && (parsed.message !== undefined || parsed.suggestion !== undefined)) {
          return {
            role: 'model',
            message: parsed.message !== undefined ? parsed.message : cleaned.substring(0, firstBrace).trim() || '編成案を提示します。',
            suggestion: parsed.suggestion || undefined,
          };
        }
      } catch (parseErr) {
        console.warn('[KC-エージェント] 抽出したJSONのパースに失敗したため、テキストメッセージとして処理します:', parseErr);
      }
    }

    // 英語の思考テキストで始まっている場合は、純粋なメッセージ部分を抽出
    if (cleaned.startsWith('The user is asking') || cleaned.startsWith('This matches')) {
      const lineBreak = cleaned.indexOf('\n\n');
      if (lineBreak !== -1) {
        cleaned = cleaned.substring(lineBreak).trim();
      }
    }

    return {
      role: 'model',
      message: cleaned,
      suggestion: undefined,
    };
  } catch (err) {
    console.error('Ollama Chat Error:', err);
    return {
      role: 'model',
      message: `AIとの通信中に例外エラーが発生しました: ${err}`,
      suggestion: undefined,
    };
  }
}