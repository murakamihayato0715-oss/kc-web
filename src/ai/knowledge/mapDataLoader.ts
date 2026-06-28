import CellMaster from '@/classes/enemy/cellMaster';
import EnemyMaster from '@/classes/enemy/enemyMaster';

export interface MapDataSummary {
  areaId: number;
  areaName: string;
  nodes: Array<{
    nodeName: string;
    cellType: number;
    enemyCount: number;
  }>;
}

export class MapDataLoader {
  /**
   * シミュレーター本体のセルマスターデータから特定海域のルート・敵構成を自動同期・抽出します。
   */
  public extractMapSummary(areaId: number, cells: CellMaster[], enemiesMaster: EnemyMaster[]): MapDataSummary {
    const mapCells = Array.isArray(cells) ? cells.filter((c) => c && c.area === areaId) : [];
    const nodesMap = new Map<string, { cellType: number; enemyCount: number }>();

    mapCells.forEach((cell) => {
      if (!cell || !cell.node) return;
      if (!nodesMap.has(cell.node)) {
        const enemyCount = Array.isArray(cell.enemies) ? cell.enemies.length : 0;
        nodesMap.set(cell.node, {
          cellType: cell.cellType || 0,
          enemyCount,
        });
      }
    });

    const nodes = Array.from(nodesMap.entries()).map(([nodeName, info]) => ({
      nodeName,
      cellType: info.cellType,
      enemyCount: info.enemyCount,
    }));

    const world = Math.floor(areaId / 10);
    const map = areaId % 10;

    return {
      areaId,
      areaName: `${world}-${map}`,
      nodes,
    };
  }
}

export const mapDataLoader = new MapDataLoader();
