<template>
  <v-card class="mx-1 mx-sm-3 my-2 pa-4 premium-sim-card" outlined>
    <!-- タイトル/概要 -->
    <div class="d-flex align-center mb-4">
      <v-icon color="primary" class="mr-2">mdi-sword-cross</v-icon>
      <span class="text-subtitle-1 font-weight-bold">戦闘シミュレーション結果</span>
      <v-spacer />
      <span class="text-caption grey--text">試行回数: {{ result.totalnum }}回</span>
    </div>

    <!-- 主要統計グリッド -->
    <v-row dense class="mb-4">
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center stat-box" flat outlined>
          <div class="stat-label">ボス到達率</div>
          <div class="stat-val primary--text">{{ bossReachRate }}%</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center stat-box" flat outlined>
          <div class="stat-label">ボスS勝利率</div>
          <div class="stat-val success--text">{{ bossSRate }}%</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center stat-box" flat outlined>
          <div class="stat-label">ボス旗艦撃破率</div>
          <div class="stat-val teal--text">{{ bossFlagshipSinkRate }}%</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center stat-box" flat outlined>
          <div class="stat-label">平均消費バケツ</div>
          <div class="stat-val orange--text text--darken-2">{{ avgBuckets }} 個</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- ボス勝率内訳バー -->
    <v-card flat class="pa-3 mb-4 bg-light-panel" outlined>
      <div class="text-caption font-weight-bold mb-2">ボス戦 勝利ランク内訳 (到達数: {{ bossReachCount }}回)</div>
      <div class="d-flex rounded overflow-hidden rank-bar" style="height: 24px;">
        <div v-if="bossRanks.S > 0" class="rank-segment s-rank" :style="{ width: bossRanks.S + '%' }" :title="`S勝利: ${bossRanks.S}%`">S: {{ bossRanks.S }}%</div>
        <div v-if="bossRanks.A > 0" class="rank-segment a-rank" :style="{ width: bossRanks.A + '%' }" :title="`A勝利: ${bossRanks.A}%`">A: {{ bossRanks.A }}%</div>
        <div v-if="bossRanks.B > 0" class="rank-segment b-rank" :style="{ width: bossRanks.B + '%' }" :title="`B勝利: ${bossRanks.B}%`">B: {{ bossRanks.B }}%</div>
        <div v-if="bossRanks.C > 0" class="rank-segment c-rank" :style="{ width: bossRanks.C + '%' }" :title="`C敗北: ${bossRanks.C}%`">C: {{ bossRanks.C }}%</div>
        <div v-if="bossRanks.D > 0" class="rank-segment d-rank" :style="{ width: bossRanks.D + '%' }" :title="`D敗北: ${bossRanks.D}%`">D: {{ bossRanks.D }}%</div>
        <div v-if="bossRanks.E > 0" class="rank-segment e-rank" :style="{ width: bossRanks.E + '%' }" :title="`E敗北: ${bossRanks.E}%`">E: {{ bossRanks.E }}%</div>
        <div v-if="bossReachCount === 0" class="rank-segment empty-rank" style="width: 100%;">ボス未到達</div>
      </div>
    </v-card>

    <!-- 各マス詳細テーブル -->
    <div class="mb-4">
      <div class="text-caption font-weight-bold mb-1">道中・ボス各マスの詳細</div>
      <v-simple-table dense class="border rounded">
        <template v-slot:default>
          <thead>
            <tr>
              <th class="text-left">マス</th>
              <th class="text-right">到達数</th>
              <th class="text-right">到達率</th>
              <th class="text-right">撤退数</th>
              <th class="text-right">撤退率</th>
              <th class="text-center">主な勝率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(node, idx) in nodeStats" :key="idx">
              <td>
                <span class="font-weight-bold">{{ idx + 1 }}戦目</span>
                <span v-if="idx === nodeStats.length - 1" class="ml-1 red--text text-caption font-weight-bold">(ボス)</span>
              </td>
              <td class="text-right">{{ node.reached }}</td>
              <td class="text-right">{{ node.reachRate }}%</td>
              <td class="text-right">{{ node.retreated }}</td>
              <td class="text-right font-weight-bold" :class="node.retreatRate > 15 ? 'red--text' : 'grey--text text--darken-2'">
                {{ node.retreatRate }}%
              </td>
              <td class="text-center">
                <span class="success--text font-weight-bold mr-1">S:{{ node.ranks.S }}%</span>
                <span class="teal--text">A:{{ node.ranks.A }}%</span>
              </td>
            </tr>
          </tbody>
        </template>
      </v-simple-table>
    </div>

    <!-- ダメコン消費・DMMコスト統計 -->
    <v-card flat class="pa-3 mb-4 bg-light-panel border" outlined v-if="hasDameconConsumption">
      <div class="text-caption font-weight-bold mb-2">
        <v-icon small class="mr-1" color="primary">mdi-shield-outline</v-icon>
        ダメコン消費・リアルマネーコスト分析
      </div>
      <v-row dense>
        <v-col cols="12" sm="4">
          <div class="d-flex align-center justify-space-between py-1 px-2">
            <span class="text-caption font-weight-medium">応急修理要員 (平均 / 最大):</span>
            <span class="body-2 font-weight-bold primary--text">
              {{ avgDamecon }} 個 / {{ maxDamecon }} 個
            </span>
          </div>
        </v-col>
        <v-col cols="12" sm="4">
          <div class="d-flex align-center justify-space-between py-1 px-2">
            <span class="text-caption font-weight-medium">応急修理女神 (平均 / 最大):</span>
            <span class="body-2 font-weight-bold success--text">
              {{ avgGoddess }} 個 / {{ maxGoddess }} 個
            </span>
          </div>
        </v-col>
        <v-col cols="12" sm="4">
          <div class="d-flex align-center justify-space-between py-1 px-2 yellow lighten-5 rounded">
            <span class="text-caption font-weight-bold black--text">平均DMMコスト:</span>
            <span class="body-2 font-weight-black red--text text--darken-2">
              {{ avgDmmCost }} pt / 出撃
            </span>
          </div>
        </v-col>
      </v-row>
    </v-card>

    <!-- 消費資材詳細 -->
    <div>
      <div class="text-caption font-weight-bold mb-1">平均消費資材予測（出撃消費 + 入渠修理）</div>
      <v-row dense>
        <v-col cols="6" sm="3">
          <div class="d-flex align-center pa-2 border rounded">
            <v-img :src="`./img/util/fuel.png`" contain height="20" width="20" class="mr-2" />
            <div>
              <div class="text-caption grey--text">燃料</div>
              <div class="font-weight-bold body-2">{{ avgFuel }} (修: {{ avgRepairFuel }})</div>
            </div>
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="d-flex align-center pa-2 border rounded">
            <v-img :src="`./img/util/ammo.png`" contain height="20" width="20" class="mr-2" />
            <div>
              <div class="text-caption grey--text">弾薬</div>
              <div class="font-weight-bold body-2">{{ avgAmmo }}</div>
            </div>
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="d-flex align-center pa-2 border rounded">
            <v-img :src="`./img/util/steel.png`" contain height="20" width="20" class="mr-2" />
            <div>
              <div class="text-caption grey--text">鋼材</div>
              <div class="font-weight-bold body-2">{{ avgSteel }}</div>
            </div>
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="d-flex align-center pa-2 border rounded">
            <v-img :src="`./img/util/bauxite.png`" contain height="20" width="20" class="mr-2" />
            <div>
              <div class="text-caption grey--text">ボーキ</div>
              <div class="font-weight-bold body-2">{{ avgBauxite }}</div>
            </div>
          </div>
        </v-col>
      </v-row>
    </div>
  </v-card>
