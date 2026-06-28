import CalcManager from '@/classes/calcManager';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';
import Enemy from '@/classes/enemy/enemy';
import Fleet from '@/classes/fleet/fleet';
import Airbase from '@/classes/airbase/airbase';
import Const, { AB_MODE, CELL_TYPE } from '@/classes/const';
import { MultiFleetSuggestion } from '@/ai/types';
import cloneDeep from 'lodash/cloneDeep';
import ItemMaster from '@/classes/item/itemMaster'; // ここが特に重要でした
import ShipMaster from '@/classes/fleet/shipMaster'; // 艦娘データ判定に必要
import ShipValidation from '@/classes/fleet/shipValidation';

/**
 * 熟練度レベル(0~120)をシミュレータ用(0~7)に変換します。
 */
function getProfRank(level: number): number {
  if (level >= 100) return 7;
  if (level >= 85) return 6;
  if (level >= 70) return 5;
  if (level >= 55) return 4;
  if (level >= 40) return 3;
  if (level >= 25) return 2;
  if (level >= 10) return 1;
  return 0;
}

/**
 * AIの出力をデータベース上の正しいIDと結びつけるための曖昧検索・修正エンジン
 */
function findItemMaster(name: string, itemMasters: ItemMaster[]) {
  // 表記ゆれを正規化（「★+」などの装飾を除去）
  const baseName = name.replace(/★\+\d+/, '').trim();
  // 完全一致を探し、なければ部分一致で最も近いものを探す
  let master = itemMasters.find((m) => m.name === baseName);
  if (!master) {
    master = itemMasters.find((m) => m.name.includes(baseName) || baseName.includes(m.name));
  }
  return master;
}

function mapItem(item: Item | string | null | undefined, itemMasters: ItemMaster[]) {
  if (!item) return null;

  // AIが文字列で装備を出してきた場合の処理（これが今のメインの修正点）
  if (typeof item === 'string') {
    // 1. 名前の正規化（★+数字を削る）
    const baseName = item.replace(/★\+\d+/, '').trim();
    // 2. データベースから検索
    const master = itemMasters.find((m) => m.name === baseName);
    // 3. なければ、名前に含まれるものを探す（曖昧検索）
    const found = master || itemMasters.find((m) => m.name.includes(baseName) || baseName.includes(m.name));

    if (!found) return null;

    const remodelMatch = item.match(/★\+(\d+)/);
    return {
      masterId: found.id,
      improve: remodelMatch ? parseInt(remodelMatch[1], 10) : 0,
      proficiency: 7,
    };
  }

  // 既存のItemオブジェクトの場合
  if (!item.data || item.data.id <= 0) return null;
  return {
    masterId: item.data.id,
    improve: item.remodel || 0,
    proficiency: getProfRank(item.level || 0),
  };
}
/**
 * 艦娘データの変換 (mapShip) の修正
 */
// mapShip の定義を以下のように変更
function mapShip(ship: Ship | Enemy, itemMasters: ItemMaster[]) {
  if (!ship || !ship.data || ship.data.id <= 0) return null;

  const equips: any[] = [];
  ship.items.forEach((item) => {
    // ここで itemMasters を渡す
    const mapped = mapItem(item, itemMasters);
    if (mapped) equips.push(mapped);
  });
  // exItem も同様に
  if (ship.exItem && ship.exItem.data && ship.exItem.data.id > 0) {
    const mappedEx = mapItem(ship.exItem, itemMasters);
    if (mappedEx) equips.push(mappedEx);
  }

  const stats: any = {};
  if (ship instanceof Ship) {
    stats.HP = ship.hp;
    stats.FP = ship.data.fire;
    stats.TP = ship.data.torpedo;
    stats.AA = ship.antiAir;
    stats.AR = ship.data.armor;
    stats.LUK = ship.luck;
    stats.EV = ship.avoid;
    stats.ASW = ship.asw;
    stats.LOS = ship.scout;
    stats.RNG = ship.data.range;
    stats.SPD = ship.data.speed;
    stats.SLOTS = ship.data.slots;
  } else {
    stats.HP = ship.hp;
    stats.AR = ship.actualArmor;
    stats.AA = ship.antiAir;
    stats.SLOTS = ship.data.slots;
  }

  return {
    masterId: ship.data.id,
    LVL: ship.level || (ship instanceof Ship ? 99 : 1),
    stats,
    equips,
  };
}

