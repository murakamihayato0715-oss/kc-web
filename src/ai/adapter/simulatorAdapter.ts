/* eslint-disable class-methods-use-this */
import cloneDeep from 'lodash/cloneDeep';
import CalcManager from '@/classes/calcManager';
import ShipMaster from '@/classes/fleet/shipMaster';
import ItemMaster from '@/classes/item/itemMaster';
import ShipStock from '@/classes/fleet/shipStock';
import CellMaster from '@/classes/enemy/cellMaster';
import EnemyMaster from '@/classes/enemy/enemyMaster';
import { MultiFleetSuggestion, SimulationResult } from '@/ai/types';
import { buildCalcManagerFromSuggestion } from '@/simulator/mapper';
import { applyMapAndEnemies } from '@/ai/utils';
import { runSortieSimulation, validateSimulationContext, SimulationValidationError } from '@/simulator/executor';

export interface AdapterSimulationContext {
  baseCalcManager: CalcManager;
  ships: ShipMaster[];
  items: ItemMaster[];
  shipStocks: ShipStock[];
  itemStocks: any[];
  cells: CellMaster[];
  enemiesMaster: EnemyMaster[];
  siteSetting: any;
}

export class SimulatorAdapter {
  /**
   * AI提案を元に一時的なCalcManagerを構築し、海域データを適用します。
   */
  public prepareCalcManager(
    suggestion: MultiFleetSuggestion,
    context: AdapterSimulationContext,
    overrideMapId?: number,
  ): CalcManager {
    let { baseCalcManager } = context;
    if (!baseCalcManager && (context as any).mainSaveData) {
      baseCalcManager = (context as any).mainSaveData.loadManagerData(
        context.items,
        context.ships,
        context.enemiesMaster,
        context.siteSetting?.admiralLevel || 120,
      );
    }

    const manager = buildCalcManagerFromSuggestion(
      baseCalcManager,
      suggestion,
      context.ships,
      context.items,
      context.shipStocks,
    );

    let mapIdToApply: number | undefined = undefined;
    const userReq = context.siteSetting?.userRequest || '';
    const reqMatch = userReq.match(/([1-7])-([1-7])/);
    if (reqMatch) {
      mapIdToApply = parseInt(`${reqMatch[1]}${reqMatch[2]}`, 10);
    } else {
      mapIdToApply = overrideMapId || suggestion.mapId;
    }

    if (!mapIdToApply && manager.battleInfo && manager.battleInfo.fleets[0] && manager.battleInfo.fleets[0].area) {
      mapIdToApply = manager.battleInfo.fleets[0].area;
    }
    if (!mapIdToApply) {
      mapIdToApply = 32; // デフォルト3-2等へ安全設定
    }

    if (mapIdToApply) {
      // 参照を切り離してストア/マスタのセルデータを適用
      const safeCells = Array.isArray(context.cells) ? cloneDeep(context.cells) : [];
      applyMapAndEnemies(manager, mapIdToApply, safeCells, context.enemiesMaster, context.items);
    }

    // 💡 基地航空隊の派遣先（ボスマス）自動設定および難易度設定
    if (manager && manager.airbaseInfo && manager.battleInfo && Array.isArray(manager.battleInfo.fleets)) {
      const battleFleets = manager.battleInfo.fleets;
      const bossIdx = battleFleets.length > 0 ? battleFleets.length - 1 : 0;
      if (Array.isArray(manager.airbaseInfo.airbases)) {
        manager.airbaseInfo.airbases.forEach((ab: any) => {
          if (ab && ab.mode === 1) { // 出撃モード
            ab.battleTarget = [bossIdx, bossIdx];
          }
        });
      }

      let diffLevel: 0 | 1 | 2 | 3 = 0; // デフォルト甲
      if (context.siteSetting?.userRequest) {
        const req = context.siteSetting.userRequest;
        if (req.includes('乙')) diffLevel = 1;
        else if (req.includes('丙')) diffLevel = 2;
        else if (req.includes('丁')) diffLevel = 3;
      }
      (manager.airbaseInfo as any).difficultyLevel = diffLevel;
    }

    // 自軍艦隊の艦娘アクティブフラグ一括設定
    if (manager && manager.fleetInfo && Array.isArray(manager.fleetInfo.fleets)) {
      manager.fleetInfo.fleets.forEach((fleet: any) => {
        if (fleet && Array.isArray(fleet.ships)) {
          fleet.ships.forEach((s: any) => {
            if (s && s.data && s.data.id > 0) {
              s.isActive = true;
            }
          });
        }
      });
    }

    // 戦闘セルのアクティブフラグ一括設定とディープコピー保護、および大和武蔵型特殊攻撃(梯形陣)の自動バインド
    if (manager && manager.battleInfo && Array.isArray(manager.battleInfo.fleets)) {
      const userReq = context.siteSetting?.userRequest || '';
      let overrideFormation: number | null = null;
      if (userReq.includes('梯形')) overrideFormation = 4;
      else if (userReq.includes('単縦')) overrideFormation = 1;
      else if (userReq.includes('複縦')) overrideFormation = 2;
      else if (userReq.includes('輪形')) overrideFormation = 3;
      else if (userReq.includes('単横')) overrideFormation = 5;
      else if (userReq.includes('警戒')) overrideFormation = 6;

      const hasYamatoClass = manager.fleetInfo && manager.fleetInfo.fleets[0]
        && manager.fleetInfo.fleets[0].ships.some((s) => s && s.data && (s.data.originalId === 131 || s.data.originalId === 143));

      manager.battleInfo.fleets.forEach((fleet: any) => {
        if (fleet && Array.isArray(fleet.mainEnemies) && fleet.mainEnemies.length > 0) {
          fleet.selected = true;
          fleet.isActive = true;
          if (overrideFormation !== null) {
            fleet.mainFleetFormation = overrideFormation;
          } else if (hasYamatoClass && !fleet.enemies[0]?.isSubmarine && fleet.cellType !== 3 && fleet.cellType !== 5 && fleet.cellType !== 7) {
            fleet.mainFleetFormation = 4; // 梯形陣(大和タッチ発動必須)
          }
        }
      });
    }

    return manager;
  }

