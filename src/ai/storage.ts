import { AiConfig } from './types';

const KEY = 'kc-ai-settings';

export async function saveAiConfig(config: AiConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save AI config', e);
  }
}

export async function loadAiConfig(): Promise<AiConfig> {
  try {
    const val = localStorage.getItem(KEY);
    if (!val) return { provider: 'none', apiKey: '', model: 'gemini-2.5-flash' };
    return JSON.parse(val) as AiConfig;
  } catch (e) {
    console.error('Failed to load AI config', e);
    return { provider: 'none', apiKey: '', model: 'gemini-2.5-flash' };
  }
}
