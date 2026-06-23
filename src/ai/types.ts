export type AiProvider = 'gemini' | 'none' | 'mock';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

export interface ShipSuggestion {
  name: string;
  slot: number;
  equipments: string[];
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