  /**
   * シミュレーション前提条件を検証します。
   */
  public validate(manager: CalcManager) {
    return validateSimulationContext(manager);
  }

  /**
   * シミュレーションを実行し、AI用の集計結果(SimulationResult)へマッピングして返却します。
   */
  public async executeSimulation(
    suggestion: MultiFleetSuggestion,
    context: AdapterSimulationContext,
    overrideMapId?: number,
  ): Promise<SimulationResult> {
    const manager = this.prepareCalcManager(suggestion, context, overrideMapId);

    console.log('[KC-データログ] ⚔️ シミュレーター投入データ (CalcManager):', manager);

    const validation = this.validate(manager);
    if (!validation.isValid) {
      console.warn('[KC-データログ] ⚠️ シミュレーター事前検証不適合:', validation.errorMessage);
      return {
        bossReachRate: 0,
        bossSWinRate: 0,
        highestRetreatNode: 'なし',
        battleLogSummary: `⚠️ 検証不能: ${validation.errorMessage}`,
      };
    }

    const settings = {
      sortieMode: context.siteSetting?.simSortieMode || 'single',
      retreatPolicy: context.siteSetting?.simRetreatPolicy || 'retreat',
      bucketHpPercent: context.siteSetting?.simBucketHpPercent || 0.5,
      bucketTime: context.siteSetting?.simBucketTime || 5940,
    };

    try {
      const rawResult = await runSortieSimulation(manager, 5000, settings as any);
      const total = rawResult.totalnum || 5000;
      const nodes = rawResult.nodes || [];

      if (nodes.length === 0) {
        return {
          bossReachRate: 0,
          bossSWinRate: 0,
          highestRetreatNode: 'なし',
          battleLogSummary: '戦闘マスが設定されていません',
        };
      }

      const lastNode = nodes[nodes.length - 1];
      const bossReachCount = lastNode.num;
      const bossReachRate = Math.round((bossReachCount / total) * 1000) / 10;
      const bossSWinRate = bossReachCount > 0 ? Math.round((lastNode.ranks.S / bossReachCount) * 1000) / 10 : 0;
      const bossAWinRate = bossReachCount > 0 ? Math.round((lastNode.ranks.A / bossReachCount) * 1000) / 10 : 0;
      const bossBWinRate = bossReachCount > 0 ? Math.round((lastNode.ranks.B / bossReachCount) * 1000) / 10 : 0;
      const bossFlagshipSinkRate = bossReachCount > 0 ? Math.round(((lastNode.ranks.S + lastNode.ranks.A + lastNode.ranks.B) / bossReachCount) * 1000) / 10 : 0;
      const defeatCount = bossReachCount > 0 ? (lastNode.ranks.C + lastNode.ranks.D + lastNode.ranks.E) : 0;
      const defeatRate = bossReachCount > 0 ? Math.round((defeatCount / bossReachCount) * 1000) / 10 : 0;
      const retreatRate = Math.round(((total - bossReachCount) / total) * 1000) / 10;

      let maxRetreats = 0;
      let highestRetreatNodeIdx = -1;
      for (let i = 0; i < nodes.length - 1; i += 1) {
        const reached = nodes[i].num;
        const nextReached = nodes[i + 1].num;
        const retreated = reached - nextReached;
        if (retreated > maxRetreats) {
          maxRetreats = retreated;
          highestRetreatNodeIdx = i + 1;
        }
      }

      const highestRetreatNode = highestRetreatNodeIdx > 0 ? `${highestRetreatNodeIdx}` : 'なし';
      const battleLogSummary = maxRetreats > 0 ? `道中${highestRetreatNodeIdx}マス目で${maxRetreats}回の大破撤退が発生` : '道中撤退なし';

      const simResult: SimulationResult = {
        bossReachRate,
        bossSWinRate,
        bossFlagshipSinkRate,
        bossAWinRate,
        bossBWinRate,
        defeatRate,
        retreatRate,
        bucketsUsed: Math.round(((rawResult.totalBuckets || 0) / total) * 10) / 10,
        fuelConsumed: Math.round((rawResult.totalFuelS || 0) / total),
        ammoConsumed: Math.round((rawResult.totalAmmoS || 0) / total),
        bauxConsumed: Math.round((rawResult.totalBauxS || 0) / total),
        highestRetreatNode,
        battleLogSummary,
      };

      console.log('[KC-データログ] 📊 シミュレーション実行集計結果:', simResult);
      return simResult;
    } catch (err) {
      if (err instanceof SimulationValidationError) {
        return {
          bossReachRate: 0,
          bossSWinRate: 0,
          highestRetreatNode: 'なし',
          battleLogSummary: `⚠️ 戦闘エラー: ${err.message}`,
        };
      }
      throw err;
    }
  }

