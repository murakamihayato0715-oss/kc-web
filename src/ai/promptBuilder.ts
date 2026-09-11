/* eslint-disable */
// 📄 src/ai/promptBuilder.ts
//
// API通信は一切行わない「コピペ方式」用のプロンプト生成モジュール。
// ここで組み立てたテキストを提督が任意のチャットAI（Claude.ai / ChatGPT等、無料枠でOK）に
// 貼り付けて回答をもらい、その回答を responseParser.ts で解析して計算機に反映する。
import ItemStock from '../classes/item/itemStock';
import ItemMaster from '../classes/item/itemMaster';
import ShipMaster from '../classes/fleet/shipMaster';
import { ChatMessage } from './types';
import { solveEquipmentFromLogic } from './equipmentSolver';

export const COMMON_SUGGESTION_RULES = `
【アセンブリ構築・自律探索の厳格ルール】
1. **手持ち装備の完全一致と在庫管理の厳守（最重要・絶対遵守）**:
   - 提供された「【提督の手持ち情報】」の「【所持装備一覧】」に一字一句違わず書かれている装備名・改修値（★+X）のみを提案に使用してください。リストにない架空の装備を捏造してはいけません。
   - 各装備の所持個数の制限を超えて、艦隊全体に重複して割り当てることは厳禁です。
2. **上位性能・フィットボーナス装備の積極活用（多様な上位装備の柔軟な組み合わせ許可）**:
   - 所持リストにある「試製61cm六連装(酸素)魚雷」「61cm五連装(酸素)魚雷」「12.7cm連装砲B型改四(コングラ)」「SG レーダー」「152mm/55 三連装速射砲」「水雷戦隊見張員」など、より高い単体性能やフィットボーナス・シナジー効果を持つ多様な上位装備を、各艦娘の特性や作戦目的に合わせて積極的に組み合わせて使用してください。
3. **高速プラス化時の補強増設へのタービン配置徹底**:
   - 3-2等の高速プラス編成では、タービン（改良型艦本式タービン等）を通常スロットではなく必ず「補強増設: 改良型艦本式タービン★+0」として拡張スロット（exItem）へセットしてください。通常スロットを缶やタービンで埋めてはいけません。
4. **スロットの完全埋めと強力装備の最適化（空きスロット厳禁）**:
   - 各艦娘の全スロット（通常枠＋補強増設枠）を必ず所持リスト内の強力な装備で完全に埋めてください。装備欄を未装備・空欄にしてはいけません。
   - 戦艦には主砲2＋水上機＋徹甲弾/電探、空母や航巡には制空権（航空優勢・確保）に必要な水戦・水爆・艦戦、対地ボス（6-4等）には三式弾・WG42・士魂隊・内火艇・大発動艇を最優先でアセンブルしてください。
5. **指定艦娘・ルート要求の絶対尊重**:
   - 提督が「長門陸奥秋津洲」「山汐丸」等を指定した場合は、所持リストにある該当艦娘（長門改二、陸奥改二、秋津洲改、山汐丸改、Commandant Teste改、日進甲等）を最優先で艦隊に組み込んでください。
6. **基地航空隊の専用装備（陸攻・陸戦・陸偵）配置規則**:
   - 基地航空隊の装備スロットには、艦載機だけでなく所持リストにある「一式陸攻」「陸攻」「陸上偵察機」「九六式陸攻」などの基地専用機・陸上攻撃機・陸戦を優先して配置してください。
7. **海域ごとの出撃可能基地数の遵守（特に6-5等）**:
   - 6-5海域では第1・第2基地航空隊の2部隊のみが出撃可能です（第3基地は防空専用）。6-5では第3基地航空隊を出撃編成せず空（または防空）とし、第1・第2基地航空隊に陸攻・陸戦・陸偵を集中配備してください。
8. **海域ID (mapId) の明記**:
   - リクエストされた海域（3-2なら32、6-4なら64、6-5なら65、5-5なら55）の数値IDを、返却JSONの \`mapId\` プロパティに必ず設定してください。
`;

