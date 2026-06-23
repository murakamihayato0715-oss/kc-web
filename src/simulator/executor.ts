import CalcManager from '@/classes/calcManager';
import { mapCalcManagerToSimData } from './mapper';

export interface SimNodeResult {
  num: number;
  didNB: number;
  redded: number;
  redIndiv: number[];
  undamaged: number;
  MVPs: number[];
  ranks: {
    S: number;
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
  };
  flagsunk: number;
  airStates: number[];
}

export interface SimTotalResult {
  totalnum: number;
  totalFuelS: number;
  totalAmmoS: number;
  totalBauxS: number;
  totalFuelR: number;
  totalSteelR: number;
  totalBuckets: number;
  totalEmptiedPlanes: number;
  totalEmptiedLBAS: number;
  totalGaugeDamage: number;
  nodes: SimNodeResult[];
  totalDameconUsed?: number;
  maxDameconUsed?: number;
  totalGoddessUsed?: number;
  maxGoddessUsed?: number;
}

export interface SortieSimulationSetting {
  sortieMode: 'single' | 'consecutive';
  retreatPolicy: 'retreat' | 'damecon' | 'advance';
  bucketHpPercent: number;
  bucketTime: number; // 分単位
  dameconStock?: number;
  goddessStock?: number;
  customFormations?: number[];
  submarineDecoy?: boolean;
}

/**
 * 戦闘シミュレーションを実行します。
 * @param manager 計算機マネージャー
 * @param numSims 試行回数
 * @param settings シミュレーション設定
 * @returns シミュレーション集計結果
 */
export function runSortieSimulation(
  manager: CalcManager,
  numSims?: number,
  settings?: SortieSimulationSetting,
): Promise<SimTotalResult> {
  return new Promise((resolve, reject) => {
    try {
      // データのマッピング
      const runs = numSims !== undefined ? numSims : 5000;
      const simData = mapCalcManagerToSimData(manager, runs) as any;

      // シミュレーション設定値の注入
      const s = settings || {
        sortieMode: 'single',
        retreatPolicy: 'damecon',
        bucketHpPercent: 0.5,
        bucketTime: 5940,
      };
      simData.carryOverHp = s.sortieMode === 'consecutive';
      simData.carryOverMorale = s.sortieMode === 'consecutive';
      simData.retreatPolicy = s.retreatPolicy;
      simData.bucketHPPercent = s.bucketHpPercent;
      simData.bucketTime = s.bucketTime * 60; // 分から秒へ変換
      simData.dameconStock = s.dameconStock !== undefined ? s.dameconStock : 0;
      simData.goddessStock = s.goddessStock !== undefined ? s.goddessStock : 0;
      simData.submarineDecoy = !!s.submarineDecoy;

      // 陣形オーバーライドの適用
      if (s.customFormations && s.customFormations.length > 0) {
        for (let i = 0; i < simData.nodes.length; i += 1) {
          if (s.customFormations[i] !== undefined && simData.nodes[i]) {
            simData.nodes[i].formationOverride = s.customFormations[i].toString();
          }
        }
      }

      if (!simData.nodes || simData.nodes.length === 0) {
        throw new Error('シミュレーション可能な戦闘マス（敵主力艦隊が登録されているマス）が設定されていません。MAP画面等で敵編成を設定してください。');
      }

      // Web Workerのパスを生成
      const workerUrl = new URL('/simulator/sim-worker.js', window.location.origin).href;
      const worker = new Worker(workerUrl);

      // タイムアウト設定 (最大30秒)
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error('Simulation timed out after 30 seconds.'));
      }, 30000);

      worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'results') {
          clearTimeout(timeoutId);
          worker.terminate();
          resolve(data as SimTotalResult);
        } else if (type === 'error') {
          clearTimeout(timeoutId);
          worker.terminate();
          reject(new Error(`Simulator error: ${data}`));
        }
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(err);
      };

      // 実行開始
      worker.postMessage({ type: 'simulate', data: simData });
    } catch (err) {
      reject(err);
    }
  });
}
