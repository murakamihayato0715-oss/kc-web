import CalcManager from '@/classes/calcManager';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';
import Enemy from '@/classes/enemy/enemy';
import Fleet from '@/classes/fleet/fleet';
import Airbase from '@/classes/airbase/airbase';
import { AB_MODE, CELL_TYPE } from '@/classes/const';
import { MultiFleetSuggestion } from '@/ai/types';
import cloneDeep from 'lodash/cloneDeep';

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
 * 装備データをシミュレータ用の形式に変換します。
 */
function mapItem(item: Item) {
  if (!item || !item.data || item.data.id <= 0) return null;
  return {
    masterId: item.data.id,
    improve: item.remodel || 0,
    proficiency: getProfRank(item.level || 0),
  };
}

/**
 * 艦娘または敵艦船データをシミュレータ用の形式に変換します。
 */
function mapShip(ship: Ship | Enemy) {
  if (!ship || !ship.data || ship.data.id <= 0) return null;

  const equips: any[] = [];
  ship.items.forEach((item) => {
    const mapped = mapItem(item);
    if (mapped) equips.push(mapped);
  });
  // 補強増設スロットの装備を末尾に追加
  if (ship.exItem && ship.exItem.data && ship.exItem.data.id > 0) {
    const mappedEx = mapItem(ship.exItem);
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

/**
 * CalcManagerをシミュレータ用の出撃設定データオブジェクトに変換します。
 */
export function mapCalcManagerToSimData(manager: CalcManager, numSims = 5000) {
  const { fleetInfo } = manager;

  // 自本隊
  const mainShips = fleetInfo.fleets[0].ships
    .filter((s) => s.isActive && !s.isEmpty)
    .map(mapShip)
    .filter(Boolean);

  // 自随伴（連合艦隊の場合）
  const isUnion = !!(fleetInfo.isUnion && fleetInfo.fleets[1] && fleetInfo.fleets[1].ships.length);
  const escortShips = (
    isUnion && fleetInfo.fleets[1]
      ? fleetInfo.fleets[1].ships
        .filter((s) => s.isActive && !s.isEmpty)
        .map(mapShip)
        .filter(Boolean)
      : undefined
  );

  const fleetF = {
    ships: mainShips,
    shipsC: isUnion ? escortShips : undefined,
    combineType: isUnion ? (fleetInfo.fleetType || 1) : 0,
    formation: fleetInfo.fleets[0].formation || 1,
  };

  // 道中支援艦隊（第3艦隊）
  const supportNShips = (
    fleetInfo.fleets[2] && fleetInfo.fleets[2].ships.some((s) => s.isActive && !s.isEmpty)
      ? fleetInfo.fleets[2].ships
        .filter((s) => s.isActive && !s.isEmpty)
        .map(mapShip)
        .filter(Boolean)
      : undefined
  );
  const fleetSupportN = (
    supportNShips && supportNShips.length > 0
      ? {
        ships: supportNShips,
        formation: fleetInfo.fleets[2].formation || 1,
      }
      : undefined
  );

  // 決戦支援艦隊（第4艦隊）
  const supportBShips = (
    fleetInfo.fleets[3] && fleetInfo.fleets[3].ships.some((s) => s.isActive && !s.isEmpty)
      ? fleetInfo.fleets[3].ships
        .filter((s) => s.isActive && !s.isEmpty)
        .map(mapShip)
        .filter(Boolean)
      : undefined
  );
  const fleetSupportB = (
    supportBShips && supportBShips.length > 0
      ? {
        ships: supportBShips,
        formation: fleetInfo.fleets[3].formation || 1,
      }
      : undefined
  );

  // 基地航空隊
  const lbas: any[] = [];
  manager.airbaseInfo.airbases.forEach((ab) => {
    if (ab.mode === AB_MODE.BATTLE) {
      const equips: any[] = [];
      const slots: number[] = [];
      ab.items.forEach((item) => {
        if (item && item.data && item.data.id > 0) {
          const mapped = mapItem(item);
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

  // 戦闘マスノードの構築
  const nodes = manager.battleInfo.fleets
    .map((enemyFleet, index) => {
      const mainEnemies = enemyFleet.mainEnemies.map(mapShip).filter(Boolean);
      if (mainEnemies.length === 0) return null;

      const escortEnemies = enemyFleet.isUnion
        ? enemyFleet.escortEnemies.map(mapShip).filter(Boolean)
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

      return {
        fleetE,
        doNB: enemyFleet.cellType === CELL_TYPE.NIGHT || isBoss,
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

  suggestion.fleets.forEach((fleetSuggest, fIdx) => {
    if (fIdx >= manager.fleetInfo.fleets.length) return;

    const newShips: Ship[] = [];

    // 遊撃部隊の場合は最大7隻、通常は最大6隻
    const has7thSuggest = fleetSuggest.ships.some((s) => s.slot === 7);
    const slotLimit = (
      manager.fleetInfo.fleets.length === 1 && fIdx === 0
        ? Math.max(manager.fleetInfo.fleets[0].ships.length, has7thSuggest ? 7 : 6)
        : manager.fleetInfo.fleets[fIdx].ships.length
    );

    for (let slotIdx = 0; slotIdx < slotLimit; slotIdx += 1) {
      const slotNum = slotIdx + 1;
      const shipSuggest = fleetSuggest.ships.find((s) => s.slot === slotNum);
      if (!shipSuggest) {
        newShips.push(new Ship());
        continue;
      }

      // 名前マッチング
      const cleanedShipName = shipSuggest.name.split('(')[0].trim();
      const shipMaster = shipMasters.find((s) => s.name === cleanedShipName);

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

      shipSuggest.equipments.forEach((eqName) => {
        const isEx = eqName.startsWith('補強増設:');
        const eqCleanName = eqName.replace('補強増設:', '').trim();

        const remodelMatch = eqCleanName.match(/★\+(\d+)/);
        const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
        const baseEqName = eqCleanName.replace(/★\+\d+/, '').trim();

        const itemMaster = itemMasters.find((i) => i.name === baseEqName);
        if (itemMaster) {
          const item = new Item({ master: itemMaster, remodel });
          if (isEx) {
            exItem = item;
          } else {
            normalItems.push(item);
          }
        }
      });

      // 標準スロット数分、空の装備を追加
      while (normalItems.length < shipMaster.slotCount) {
        normalItems.push(new Item({ slot: shipMaster.slots[normalItems.length] }));
      }

      // shipStockから増設解放状態を取得
      const stockItem = shipStock.find((s: any) => s.id === shipMaster.id);
      const releaseExpand = stockItem ? stockItem.releaseExpand : false;

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
  if (suggestion.airbases && suggestion.airbases.length) {
    suggestion.airbases.forEach((abSuggest) => {
      const abIdx = abSuggest.index;
      if (abIdx >= manager.airbaseInfo.airbases.length) return;

      const airbase = manager.airbaseInfo.airbases[abIdx];
      const newAbItems: Item[] = [];

      for (let slotIdx = 0; slotIdx < 4; slotIdx += 1) {
        const eqName = abSuggest.items[slotIdx];
        if (!eqName) {
          newAbItems.push(new Item());
          continue;
        }

        const remodelMatch = eqName.match(/★\+(\d+)/);
        const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
        const baseEqName = eqName.replace(/★\+\d+/, '').trim();

        const itemMaster = itemMasters.find((i) => i.name === baseEqName);
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