const MODE_INSTRUCTIONS: Record<string, string> = {
  chat: '【現在の指示モード: 攻略解説（通常の会話）】\n提督からの質問や相談に対して、JSON構造体は絶対に出力せず、通常のテキスト（マークダウン形式）で詳細かつ分かりやすく回答してください。"suggestion" オブジェクトは含めないでください。',
  equip: '【現在の指示モード: 装備換装】\n艦娘の装備換装・最適配置を中心に提案してください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。',
  map: '【現在の指示モード: 海域選定・フルアセンブル】\n攻略目的に適した海域の選定および最適な艦娘・装備の選定を行ってください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。',
  adjust: '【現在の指示モード: 編成修正・微調整】\n現在の編成の弱点を補う微調整提案を行ってください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。',
  fleet: '【現在の指示モード: 新規編成構築】\n海域や目的に合わせた最適な艦娘選定と装備配置を提案してください。必ず返却JSONフォーマットに従い、指定された "suggestion" オブジェクトを含んだJSONを出力してください。',
};

const RETURN_JSON_SPEC = `
【編成提案時の返却 JSON フォーマット（デッキビルダー形式準拠・ハルシネーション完全防止）】
{
  "message": "提督への回答メッセージ（マークダウン形式、編成の意図や理由を簡潔に記述）",
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
※指示された海域がある場合（5-5なら55、7-1なら71）は mapId を数値に変更してください。装備名には必ず手持ち装備一覧に存在する正確な名称と改修値（★+N）を記述してください。
※通常艦隊はfleets配列要素1つ、連合艦隊（機動/水上/輸送等12隻）や遊撃部隊の場合はfleets配列に第1艦隊・第2艦隊を順番に含めてください。
※JSON以外の前置き・後書き・Markdownのコードブロック記法（\`\`\`json）は一切出力せず、1文字目から純粋なJSONオブジェクト（{）のみを最後まで完結させて出力してください。
`;

const SYSTEM_HEADER = `あなたは艦これ提督専属のアセンブリ（艦隊編成・装備）アドバイザーです。以下のゲーム仕様・ルールを厳守して回答してください。

【言語および出力制限の絶対ルール】
・「提督、」「承知いたしました」「～についてご説明します」などの挨拶・前置きは一切出力しないでください。1文字目から結論・編成結果・解説のみを直接出力してください。
・「確定装備リスト」「厳格ルール」などこのプロンプト自体の存在に言及するメタ解説・言い訳を記述することを固く禁止します。
・思考プロセス（Thinking Process）は出力せず、必ず日本語のみで回答してください。

【知識・質問対応の補足ルール】
・ユーザーからゲーム内の一般的な知識について質問された場合は、手持ち情報データに限定されず、艦これの一般的な知識・データに基づいて柔軟かつ丁寧に回答してください。
・【所持装備一覧】や【手持ち艦娘】の制限ルールは、具体的な「実出撃用の艦隊編成・アセンブリ構築」を提案・計算する際にのみ厳密に適用してください。

【アセンブリ構築・スロット配置の厳格ルール】
・5スロット艦娘（大和改二重、武蔵改二、伊勢改二等）は、必ず全5スロットに適切な装備（主砲、徹甲弾、電探、水上機、副砲等）を漏れなく充填してください。
・補強増設スロット（補強増設あり）を持つ艦娘には、必ず タービン、ボイラー、一式徹甲弾改、水雷戦隊 熟練見張員、機銃、電探 など「その艦娘が補強増設枠に装備可能なアイテム」のみを100%割り振ってください。補強増設に装備不可能な主砲や水上機等を補強増設枠に配置することは固く禁止します。
・海域攻略（特に5-5等）では、ボスマス到達に必要な33式索敵値（水上電探、水上偵察機、彩雲等）を必ず十分に確保した装備構成にしてください。
・戦闘糧食、秋刀魚の缶詰、応急修理要員、応急修理女神などの「消費アイテム」は、提督から明示的な指示がない限り、原則としてアセンブリへの配置を自重してください。

※出力文字数制限によるJSONの途切れを防ぐため、JSON出力時の「message」や「comment」の解説テキストは簡潔（200文字以内）にまとめてください。`;

