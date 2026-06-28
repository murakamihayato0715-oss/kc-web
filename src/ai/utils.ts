/* eslint-disable import/prefer-default-export */
import CalcManager from '@/classes/calcManager';
import CellMaster from '@/classes/enemy/cellMaster';
import EnemyMaster from '@/classes/enemy/enemyMaster';
import ItemMaster from '@/classes/item/itemMaster';
import EnemyFleet from '@/classes/enemy/enemyFleet';
import Enemy from '@/classes/enemy/enemy';
import BattleInfo from '@/classes/enemy/battleInfo';
import { CELL_TYPE, FORMATION } from '@/classes/const';

const STANDARD_ROUTES: Record<number, string[]> = {
  11: ['A', 'B'], // 1-1
  12: ['A', 'B', 'C'], // 1-2
  13: ['A', 'B', 'C', 'D'], // 1-3
  14: ['A', 'B', 'C', 'D', 'J'], // 1-4
  15: ['A', 'B', 'C', 'D', 'E'], // 1-5
  16: ['A', 'B', 'D', 'E', 'F'], // 1-6
  32: ['C', 'G', 'F', 'L'], // 3-2
  53: ['D', 'I', 'O', 'P', 'Q'], // 5-3
  55: ['B', 'K', 'P', 'S'], // 5-5
  71: ['D', 'C', 'H', 'K'], // 7-1
  72: ['B', 'C', 'D', 'H', 'I', 'M'], // 7-2
  73: ['A', 'C', 'D', 'G', 'I', 'J', 'M', 'N', 'P'], // 7-3
  74: ['A', 'B', 'E', 'G', 'J', 'K', 'L', 'P'], // 7-4
  75: ['A', 'C', 'F', 'G', 'I', 'J', 'K', 'L', 'T'], // 7-5
};

export function applyMapAndEnemies(
  manager: CalcManager,
  mapId: number,
  cells: CellMaster[],
  enemiesMaster: EnemyMaster[],
  itemMasters: ItemMaster[],
): void {
  const targetNodes = STANDARD_ROUTES[mapId];
  if (!targetNodes) return;

  const mapCells = cells.filter((c) => c.area === mapId);
  const fleets: EnemyFleet[] = [];

  targetNodes.forEach((nodeName) => {
    // Find the first cell pattern for this node
    const cell = mapCells.find((c) => c.node === nodeName);
    if (cell) {
      const isUnion = cell.cellType === CELL_TYPE.GRAND;
      const cellEnemies = cell.enemies.map((v) => v + 1500);
      const enemies: Enemy[] = [];

      for (let i = 0; i < cellEnemies.length; i += 1) {
        const id = cellEnemies[i];
        enemies.push(Enemy.createEnemyFromMasterId(id, isUnion && i >= 6, enemiesMaster, itemMasters));
      }

      const isAirRaid = cell.cellType === CELL_TYPE.AIR_RAID
        || cell.cellType === CELL_TYPE.HIGH_AIR_RAID
        || cell.cellType === CELL_TYPE.SUPER_HIGH_AIR_RAID;

      // Automatically determine formation
      let mainFleetFormation: number = FORMATION.LINE_AHEAD;
      if (isAirRaid) {
        mainFleetFormation = FORMATION.DIAMOND;
      } else if (cell.cellType === CELL_TYPE.NIGHT && cell.area > 400) {
        mainFleetFormation = FORMATION.VANGUARD;
      } else if (enemies[0] && enemies[0].isSubmarine) {
        mainFleetFormation = FORMATION.LINE_ABREAST;
      } else {
        // 大和武蔵型特殊攻撃(大和タッチ)の発動判定：水上戦・ボス戦マスでは梯形陣(4)を自動適用
        const hasYamatoClass = manager && manager.fleetInfo && manager.fleetInfo.fleets[0]
          && manager.fleetInfo.fleets[0].ships.some((s) => s && s.data && (s.data.originalId === 131 || s.data.originalId === 143));
        if (hasYamatoClass) {
          mainFleetFormation = FORMATION.ECHELON;
        }
      }

      const ef = new EnemyFleet({
        enemies,
        formation: cell.formation,
        cellType: cell.cellType,
        radius: cell.radius,
        area: cell.area || mapId,
        nodeName: cell.node,
        mainFleetFormation,
      });
      (ef as any).selected = true;
      (ef as any).isActive = true;
      fleets.push(ef);
    } else {
      // セルデータ未読み込み時のフォールバック敵編成自動生成 (例: 7-1等の潜水戦マス)
      const fallbackEnemyIds = [1605, 1533, 1533]; // 潜水ソ級elite, 潜水カ級, 潜水カ級
      const enemies = fallbackEnemyIds.map((id) => Enemy.createEnemyFromMasterId(id, false, enemiesMaster, itemMasters));
      const cellType = CELL_TYPE.NORMAL;

      fleets.push(
        new EnemyFleet({
          enemies,
          formation: FORMATION.LINE_ABREAST,
          cellType,
          radius: [1],
          area: mapId,
          nodeName,
          mainFleetFormation: FORMATION.LINE_ABREAST,
        }),
      );
    }
  });

  if (fleets.length > 0) {
    manager.battleInfo = new BattleInfo({
      info: manager.battleInfo,
      fleets,
      battleCount: fleets.length,
    });
  }
}