  /**
   * 提督の現在編成 vs AI提案編成のデュアル5000回シミュレーション比較検証
   */
  public async compareFleets(
    aiSuggestion: MultiFleetSuggestion,
    context: AdapterSimulationContext,
    overrideMapId?: number,
  ): Promise<any> {
    // 1. AI提案のシミュレーション実行
    const aiSim = await this.executeSimulation(aiSuggestion, context, overrideMapId);

    // 2. 提督の現在編成(baseCalcManager)のシミュレーション実行
    const userManager = context.baseCalcManager;
    const mapIdToApply = overrideMapId || aiSuggestion.mapId;
    if (mapIdToApply) {
      const safeCells = Array.isArray(context.cells) ? cloneDeep(context.cells) : [];
      applyMapAndEnemies(userManager, mapIdToApply, safeCells, context.enemiesMaster, context.items);
    }
    const rawUserResult = await runSortieSimulation(userManager, 5000, {
      sortieMode: context.siteSetting?.simSortieMode || 'single',
      retreatPolicy: context.siteSetting?.simRetreatPolicy || 'retreat',
      bucketHpPercent: context.siteSetting?.simBucketHpPercent || 0.5,
      bucketTime: context.siteSetting?.simBucketTime || 5940,
    } as any);

    const total = rawUserResult.totalnum || 5000;
    const nodes = rawUserResult.nodes || [];
    const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    const bossReachCount = lastNode ? lastNode.num : 0;
    const bossReachRate = Math.round((bossReachCount / total) * 1000) / 10;
    const bossSWinRate = (lastNode && bossReachCount > 0) ? Math.round(((lastNode.ranks?.S || 0) / bossReachCount) * 1000) / 10 : 0;

    const userSim = {
      bossReachRate,
      bossSWinRate,
      bucketsUsed: Math.round(((rawUserResult.totalBuckets || 0) / total) * 10) / 10,
      fuelConsumed: Math.round((rawUserResult.totalFuelS || 0) / total),
      ammoConsumed: Math.round((rawUserResult.totalAmmoS || 0) / total),
      bauxConsumed: Math.round((rawUserResult.totalBauxS || 0) / total),
      highestRetreatNode: 'なし',
      battleLogSummary: '提督の現在編成検証完了',
    };

    const diff = Math.round((aiSim.bossSWinRate - userSim.bossSWinRate) * 10) / 10;
    let winner: 'user' | 'ai' | 'draw' = 'draw';
    let summary = '';

    if (diff > 2.0) {
      winner = 'ai';
      summary = `🤖 AI提案の勝ち！ ボスS勝利率が +${diff}% 高く、より低リスクなアセンブリです。`;
    } else if (diff < -2.0) {
      winner = 'user';
      summary = `🏆 提督の勝ち！ 提督の編成が S勝利率で +${Math.abs(diff)}% 上回っています。見事なアセンブリです！`;
    } else {
      winner = 'draw';
      summary = `⚖️ 引き分け！ 両者のボスS勝利率はほぼ同等（差: ${diff}%）です。`;
    }

    return {
      userFleetSim: userSim,
      aiFleetSim: aiSim,
      winner,
      diffSWinRate: diff,
      summary,
    };
  }
}

export const simulatorAdapter = new SimulatorAdapter();