export function mapCalcManagerToSimData(manager: CalcManager, numSims = 5000) {
  const { fleetInfo } = manager;
  const itemMasters: ItemMaster[] = (manager as any).itemInfo?.itemMasters
                                 || (manager as any).itemMasters
                                 || [];

  const mapShipWithMaster = (s: any) => mapShip(s, itemMasters);

  const mainShips = fleetInfo.fleets[0].ships
    .filter((s) => s.isActive && !s.isEmpty)
    .map(mapShipWithMaster)
    .filter(Boolean);

  const isUnion = !!(fleetInfo.isUnion && fleetInfo.fleets[1] && fleetInfo.fleets[1].ships.length);
  const escortShips = (
    isUnion && fleetInfo.fleets[1]
      ? fleetInfo.fleets[1].ships
        .filter((s) => s.isActive && !s.isEmpty)
        .map(mapShipWithMaster)
        .filter(Boolean)
      : undefined
  );

  const fleetF = {
    ships: mainShips,
    shipsC: isUnion ? escortShips : undefined,
    combineType: isUnion ? (fleetInfo.fleetType || 1) : 0,
    formation: fleetInfo.fleets[0].formation || 1,
  };

  // 支援艦隊および基地航空隊の変換（すべてmapShipWithMasterを使用）
  const supportNShips = fleetInfo.fleets[2]?.ships.filter((s) => s.isActive && !s.isEmpty).map(mapShipWithMaster).filter(Boolean);
  const fleetSupportN = (supportNShips && supportNShips.length > 0) ? { ships: supportNShips, formation: fleetInfo.fleets[2].formation || 1 } : undefined;

  const supportBShips = fleetInfo.fleets[3]?.ships.filter((s) => s.isActive && !s.isEmpty).map(mapShipWithMaster).filter(Boolean);
  const fleetSupportB = (supportBShips && supportBShips.length > 0) ? { ships: supportBShips, formation: fleetInfo.fleets[3].formation || 1 } : undefined;

  // 基地航空隊の修正（mapItem にも itemMasters を渡す）
  const lbas: any[] = [];
  (manager as any).airbaseInfo?.airbases.forEach((ab: any) => {
    if (ab.mode === AB_MODE.BATTLE) {
      const equips: any[] = [];
      const slots: number[] = [];
      ab.items.forEach((item: any) => {
        if (item && item.data && item.data.id > 0) {
          const mapped = mapItem(item, itemMasters); // ★ここも引数追加
          if (mapped) {
            equips.push(mapped);
            slots.push(item.fullSlot || 18);
          }
        }
      });
      if (equips.length > 0) {
        lbas.push({ equips, slots });
        return;
      }
    }
    lbas.push(null);
  });

  // （後続の nodes 構築処理内でも .map(mapShip) を .map(mapShipWithMaster) に置き換えてください）
  // ...
  // 戦闘マスノードの構築
  const nodes = manager.battleInfo.fleets
    .map((enemyFleet, index) => {
      const mainEnemies = enemyFleet.mainEnemies.map((s) => mapShip(s, itemMasters)).filter(Boolean);
      if (mainEnemies.length === 0) return null;

      const escortEnemies = enemyFleet.isUnion
        ? enemyFleet.escortEnemies.map((s) => mapShip(s, itemMasters)).filter(Boolean)
        : undefined;

      const fleetE = {
        ships: mainEnemies,
        shipsC: escortEnemies,
        combineType: enemyFleet.isUnion ? 1 : 0,
        formation: enemyFleet.formation || 1,
      };

      // 基地航空隊のこの戦闘への派遣状態をチェック
      const lbasSent: number[] = [];
      manager.airbaseInfo.airbases.forEach((ab, abIdx) => {
        if (ab.mode === AB_MODE.BATTLE && ab.battleTarget.includes(index)) {
          lbasSent.push(abIdx + 1); // 1-based index in sim-worker
        }
      });

      const isBoss = index === manager.battleInfo.fleets.length - 1;
      const bossNightBattle = (manager as any).bossNightBattle !== false;

      return {
        fleetE,
        doNB: enemyFleet.cellType === CELL_TYPE.NIGHT || (isBoss && bossNightBattle),
        NBOnly: enemyFleet.cellType === CELL_TYPE.NIGHT,
        airOnly:
          enemyFleet.cellType === CELL_TYPE.AERIAL_COMBAT
          || enemyFleet.cellType === CELL_TYPE.AIR_SUPPORTED_ASW,
        airRaid:
          enemyFleet.cellType === CELL_TYPE.AIR_RAID
          || enemyFleet.cellType === CELL_TYPE.HIGH_AIR_RAID
          || enemyFleet.cellType === CELL_TYPE.SUPER_HIGH_AIR_RAID,
        noAmmo:
          enemyFleet.cellType === CELL_TYPE.AIR_RAID
          || enemyFleet.cellType === CELL_TYPE.HIGH_AIR_RAID
          || enemyFleet.cellType === CELL_TYPE.SUPER_HIGH_AIR_RAID
          || enemyFleet.cellType === CELL_TYPE.AIR_SUPPORTED_ASW,
        formationOverride: enemyFleet.mainFleetFormation.toString(),
        lbas: lbasSent,
      };
    })
    .filter((n): n is Exclude<typeof n, null> => !!n);

  return {
    fleetF,
    fleetSupportN,
    fleetSupportB,
    lbas,
    nodes,
    numSims,
  };
}

