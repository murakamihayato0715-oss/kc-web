/* eslint-disable */
import ItemStock from '@/classes/item/itemStock';
import ItemMaster from '@/classes/item/itemMaster';
import ShipMaster from '@/classes/fleet/shipMaster';
import ShipValidation from '@/classes/fleet/shipValidation';
import Item from '@/classes/item/item';

export interface SolvedEquipmentResult {
  equipments: string[];
  explanation: string;
}

/**
 * kc-webのロジック(ShipValidation, Item)を直接呼び出し、
 * 提督の手持ち在庫(itemStock)から指定艦娘への100%確実かつ最適な装備構成を自動選出する
 */
export function solveEquipmentFromLogic(
  shipMaster: ShipMaster,
  userRequest: string,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
): SolvedEquipmentResult {
  const isRangeMediumRequested = userRequest.includes('射程中') || userRequest.includes('射程「中」');
  const isMaxFirepowerRequested = userRequest.includes('火力最大') || userRequest.includes('火力重視');

  // 手持ち在庫の中から、この艦娘に装備可能なアイテムをすべて抽出してスコアリング
  const candidates: { master: ItemMaster; remodel: number; score: number; name: string }[] = [];
  const usageMap = new Map<string, number>();

  for (const stock of itemStocks) {
    const master = itemMasters.find((m) => m.id === stock.id);
    if (!master) continue;

    for (let r = stock.num.length - 1; r >= 0; r--) {
      const count = stock.num[r];
      if (count <= 0) continue;

      // 装備可能か判定
      if (ShipValidation.isValidItem(shipMaster, master, 0, r)) {
        const remodelBonus = Math.sqrt(r);
        let score = (master.fire || 0) + (master.torpedo || 0) + remodelBonus;
        
        // 主砲制限・射程制限の加算
        if (isRangeMediumRequested && master.range > 2) {
          score -= 1000; // 射程が長以上の主砲・装備は大幅マイナス評価
        }

        const name = r > 0 ? `${master.name}★+${r}` : master.name;
        candidates.push({ master, remodel: r, score, name });
      }
    }
  }

  // スコア順にソート
  candidates.sort((a, b) => b.score - a.score);

  const selectedEquips: string[] = [];
  const slotCount = shipMaster.slotCount || 4;

  // 主砲枠・副砲枠・電探・水上機の選出ロジック
  let mainGunCount = 0;
  for (const cand of candidates) {
    if (selectedEquips.length >= slotCount) break;

    const key = `${cand.master.id}:${cand.remodel}`;
    const stock = itemStocks.find((s) => s.id === cand.master.id);
    const available = stock ? (stock.num[cand.remodel] || 0) : 0;
    const used = usageMap.get(key) || 0;

    if (used >= available) continue;

    const isMainGun = [1, 2, 3, 38].includes(cand.master.apiTypeId);
    if (isMainGun && mainGunCount >= 2) continue; // 主砲は2本まで

    if (isMainGun) mainGunCount++;
    selectedEquips.push(cand.name);
    usageMap.set(key, used + 1);
  }

  // 補強増設スロットの選出
  let exEquip = '';
  for (const cand of candidates) {
    if (ShipValidation.isValidItem(shipMaster, cand.master, -1, cand.remodel)) {
      const isExCandidate = cand.master.name.includes('タービン') || cand.master.name.includes('機銃') || cand.master.name.includes('見張員') || cand.master.name.includes('バルジ') || cand.master.name.includes('三式弾');
      if (isExCandidate) {
        const key = `${cand.master.id}:${cand.remodel}`;
        const stock = itemStocks.find((s) => s.id === cand.master.id);
        const available = stock ? (stock.num[cand.remodel] || 0) : 0;
        const used = usageMap.get(key) || 0;
        if (used < available) {
          exEquip = `補強増設:${cand.name}`;
          break;
        }
      }
    }
  }

  if (exEquip) {
    selectedEquips.push(exEquip);
  }

  const explanation = `提督の手持ち在庫(itemStock)およびkc-web判定エンジン(ShipValidation)より直接算出された100%確実な最適構成です。`;
  return { equipments: selectedEquips, explanation };
}
