export type AiProvider = 'gemini' | 'none' | 'ollama' | 'mock';

export interface AiConfig {
  provider: 'none' | 'gemini' | 'ollama' | 'mock';
  apiKey: string;
  model: string;
}

export interface ShipSuggestion {
  name: string;
  shipId?: number; // 艦娘マスターID (例: 916)
  slot: number;
  equipments: string[];
  equipIds?: number[]; // 装備マスターID配列 (例: [128, 390, 239])
  exItemId?: number; // 補強増設マスターID
}

export interface FleetSuggestion {
  ships: ShipSuggestion[];
  comment: string;
}

export interface AirbaseSuggestion {
  index: number;
  mode: number;
  items: string[];
}

export interface MultiFleetSuggestion {
  fleets: FleetSuggestion[];
  airbases?: AirbaseSuggestion[];
  comment: string;
  mapId?: number;
  presetName?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  message: string;
  suggestion?: MultiFleetSuggestion;
}

export interface SimulationResult {
  bossReachRate: number; // ボス到達率 (%)
  bossSWinRate: number; // ボスS勝利率 (%)
  bossFlagshipSinkRate?: number; // ボス旗艦撃破率 (%) (S勝率+A勝率+B勝率)
  bossAWinRate?: number; // ボスA勝利率 (%)
  bossBWinRate?: number; // ボスB勝利率 (%)
  defeatRate?: number; // 敗北率 (%)
  retreatRate?: number; // 撤退率 (%)
  bossNightBattle?: boolean; // ボスマス夜戦突入フラグ
  bucketsUsed?: number; // バケツ消費数
  fuelConsumed?: number; // 燃料消費数
  ammoConsumed?: number; // 弾薬消費数
  bauxConsumed?: number; // ボーキサイト消費数
  highestRetreatNode: string; // 最も大破撤退が発生しているマス名
  battleLogSummary: string; // テキストサマリー
  routeNodes?: string[]; // 予測通航ルート
}

export interface ComparisonResult {
  userFleetSim: SimulationResult;
  aiFleetSim: SimulationResult;
  winner: 'user' | 'ai' | 'draw';
  diffSWinRate: number;
  summary: string;
}