</template>

<script lang="ts">
import Vue from 'vue';
import { SimTotalResult } from '@/simulator/executor';

export default Vue.extend({
  name: 'SortieSimulationResult',
  props: {
    result: {
      type: Object as () => SimTotalResult,
      required: true,
    },
  },
  computed: {
    bossReachCount(): number {
      if (!this.result.nodes || this.result.nodes.length === 0) return 0;
      const lastNode = this.result.nodes[this.result.nodes.length - 1];
      return lastNode ? lastNode.num : 0;
    },
    bossReachRate(): string {
      const rate = (100 * this.bossReachCount) / this.result.totalnum;
      return rate.toFixed(1);
    },
    bossSRate(): string {
      if (this.bossReachCount === 0) return '0.0';
      const lastNode = this.result.nodes[this.result.nodes.length - 1];
      const rate = (100 * lastNode.ranks.S) / this.bossReachCount;
      return rate.toFixed(1);
    },
    bossFlagshipSinkRate(): string {
      if (this.bossReachCount === 0) return '0.0';
      const lastNode = this.result.nodes[this.result.nodes.length - 1];
      const count = lastNode.ranks.S + lastNode.ranks.A + lastNode.ranks.B;
      const rate = (100 * count) / this.bossReachCount;
      return rate.toFixed(1);
    },
    bossAOrBetterRate(): string {
      if (this.bossReachCount === 0) return '0.0';
      const lastNode = this.result.nodes[this.result.nodes.length - 1];
      const count = lastNode.ranks.S + lastNode.ranks.A;
      const rate = (100 * count) / this.bossReachCount;
      return rate.toFixed(1);
    },
    bossRanks(): any {
      if (this.bossReachCount === 0) {
        return { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
      }
      const lastNode = this.result.nodes[this.result.nodes.length - 1];
      const getPercent = (val: number) => Math.round((100 * val) / this.bossReachCount);
      return {
        S: getPercent(lastNode.ranks.S),
        A: getPercent(lastNode.ranks.A),
        B: getPercent(lastNode.ranks.B),
        C: getPercent(lastNode.ranks.C),
        D: getPercent(lastNode.ranks.D),
        E: getPercent(lastNode.ranks.E),
      };
    },
    avgBuckets(): string {
      const val = this.result.totalBuckets / this.result.totalnum;
      return val.toFixed(1);
    },
    avgFuel(): number {
      const total = this.result.totalFuelS + this.result.totalFuelR;
      return Math.round(total / this.result.totalnum);
    },
    avgRepairFuel(): number {
      return Math.round(this.result.totalFuelR / this.result.totalnum);
    },
    avgAmmo(): number {
      return Math.round(this.result.totalAmmoS / this.result.totalnum);
    },
    avgSteel(): number {
      return Math.round(this.result.totalSteelR / this.result.totalnum);
    },
    avgBauxite(): number {
      return Math.round(this.result.totalBauxS / this.result.totalnum);
    },
    nodeStats(): any[] {
      const stats = [];
      const { nodes, totalnum } = this.result;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const reached = node.num;
        const nextReached = nodes[i + 1] ? nodes[i + 1].num : 0;
        const retreated = i === nodes.length - 1 ? 0 : reached - nextReached;

        const getPercentOfReached = (val: number) => (reached > 0 ? Math.round((100 * val) / reached) : 0);

        stats.push({
          reached,
          reachRate: ((100 * reached) / totalnum).toFixed(1),
          retreated,
          retreatRate: reached > 0 ? ((100 * retreated) / reached).toFixed(1) : '0.0',
          ranks: {
            S: getPercentOfReached(node.ranks.S),
            A: getPercentOfReached(node.ranks.A),
          },
        });
      }
      return stats;
    },
    avgDamecon(): string {
      const val = (this.result.totalDameconUsed || 0) / this.result.totalnum;
      return val.toFixed(3);
    },
    maxDamecon(): number {
      return this.result.maxDameconUsed || 0;
    },
    avgGoddess(): string {
      const val = (this.result.totalGoddessUsed || 0) / this.result.totalnum;
      return val.toFixed(3);
    },
    maxGoddess(): number {
      return this.result.maxGoddessUsed || 0;
    },
    avgDmmCost(): string {
      const totalCost = (this.result.totalDameconUsed || 0) * 200 + (this.result.totalGoddessUsed || 0) * 500;
      const val = totalCost / this.result.totalnum;
      return val.toFixed(1);
    },
    hasDameconConsumption(): boolean {
      return (this.result.totalDameconUsed || 0) > 0 || (this.result.totalGoddessUsed || 0) > 0;
    },
  },
});
</script>

