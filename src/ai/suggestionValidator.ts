/* eslint-disable */
import ItemStock from '@/classes/item/itemStock';
import ItemMaster from '@/classes/item/itemMaster';
import ShipMaster from '@/classes/fleet/shipMaster';
import ShipStock from '@/classes/fleet/shipStock';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';
import Fleet from '@/classes/fleet/fleet';
import CommonCalc from '@/classes/commonCalc';
import { MultiFleetSuggestion } from './types';

// ============================
// 型定義
// ============================

export interface ValidationError {
  type: 'inventory_exceeded';
  itemName: string;
  remodel: number;
  required: number;
  available: number;
}

export interface ValidationWarning {
  type: 'air_power_shortage' | 'oasw_impossible' | 'unknown_item' | 'unknown_ship';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ============================
// 装備名パース（共通ユーティリティ）
// ============================

interface ParsedEquipment {
  baseName: string;
  remodel: number;
  isEx: boolean;
}

function parseEquipmentName(eqName: string): ParsedEquipment {
  const isEx = eqName.startsWith('補強増設:');
  const cleanName = eqName.replace('補強増設:', '').trim();
  const remodelMatch = cleanName.match(/★\+(\d+)/);
  const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
  const baseName = cleanName.replace(/★\+\d+/, '').trim();
  return { baseName, remodel, isEx };
}

// ============================
// ① 装備在庫バリデーション
// ============================

export function validateInventory(
  suggestion: MultiFleetSuggestion | undefined,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
): ValidationError[] {
  if (!suggestion) return [];

  // 全装備の使用数をカウント（キー: "装備ID:改修値"）
  const usageMap = new Map<string, { itemName: string; remodel: number; count: number; itemId: number }>();

  const countUsage = (eqName: string) => {
    const parsed = parseEquipmentName(eqName);
    const itemMaster = itemMasters.find((m) => m.name === parsed.baseName);
    if (!itemMaster) return; // unknown item は別で扱う

    const key = `${itemMaster.id}:${parsed.remodel}`;
    const existing = usageMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      usageMap.set(key, {
        itemName: parsed.baseName,
        remodel: parsed.remodel,
        count: 1,
        itemId: itemMaster.id,
      });
    }
  };

  // 艦隊の装備をカウント
  for (const fleet of suggestion.fleets) {
    for (const ship of fleet.ships) {
      for (const eq of ship.equipments) {
        countUsage(eq);
      }
    }
  }

  // 基地航空隊の装備をカウント
  if (suggestion.airbases) {
    for (const ab of suggestion.airbases) {
      for (const eq of ab.items) {
        countUsage(eq);
      }
    }
  }

  // 在庫と照合
  const errors: ValidationError[] = [];
  for (const [, usage] of usageMap) {
    const stock = itemStocks.find((s) => s.id === usage.itemId);
    const available = stock ? stock.num[usage.remodel] || 0 : 0;

    if (usage.count > available) {
      errors.push({
        type: 'inventory_exceeded',
        itemName: usage.itemName,
        remodel: usage.remodel,
        required: usage.count,
        available,
      });
    }
  }

  return errors;
}

// ============================
// ② 制空値検算
// ============================

