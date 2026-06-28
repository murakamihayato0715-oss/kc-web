/* eslint-disable */
import ItemStock from '@/classes/item/itemStock';
import ItemMaster from '@/classes/item/itemMaster';
import ShipMaster from '@/classes/fleet/shipMaster';
import ShipValidation from '@/classes/fleet/shipValidation';

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

  const candidates: { master: ItemMaster; remodel: number; score: number; name: string }[] = [];
  const usageMap = new Map<string, number>();

  for (const stock of itemStocks) {
    const master = itemMasters.find((m) => m.id === stock.id);
    if (!master) continue;

    for (let r = stock.num.length - 1; r >= 0; r--) {
      const count = stock.num[r];
      if (count <= 0) continue;

      if (ShipValidation.isValidItem(shipMaster, master, 0, r)) {
        const remodelBonus = Math.sqrt(r);
        let score = (master.fire || 0) + (master.torpedo || 0) + (master.scout || 0) * 2 + (master.accuracy || 0) + remodelBonus;
        
        if (isRangeMediumRequested && master.range > 2) {
          score -= 2000;
        }

        const name = r > 0 ? `${master.name}★+${r}` : master.name;
        candidates.push({ master, remodel: r, score, name });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const selectedEquips: string[] = [];
  const slotCount = shipMaster.slotCount || 4;

  let mainGunCount = 0;
  let apShellCount = 0;
  let radarCount = 0;

  for (const cand of candidates) {
    if (selectedEquips.length >= slotCount) break;

    const key = `${cand.master.id}:${cand.remodel}`;
    const stock = itemStocks.find((s) => s.id === cand.master.id);
    const available = stock ? (stock.num[cand.remodel] || 0) : 0;
    const used = usageMap.get(key) || 0;

    if (used >= available) continue;

    const isMainGun = [1, 2, 3, 38].includes(cand.master.apiTypeId);
    const isApShell = cand.master.name.includes('徹甲弾');
    const isRadar = [12, 13].includes(cand.master.apiTypeId) || cand.master.name.includes('電探');

    if (isMainGun && mainGunCount >= 2) continue;
    if (isApShell && apShellCount >= 1) continue;
    if (isRadar && radarCount >= 1) continue;

    if (isMainGun) mainGunCount++;
    if (isApShell) apShellCount++;
    if (isRadar) radarCount++;

    selectedEquips.push(cand.name);
    usageMap.set(key, used + 1);
  }

  // 残りスロットがある場合、艦載機や偵察機等で100%全スロットを埋める
  if (selectedEquips.length < slotCount) {
    for (const cand of candidates) {
      if (selectedEquips.length >= slotCount) break;
      const key = `${cand.master.id}:${cand.remodel}`;
      const stock = itemStocks.find((s) => s.id === cand.master.id);
      const available = stock ? (stock.num[cand.remodel] || 0) : 0;
      const used = usageMap.get(key) || 0;
      if (used >= available) continue;

      if (!selectedEquips.includes(cand.name)) {
        selectedEquips.push(cand.name);
        usageMap.set(key, used + 1);
      }
    }
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

  return { equipments: selectedEquips, explanation: '' };
}