/** 会話履歴を、貼り付け先のチャットAIが単独で読んでも文脈が伝わるプレーンテキストに変換する */
function renderConversationTranscript(chatHistory: ChatMessage[]): string {
  if (!chatHistory.length) return '';
  const lines = chatHistory.map((msg) => {
    if (msg.role === 'user') {
      return `【提督】${msg.message}`;
    }
    const suggestionNote = msg.suggestion ? '\n(このときの提案JSONは省略)' : '';
    return `【AI】${msg.message}${suggestionNote}`;
  });
  return `【これまでの会話履歴】\n${lines.join('\n\n')}\n`;
}

export interface BuildPromptOptions {
  mode?: string;
  fleetContext?: string;
  knowledgeContext?: string;
  itemStocks?: ItemStock[];
  itemMasters?: ItemMaster[];
  shipMasters?: ShipMaster[];
  /** 自律攻略ループ用：前世代のシミュレーション結果フィードバック */
  feedbackNote?: string;
}

/**
 * 提督が任意のチャットAI（Claude.ai等）にそのまま貼り付けるための、
 * API通信を伴わない自己完結型プロンプトを組み立てる。
 */
export function buildAiPrompt(chatHistory: ChatMessage[], options: BuildPromptOptions = {}): string {
  const {
    mode = 'fleet',
    fleetContext = '',
    knowledgeContext = '',
    itemStocks = [],
    itemMasters = [],
    shipMasters = [],
    feedbackNote = '',
  } = options;

  const modeInstruction = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.fleet;
  const isChatOnly = mode === 'chat';

  let contextText = '';
  if (fleetContext) contextText += `【提督の手持ち情報と現在編成】\n${fleetContext}\n\n`;
  if (knowledgeContext) contextText += `【知識ベース】\n${knowledgeContext}\n\n`;

  // 直近の提督発言から艦娘を特定できる場合、kc-webロジック(ShipValidation)で
  // 直接プリソルブした確実な手持ち装備案をコンテキストへ追加する
  const lastUserMsg = chatHistory.slice().reverse().find((m) => m.role === 'user')?.message || '';
  if (lastUserMsg && shipMasters.length > 0 && itemStocks.length > 0) {
    const targetShipMaster = shipMasters.find((s) => s && s.name && lastUserMsg.includes(s.name.split('(')[0]));
    if (targetShipMaster) {
      const solved = solveEquipmentFromLogic(targetShipMaster, lastUserMsg, itemStocks, itemMasters);
      if (solved && solved.equipments.length > 0) {
        contextText += `【kc-web内部計算ロジックによる手持ち在庫完全適合の確定装備選出結果】\n対象艦娘: ${targetShipMaster.name}\n確定装備リスト: [${solved.equipments.join(', ')}]\n※提案では極力この装備リストの名称をそのまま忠実に使用してください。\n\n`;
      }
    }
  }

  const parts: string[] = [SYSTEM_HEADER, modeInstruction];
  if (!isChatOnly) {
    parts.push(COMMON_SUGGESTION_RULES);
  }
  if (contextText) parts.push(contextText.trim());

  const transcript = renderConversationTranscript(chatHistory);
  if (transcript) parts.push(transcript);

  if (feedbackNote) {
    parts.push(feedbackNote);
  }

  if (!isChatOnly) {
    parts.push(RETURN_JSON_SPEC);
  }

  parts.push('上記を踏まえて、直近の【提督】の発言に対する回答を今すぐ出力してください。');

  return parts.filter(Boolean).join('\n\n');
}

/**
 * 自律攻略ループの1世代分プロンプトを組み立てる。
 * chatHistoryは使わず、リクエストとフィードバックのみで完結させる。
 */
export function buildOptimizationRoundPrompt(
  userRequest: string,
  fleetContext: string,
  knowledgeContext: string,
  feedbackNote: string,
  itemStocks: ItemStock[] = [],
  itemMasters: ItemMaster[] = [],
): string {
  const pseudoHistory: ChatMessage[] = [{ role: 'user', message: userRequest }];
  return buildAiPrompt(pseudoHistory, {
    mode: 'fleet',
    fleetContext,
    knowledgeContext,
    itemStocks,
    itemMasters,
    feedbackNote,
  });
}