export function validateAirPower(
  suggestion: MultiFleetSuggestion | undefined,
  shipMasters: ShipMaster[],
  itemMasters: ItemMaster[],
  shipStocks: ShipStock[],
  enemyAirPower?: number,
): ValidationWarning[] {
  if (!suggestion || !suggestion.fleets.length) return [];

  const warnings: ValidationWarning[] = [];

  // 提案された第1艦隊からFleetオブジェクトを構築
  const fleetSuggest = suggestion.fleets[0];
  const ships: Ship[] = [];

  for (let slotIdx = 0; slotIdx < 6; slotIdx += 1) {
    const slotNum = slotIdx + 1;
    const shipSuggest = fleetSuggest.ships.find((s) => s.slot === slotNum);
    if (!shipSuggest) {
      ships.push(new Ship());
      continue;
    }

    const cleanedShipName = shipSuggest.name.split('(')[0].trim();
    const shipMaster = shipMasters.find((s) => s.name === cleanedShipName);
    if (!shipMaster) {
      ships.push(new Ship());
      continue;
    }

    const lvMatch = shipSuggest.name.match(/Lv(\d+)/);
    const level = lvMatch ? parseInt(lvMatch[1], 10) : 99;

    const normalItems: Item[] = [];
    let exItem = new Item();

    shipSuggest.equipments.forEach((eqName) => {
      const parsed = parseEquipmentName(eqName);
      const itemMaster = itemMasters.find((i) => i.name === parsed.baseName);
      if (itemMaster) {
        if (parsed.isEx) {
          exItem = new Item({ master: itemMaster, remodel: parsed.remodel });
        } else {
          const slotSize = shipMaster.slots[normalItems.length] || 0;
          const item = new Item({ master: itemMaster, remodel: parsed.remodel, slot: slotSize });
          normalItems.push(item);
        }
      }
    });

    while (normalItems.length < shipMaster.slotCount) {
      normalItems.push(new Item({ slot: shipMaster.slots[normalItems.length] }));
    }

    const stockItem = shipStocks.find((s) => s.id === shipMaster.id);
    const releaseExpand = stockItem ? stockItem.releaseExpand : false;

    ships.push(new Ship({
      master: shipMaster,
      level,
      items: normalItems,
      exItem,
      releaseExpand,
    }));
  }

  // Fleetを構築して制空値を計算
  const fleet = new Fleet({ ships });
  const myAirPower = fleet.fullAirPower;

  if (enemyAirPower !== undefined && enemyAirPower > 0) {
    const borders = CommonCalc.getAirStatusBorder(enemyAirPower);
    // borders = [確保, 優勢, 均衡, 劣勢, 0]
    const statusNames = ['制空権確保', '航空優勢', '航空均衡', '航空劣勢', '航空喪失'];
    let currentStatus = '航空喪失';
    for (let i = 0; i < borders.length; i += 1) {
      if (myAirPower >= borders[i]) {
        currentStatus = statusNames[i];
        break;
      }
    }

    if (myAirPower < borders[1]) {
      // 優勢未満なら警告
      warnings.push({
        type: 'air_power_shortage',
        message: `制空値: 自軍${myAirPower} → ${currentStatus}（敵制空値:${enemyAirPower} / 確保:${borders[0]} / 優勢:${borders[1]}）`,
      });
    } else if (myAirPower < Math.floor(borders[1] * 1.1)) {
      warnings.push({
        type: 'air_power_shortage',
        message: `制空値: 自軍${myAirPower} → ${currentStatus} (マージンが少なめです。道中撃墜により優勢を逃す可能性があります。目標推奨値: ${Math.floor(borders[1] * 1.1)})`,
      });
    }
  } else if (myAirPower > 0) {
    // 敵制空値不明でも自軍制空値は報告
    warnings.push({
      type: 'air_power_shortage',
      message: `制空値（プログラム検算）: 自軍${myAirPower}（敵制空値不明のため状態判定なし）`,
    });
  }

  return warnings;
}

// ============================
// ③ 未知の艦娘・装備の検出
// ============================

export function validateNames(
  suggestion: MultiFleetSuggestion | undefined,
  shipMasters: ShipMaster[],
  itemMasters: ItemMaster[],
): ValidationWarning[] {
  if (!suggestion) return [];

  const warnings: ValidationWarning[] = [];

  for (const fleet of suggestion.fleets) {
    for (const ship of fleet.ships) {
      const cleanedName = ship.name.split('(')[0].trim();
      if (!shipMasters.find((s) => s.name === cleanedName)) {
        warnings.push({
          type: 'unknown_ship',
          message: `手持ちに存在しない艦娘: ${ship.name}`,
        });
      }

      for (const eq of ship.equipments) {
        const parsed = parseEquipmentName(eq);
        if (!itemMasters.find((m) => m.name === parsed.baseName)) {
          warnings.push({
            type: 'unknown_item',
            message: `存在しない装備名: ${eq}`,
          });
        }
      }
    }
  }

  return warnings;
}

// ============================
// 統合バリデーション
// ============================

export function validateSuggestion(
  suggestion: MultiFleetSuggestion | undefined,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
  shipMasters: ShipMaster[],
  shipStocks: ShipStock[],
  enemyAirPower?: number,
): ValidationResult {
  if (!suggestion) {
    return { isValid: true, errors: [], warnings: [] };
  }

  const errors = validateInventory(suggestion, itemStocks, itemMasters);
  const airWarnings = validateAirPower(suggestion, shipMasters, itemMasters, shipStocks, enemyAirPower);
  const nameWarnings = validateNames(suggestion, shipMasters, itemMasters);

  const warnings = [...airWarnings, ...nameWarnings];

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================
// バリデーション結果の整形
// ============================

export function buildValidationMessage(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push('\n\n**⚠ 装備在庫エラー（プログラム検算）**');
    for (const err of result.errors) {
      const starText = err.remodel > 0 ? `★+${err.remodel}` : '';
      parts.push(`- ${err.itemName}${starText}: 必要${err.required}個 / 所持${err.available}個`);
    }
  }

  if (result.warnings.length > 0) {
    parts.push('\n\n**📋 プログラム検算情報**');
    for (const warn of result.warnings) {
      parts.push(`- ${warn.message}`);
    }
  }

  return parts.join('\n');
}