<style scoped>
.premium-sim-card {
  border-radius: 8px;
  background-color: #fafafa;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02) !important;
}
.theme--dark .premium-sim-card {
  background-color: #1e1e1e;
}
.stat-box {
  background-color: #ffffff;
  border-radius: 6px;
  transition: transform 0.2s ease;
}
.theme--dark .stat-box {
  background-color: #2c2c2c;
}
.stat-box:hover {
  transform: translateY(-2px);
}
.stat-label {
  font-size: 11px;
  color: #777;
}
.stat-val {
  font-size: 18px;
  font-weight: 800;
  font-family: 'Outfit', 'Roboto', sans-serif;
}
.bg-light-panel {
  background-color: #f1f3f4;
  border-radius: 6px;
}
.theme--dark .bg-light-panel {
  background-color: #252525;
}
.rank-bar {
  display: flex;
  font-size: 10px;
  color: white;
  text-align: center;
  font-weight: bold;
  line-height: 24px;
}
.rank-segment {
  height: 100%;
  transition: width 0.3s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-rank { background-color: #4caf50; }
.a-rank { background-color: #009688; }
.b-rank { background-color: #ff9800; }
.c-rank { background-color: #e91e63; }
.d-rank { background-color: #9c27b0; }
.e-rank { background-color: #f44336; }
.empty-rank { background-color: #9e9e9e; }
</style>