/**
 * AIのMultiFleetSuggestionを適用した一時的なCalcManagerを作成します。
 */
export function buildCalcManagerFromSuggestion(
  baseManager: CalcManager,
  suggestion: MultiFleetSuggestion,
  shipMasters: any[],
  itemMasters: any[],
  shipStock: any[],
): CalcManager {
  const manager = cloneDeep(baseManager);

  if (!suggestion || !Array.isArray(suggestion.fleets) || !manager || !manager.fleetInfo || !Array.isArray(manager.fleetInfo.fleets)) {
    return manager;
  }

  const safeShipMasters = Array.isArray(shipMasters) ? shipMasters : [];
  const safeItemMasters = Array.isArray(itemMasters) ? itemMasters : [];
  const safeShipStock = Array.isArray(shipStock) ? shipStock : [];

  suggestion.fleets.forEach((fleetSuggest, fIdx) => {
    if (!fleetSuggest || fIdx >= manager.fleetInfo.fleets.length) return;

    const newShips: Ship[] = [];
    const shipsArray = Array.isArray(fleetSuggest.ships) ? fleetSuggest.ships : [];

    // 遊撃部隊の場合は最大7隻、通常は最大6隻
    const has7thSuggest = shipsArray.some((s) => s && s.slot === 7);
    const targetFleet = manager.fleetInfo.fleets[fIdx];
    const currentFleetShipsLen = targetFleet && Array.isArray(targetFleet.ships) ? targetFleet.ships.length : 6;
    const slotLimit = (
      manager.fleetInfo.fleets.length === 1 && fIdx === 0
        ? Math.max(currentFleetShipsLen, has7thSuggest ? 7 : 6)
        : currentFleetShipsLen
    );

    for (let slotIdx = 0; slotIdx < slotLimit; slotIdx += 1) {
      const slotNum = slotIdx + 1;
      const shipSuggest = shipsArray.find((s) => s && s.slot === slotNum) || shipsArray[slotIdx];
      if (!shipSuggest || !shipSuggest.name || typeof shipSuggest.name !== 'string') {
        newShips.push(new Ship());
        continue;
      }

      // ID直接マッチング優先、なければ名前マッチング
      const cleanedShipName = (shipSuggest.name || '').split('(')[0].trim();
      const shipMaster = shipSuggest.shipId
        ? safeShipMasters.find((s) => s && s.id === shipSuggest.shipId)
        : safeShipMasters.find((s) => s && s.name === cleanedShipName);

      if (!shipMaster) {
        newShips.push(new Ship());
        continue;
      }

      // レベル解析
      const lvMatch = shipSuggest.name.match(/Lv(\d+)/);
      const level = lvMatch ? parseInt(lvMatch[1], 10) : 99;

      // 装備解析
      const normalItems: Item[] = [];
      let exItem = new Item();
      const equipmentsArray = Array.isArray(shipSuggest.equipments) ? shipSuggest.equipments : [];

      equipmentsArray.forEach((eqName) => {
        if (!eqName || typeof eqName !== 'string') return;
        const isExHeader = eqName.startsWith('補強増設:');
        const eqCleanName = eqName.replace('補強増設:', '').trim();

        const remodelMatch = eqCleanName.match(/★\+(\d+)/);
        const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
        const baseEqName = eqCleanName.replace(/★\+\d+/, '').trim();

        const itemMaster = safeItemMasters.find((i) => i && i.name === baseEqName);
        if (itemMaster) {
          const itemProficiency = itemMaster.isPlane ? 120 : 0;
          const canEquipEx = ShipValidation.isValidItem(shipMaster, itemMaster, Const.EXPAND_SLOT_INDEX, remodel);

          if (isExHeader || (normalItems.length >= (shipMaster.slotCount || 0) && canEquipEx)) {
            if (canEquipEx) {
              exItem = new Item({ master: itemMaster, remodel, slot: 0, level: itemProficiency });
            }
          } else {
            const itemSlotIdx = normalItems.length;
            if (ShipValidation.isValidItem(shipMaster, itemMaster, itemSlotIdx, remodel)) {
              const slotCap = Array.isArray(shipMaster.slots) ? (shipMaster.slots[itemSlotIdx] || 0) : 0;
              normalItems.push(new Item({ master: itemMaster, remodel, slot: slotCap, level: itemProficiency }));
            } else if (canEquipEx && (!exItem || !exItem.data || exItem.data.id <= 0)) {
              exItem = new Item({ master: itemMaster, remodel, slot: 0, level: itemProficiency });
            }
          }
        }
      });

      // 標準スロット数分、空の装備を追加
      const slotCount = shipMaster.slotCount || 0;
      while (normalItems.length < slotCount) {
        const slotCap = Array.isArray(shipMaster.slots) ? shipMaster.slots[normalItems.length] : 0;
        normalItems.push(new Item({ slot: slotCap }));
      }

      // shipStockから増設解放状態を取得
      const stockItem = safeShipStock.find((s: any) => s && s.id === shipMaster.id);
      let releaseExpand = false;
      if (exItem && exItem.data && exItem.data.id > 0) {
        releaseExpand = true;
      } else if (stockItem) {
        releaseExpand = !!stockItem.releaseExpand;
      }

      const builtShip = new Ship({
        master: shipMaster,
        level,
        items: normalItems,
        exItem,
        releaseExpand,
      });

      newShips.push(builtShip);
    }

    const currentFleet = manager.fleetInfo.fleets[fIdx];
    manager.fleetInfo.fleets[fIdx] = new Fleet({ fleet: currentFleet, ships: newShips });
  });

  // 基地航空隊の自動セット処理
  if (Array.isArray(suggestion.airbases) && manager.airbaseInfo && Array.isArray(manager.airbaseInfo.airbases)) {
    suggestion.airbases.forEach((abSuggest) => {
      if (!abSuggest) return;
      const abIdx = abSuggest.index;
      if (typeof abIdx !== 'number' || abIdx >= manager.airbaseInfo.airbases.length) return;

      const airbase = manager.airbaseInfo.airbases[abIdx];
      const newAbItems: Item[] = [];
      const abItemsArray = Array.isArray(abSuggest.items) ? abSuggest.items : [];

      for (let slotIdx = 0; slotIdx < 4; slotIdx += 1) {
        const eqName = abItemsArray[slotIdx];
        if (!eqName || typeof eqName !== 'string') {
          newAbItems.push(new Item());
          continue;
        }

        const remodelMatch = eqName.match(/★\+(\d+)/);
        const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
        const baseEqName = eqName.replace(/★\+\d+/, '').trim();

        const itemMaster = safeItemMasters.find((i) => i && i.name === baseEqName);
        if (itemMaster) {
          newAbItems.push(
            new Item({
              master: itemMaster,
              slot: itemMaster.airbaseMaxSlot,
              remodel,
              level: 120,
            }),
          );
        } else {
          newAbItems.push(new Item());
        }
      }

      manager.airbaseInfo.airbases[abIdx] = new Airbase({
        airbase,
        items: newAbItems,
        mode: abSuggest.mode,
      });
    });
  }

  return manager;
}