// ============================
// ④ 装備の下位互換（ダウングレード）自動解決
// ============================

export function applyEquipmentDowngrade(
  suggestion: MultiFleetSuggestion | undefined,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
): { suggestion: MultiFleetSuggestion | undefined; notes: string[] } {
  if (!suggestion) {
    return { suggestion, notes: [] };
  }

  // Deep clone suggestion
  const newSuggestion: MultiFleetSuggestion = JSON.parse(JSON.stringify(suggestion));
  const notes: string[] = [];

  const DEGRADATION_CHAINS = [
    ['HF/DF + Type144/147 ASDIC', '四式水中聴音機', '三式水中探信儀', 'Type124 ASDIC', '九三式水中聴音機'],
    ['烈風改二戊型', '烈風改二', '烈風 一一型', '烈風', '紫電改二', '零式艦戦52型'],
    ['S-51J改', 'S-51J', 'カ号観測機'],
    ['九七式艦攻(友永隊)', '九七式艦攻(九三一空)', '九七式艦攻'],
  ];

  // Track usage in the suggestion (Key: "itemId:remodel", Value: count)
  const usageMap = new Map<string, number>();

  const getAvailableStock = (itemId: number, remodel: number): number => {
    const stock = itemStocks.find((s) => s.id === itemId);
    if (!stock) return 0;
    return stock.num[remodel] || 0;
  };

  const processEquipment = (eqName: string): string => {
    const parsed = parseEquipmentName(eqName);
    const itemMaster = itemMasters.find((m) => m.name === parsed.baseName);
    if (!itemMaster) return eqName; // Unknown item, keep original

    const key = `${itemMaster.id}:${parsed.remodel}`;
    const used = usageMap.get(key) || 0;
    const available = getAvailableStock(itemMaster.id, parsed.remodel);

    if (used < available) {
      // Stock is available, use it!
      usageMap.set(key, used + 1);
      return eqName;
    }

    // Out of stock! Look for degradation chain
    let chain: string[] | undefined;
    for (const c of DEGRADATION_CHAINS) {
      if (c.includes(parsed.baseName)) {
        chain = c;
        break;
      }
    }

    if (!chain) {
      // Not in a chain, keep original
      usageMap.set(key, used + 1);
      return eqName;
    }

    const itemIdx = chain.indexOf(parsed.baseName);
    // Find replacement from itemIdx onwards
    for (let i = itemIdx; i < chain.length; i++) {
      const fallbackName = chain[i];
      const fallbackMaster = itemMasters.find((m) => m.name === fallbackName);
      if (!fallbackMaster) continue;

      // Scan remodel levels from 10 down to 0
      const fallbackStock = itemStocks.find((s) => s.id === fallbackMaster.id);
      if (!fallbackStock) continue;

      for (let r = fallbackStock.num.length - 1; r >= 0; r--) {
        const fallbackCount = fallbackStock.num[r] || 0;
        if (fallbackCount <= 0) continue;

        const fallbackKey = `${fallbackMaster.id}:${r}`;
        const fallbackUsed = usageMap.get(fallbackKey) || 0;

        if (fallbackUsed < fallbackCount) {
          // Found a replacement!
          usageMap.set(fallbackKey, fallbackUsed + 1);
          const replacementName = r > 0 ? `${fallbackName}★+${r}` : fallbackName;
          const finalName = parsed.isEx ? `補強増設:${replacementName}` : replacementName;
          
          if (fallbackName !== parsed.baseName || r !== parsed.remodel) {
            const origCleanName = parsed.remodel > 0 ? `${parsed.baseName}★+${parsed.remodel}` : parsed.baseName;
            notes.push(`※「${origCleanName}」が不足していたため、在庫のある「${replacementName}」で代用しました`);
          }
          return finalName;
        }
      }
    }

    // If no replacement found, keep original
    usageMap.set(key, used + 1);
    return eqName;
  };

  // Downgrade ships' equipments
  for (const fleet of newSuggestion.fleets) {
    for (const ship of fleet.ships) {
      if (ship.equipments) {
        ship.equipments = ship.equipments.map((eq) => processEquipment(eq));
      }
    }
  }

  // Downgrade airbases' items
  if (newSuggestion.airbases) {
    for (const ab of newSuggestion.airbases) {
      if (ab.items) {
        ab.items = ab.items.map((eq) => processEquipment(eq));
      }
    }
  }

  return { suggestion: newSuggestion, notes };
}
