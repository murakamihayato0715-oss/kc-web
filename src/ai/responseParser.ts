/* eslint-disable */
// 📄 src/ai/responseParser.ts
//
// 提督が任意のチャットAIから受け取り、貼り付けたテキストを解析するモジュール。
// API通信は行わない（コピペ方式）。JSONの抽出・修復と、手持ち在庫による
// 厳格フィルタ（strictFilterSuggestionWithStock）だけをここで担当する。
import ItemStock from '../classes/item/itemStock';
import ItemMaster from '../classes/item/itemMaster';
import { ChatMessage, MultiFleetSuggestion } from './types';
import { strictFilterSuggestionWithStock } from './suggestionValidator';

export interface ParsedAiReply {
  message: string;
  suggestion?: MultiFleetSuggestion;
}

function stripNoise(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  }
  return cleaned;
}

/** 壊れたJSON（括弧の閉じ忘れ等、長文貼り付け時の途切れ）を出来る限り修復してパースする */
function parseAndRepairJson(text: string): any {
  const cleaned = stripNoise(text);
  const firstBrace = cleaned.indexOf('{');
  const body = firstBrace !== -1 ? cleaned.substring(firstBrace) : cleaned;

  try {
    return JSON.parse(body);
  } catch (e) {
    let repaired = body;
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

/**
 * 貼り付けられたAI回答テキストを解析する。
 * `{ message, suggestion }` 形式、`{ mapId, fleets, comment }` 形式（suggestionのみ）、
 * どちらでも受け付ける。JSONが見つからない場合は素のテキストメッセージとして扱う。
 */
export function parseAiReply(
  pastedText: string,
  itemStocks: ItemStock[] = [],
  itemMasters: ItemMaster[] = [],
): ParsedAiReply {
  const cleaned = stripNoise(pastedText);

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
    const parsed = parseAndRepairJson(jsonCandidate);

    if (parsed && typeof parsed === 'object') {
      // { message, suggestion } 形式
      if (parsed.message !== undefined || parsed.suggestion !== undefined) {
        const safeSuggestion = parsed.suggestion && itemStocks.length > 0
          ? strictFilterSuggestionWithStock(parsed.suggestion, itemStocks, itemMasters)
          : parsed.suggestion;
        return {
          message: parsed.message !== undefined ? parsed.message : (cleaned.substring(0, firstBrace).trim() || '編成案を提示します。'),
          suggestion: safeSuggestion || undefined,
        };
      }
      // { mapId, fleets, comment } 形式（suggestionオブジェクトそのもの）
      if (Array.isArray(parsed.fleets)) {
        const safeSuggestion = itemStocks.length > 0
          ? strictFilterSuggestionWithStock(parsed as MultiFleetSuggestion, itemStocks, itemMasters)
          : (parsed as MultiFleetSuggestion);
        return {
          message: parsed.comment || '編成案を提示します。',
          suggestion: safeSuggestion || undefined,
        };
      }
    }
  }

  // JSONが見つからない場合はテキストメッセージとして扱う
  let textOnly = cleaned;
  if (textOnly.startsWith('The user is asking') || textOnly.startsWith('This matches')) {
    const lineBreak = textOnly.indexOf('\n\n');
    if (lineBreak !== -1) textOnly = textOnly.substring(lineBreak).trim();
  }
  return { message: textOnly, suggestion: undefined };
}

/** 解析結果をChatMessageに変換するヘルパー */
export function toChatMessage(parsed: ParsedAiReply): ChatMessage {
  return { role: 'model', message: parsed.message, suggestion: parsed.suggestion };
}
