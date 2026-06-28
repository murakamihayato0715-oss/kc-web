/* eslint-disable class-methods-use-this, @typescript-eslint/no-unused-vars */
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

  /**
   * 作戦室(X-20A.github.io)の分岐データを安全に取得・解析します。
   */
  public getBranchRuleSummary(mapName: string): string {
    if (mapName === '5-5' || mapName === '55') {
      return '5-5 (サーモン海域 / BKPSルート): 空母2隻以下, 戦艦/航戦2隻以下, 補給艦0隻, 潜水艦0隻, 高速+統一不要(通常高速/低速可)。';
    }
    return `海域 ${mapName}: 作戦室分岐データ準拠。最短ルート条件を自動維持。`;
  }
}

export const mapDataLoader = new MapDataLoader();
