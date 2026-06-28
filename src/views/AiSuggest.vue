<template>
  <v-container class="d-flex flex-column" :style="isSidebar ? 'height: 100%; max-width: 100%; background: white; margin: 0; padding: 12px; border-radius: 0; box-shadow: none;' : 'height: calc(100vh - 80px); max-width: 1000px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 10px;'">

    <div v-if="!isSidebar" class="d-flex align-center mb-3 px-2 pt-2">
      <div>
        <div class="text-h6 font-weight-bold">AI提督チャット ＆ 自律攻略エージェント</div>
        <div class="text-caption text--secondary">ルート・勝率を考慮した自律最適化を実行します</div>
      </div>
      <v-spacer />
      <v-btn outlined color="primary" small class="mr-2" @click="openSettings">
        <v-icon left small>mdi-cog</v-icon>AI設定
      </v-btn>
      <v-btn v-if="chatHistory.length > 0" outlined color="error" small @click="clearHistory">
        <v-icon left small>mdi-delete-sweep</v-icon>クリア
      </v-btn>
    </div>

    <!-- AI設定ダイアログ -->
    <v-dialog v-model="showSettingsDialog" max-width="500px">
      <v-card class="pa-4" style="border-radius: 12px;">
        <v-card-title class="text-h6 font-weight-bold">AI通信 ＆ モデル設定</v-card-title>
        <v-card-text class="pt-3">
          <v-select
            v-model="tempConfig.provider"
            :items="[
              { text: 'Gemini (クラウド高速AI / 推奨)', value: 'gemini' },
              { text: 'Ollama (ローカルLLM)', value: 'ollama' }
            ]"
            label="AIプロバイダー"
            outlined
            dense
            @change="onProviderChange"
          />
          <v-text-field
            v-if="tempConfig.provider === 'gemini'"
            v-model="tempConfig.apiKey"
            label="Gemini API Key"
            placeholder="AIzaSy..."
            outlined
            dense
            type="password"
            hint="Google AI Studioで無料発行できるAPIキーを入力してください"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="tempConfig.model"
            label="使用モデル名"
            outlined
            dense
            placeholder="gemini-2.5-flash または qwen3.5:9b-long"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showSettingsDialog = false">キャンセル</v-btn>
          <v-btn color="primary" class="font-weight-bold" @click="saveSettings">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card ref="chatWindow" class="flex-grow-1 overflow-y-auto pa-4 mb-3 d-flex flex-column" style="background: rgba(0, 0, 0, 0.02); border-radius: 12px; gap: 16px;" outlined>
      <div v-for="(msg, index) in chatHistory" :key="index" :class="['d-flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
        <v-card :color="msg.role === 'user' ? 'primary' : 'white'" :dark="msg.role === 'user'" class="pa-3" style="border-radius: 12px;" outlined>
          <div class="text-body-2" v-html="formatMessage(msg.message)"></div>
          <div v-if="msg.suggestion" class="mt-3 d-flex flex-wrap" style="gap: 6px;">
             <v-btn outlined x-small color="success" @click="applyFleetSuggestion(msg.suggestion)">計算機に反映</v-btn>
             <v-btn outlined x-small color="secondary" @click="runSimulationForMessage(index)">AI編成単体検証</v-btn>
             <v-btn outlined x-small color="warning" class="font-weight-bold" @click="runComparisonForMessage(index)">対振比較</v-btn>
          </div>
        </v-card>
      </div>
    </v-card>

    <v-card class="pa-3" outlined style="border-radius: 12px; background: white;">
      <!-- モード切替ボタン群 -->
      <div class="d-flex flex-wrap mb-2" style="gap: 6px;">
        <v-btn
          v-for="m in modes"
          :key="m.id"
          x-small
          :color="selectedMode === m.id ? 'primary' : undefined"
          :outlined="selectedMode !== m.id"
          @click="selectedMode = m.id"
          class="font-weight-bold"
        >
          <v-icon left x-small>{{ m.icon }}</v-icon>
          {{ m.label }}
        </v-btn>
      </div>

      <div class="d-flex align-center" style="gap: 8px;">
        <v-textarea
          v-model="inputMessage"
          :placeholder="currentPlaceholder"
          outlined
          dense
          auto-grow
          rows="1"
          hide-details
          @keydown.enter.exact.prevent="sendMessage"
        />
        <v-btn v-if="loading" color="error" class="font-weight-bold" @click="cancelOptimization">
          <v-icon left>mdi-stop</v-icon>探索を中断
        </v-btn>
        <v-btn v-else color="success" class="font-weight-bold" @click="startAutonomousOptimizationLoop">
          <v-icon left>mdi-flash</v-icon>自律攻略
        </v-btn>
        <v-btn color="primary" @click="sendMessage" :disabled="loading">送信</v-btn>
      </div>
    </v-card>
  </v-container>
</template>

<script lang="ts">
import Vue from 'vue';
import { ChatMessage, MultiFleetSuggestion, SimulationResult, AiConfig } from '@/ai/types';
import { chatWithAi } from '@/ai/client';
import { simulatorAdapter, AdapterSimulationContext } from '@/ai/adapter/simulatorAdapter';
import { fleetOptimizer } from '@/ai/optimizer/fleetOptimizer';
import { buildFleetContext } from '@/ai/fleetContext';
import { buildKnowledgeContext } from '@/ai/knowledge';
import { loadAiConfig, saveAiConfig } from '@/ai/storage';
import { applyMapAndEnemies } from '@/ai/utils';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';
import ShipValidation from '@/classes/fleet/shipValidation';
import Const from '@/classes/const';

export default Vue.extend({
  name: 'AiSuggest',
  props: {
    isSidebar: { type: Boolean, default: false },
  },
  data() {
    return {
      inputMessage: '',
      loading: false,
      loadingText: '',
      error: '',
      config: null as AiConfig | null,
      showSettingsDialog: false,
      tempConfig: {
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-2.5-flash',
      } as AiConfig,
      chatHistory: [] as ChatMessage[],
      simulationLoading: [] as boolean[],
      simulationResult: [] as any[],
      selectedMode: 'fleet',
      isCancelled: false,
      modes: [
        { id: 'fleet', label: '編成（編成+装備作成）', icon: 'mdi-ship-wheel', placeholder: '【編成モード】目的の海域や戦況（例：7-1 周回編成）を入力してください...' },
        { id: 'equip', label: '装備（装備換装）', icon: 'mdi-sword', placeholder: '【装備モード】換装したい艦娘や目標（例：空母の対空・FBAカットイン装備）を入力してください...' },
        { id: 'map', label: '海域（海域選定＋編成＋装備作成）', icon: 'mdi-map-search', placeholder: '【海域モード】攻略目的（例：EO海域攻略、資材節約周回）を入力してください...' },
        { id: 'adjust', label: '編成修正（現状からの調整）', icon: 'mdi-wrench', placeholder: '【編成修正モード】現在の編成に対する修正要望（例：制空権を確保しつつ対潜強化）を入力してください...' },
        { id: 'chat', label: '攻略解説（通常の会話）', icon: 'mdi-comment-text-outline', placeholder: '【攻略解説モード】疑問点や解説してほしい事柄（例：空母の1スロット目に艦攻を積む理由は？）を入力してください...' },
      ],
    };
  },
  computed: {
    setting(): any { return this.$store.state.siteSetting; },
    currentPlaceholder(): string {
      const mode = (this.modes as any[]).find((m) => m.id === this.selectedMode);
      return mode ? mode.placeholder : 'メッセージを入力...';
    },
  },
  async created() {
    this.config = await loadAiConfig();
    if (this.config) {
      this.tempConfig = { ...this.config };
    }
    if (!this.$store.state.cells || this.$store.state.cells.length === 0) {
      this.$store.dispatch('loadCellData');
    }
    if (!this.$store.state.ships || this.$store.state.ships.length === 0) {
      this.$store.dispatch('loadData');
    }
  },
  methods: {
    formatMessage(text: string): string {
      return text ? text.replace(/\n/g, '<br>') : '';
    },
    openSettings() {
      if (this.config) {
        this.tempConfig = { ...this.config };
      }
      this.showSettingsDialog = true;
    },
    onProviderChange(val: string) {
      if (val === 'gemini') {
        this.tempConfig.model = 'gemini-2.5-flash';
      } else if (val === 'ollama') {
        this.tempConfig.model = 'qwen3.5:9b-long';
      }
    },
    async saveSettings() {
      if (this.tempConfig.apiKey) {
        this.tempConfig.apiKey = this.tempConfig.apiKey.trim();
      }
      this.config = { ...this.tempConfig };
      await saveAiConfig(this.config);
      console.log('[KC-エージェント] ⚙️ AI設定を保存しました:', { provider: this.config.provider, model: this.config.model, hasApiKey: !!this.config.apiKey });
      this.showSettingsDialog = false;
    },
    saveHistoryToStorage() {
      localStorage.setItem('ai_fleet_chat_history', JSON.stringify(this.chatHistory));
    },
    clearHistory() {
      this.chatHistory = [];
      this.saveHistoryToStorage();
    },
    cancelOptimization() {
      this.isCancelled = true;
      this.loadingText = '探索を中断中...';
    },

    // --- 自律攻略機能 ---
    async startAutonomousOptimizationLoop() {
      if (!this.inputMessage.trim() || this.loading) return;
      const userText = this.inputMessage;
      this.inputMessage = '';
      this.loading = true;
      this.isCancelled = false;
      this.loadingText = '最適化探索中...';

      try {
        let { calcManager } = this.$store.state;
        if (!calcManager && this.$store.state.mainSaveData) {
          const { items, ships, siteSetting: setting } = this.$store.state;
          const enemies = this.$store.getters.getEnemies;
          calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
        }

        const fleetContext = await buildFleetContext(
          this.$store.state.shipStock,
          this.$store.state.ships,
          this.$store.state.itemStock,
          this.$store.state.items,
          this.$store.state.equipShips,
          userText,
          calcManager,
        );

        const knowledgeContext = await buildKnowledgeContext(userText);

        const handleStatusUpdate = (msg: string, suggestion?: MultiFleetSuggestion) => {
          this.chatHistory.push({
            role: 'model',
            message: msg,
            suggestion: suggestion || undefined,
          });
          this.saveHistoryToStorage();
          this.scrollToBottom();
        };

        const checkCancelled = () => this.isCancelled;

        const adapterContext: AdapterSimulationContext = {
          baseCalcManager: calcManager,
          ships: this.$store.state.ships,
          items: this.$store.state.items,
          shipStocks: this.$store.state.shipStock,
          itemStocks: this.$store.state.itemStock,
          cells: this.$store.state.cells,
          enemiesMaster: this.$store.getters.getEnemies,
          siteSetting: this.setting,
        };

        const bestSuggestion = await fleetOptimizer.optimize({
          config: this.config!,
          userRequest: userText,
          fleetContext,
          knowledgeContext,
          adapterContext,
          onStatusUpdate: handleStatusUpdate,
          checkCancelled,
        });

        if (bestSuggestion && !this.isCancelled) {
          this.chatHistory.push({
            role: 'model',
            message: '最適化探索が完了しました。最も勝率の高い編成を提示します。',
            suggestion: bestSuggestion,
          });
          this.saveHistoryToStorage();
        } else if (!this.isCancelled) {
          this.error = '探索を行いましたが、条件を満たす編成が見つかりませんでした。';
        }
      } catch (err) {
        this.error = '探索エラーが発生しました';
        console.error(err);
      } finally {
        this.loading = false;
        this.loadingText = '';
      }
    },

    async runSimulationForSuggestion(suggestion: MultiFleetSuggestion): Promise<SimulationResult> {
      let { calcManager } = this.$store.state;
      if (!calcManager && this.$store.state.mainSaveData) {
        const { items, ships, siteSetting: setting } = this.$store.state;
        const enemies = this.$store.getters.getEnemies;
        calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
      }

      let mapIdToApply = suggestion.mapId;
      if (!mapIdToApply) {
        const match = this.inputMessage.match(/([1-7])-([1-7])/) || (this.chatHistory.slice().reverse().find((m) => m.role === 'user')?.message || '').match(/([1-7])-([1-7])/);
        if (match) {
          mapIdToApply = parseInt(`${match[1]}${match[2]}`, 10);
        }
      }

      const adapterContext: AdapterSimulationContext = {
        baseCalcManager: calcManager,
        ships: this.$store.state.ships,
        items: this.$store.state.items,
        shipStocks: this.$store.state.shipStock,
        itemStocks: this.$store.state.itemStock,
        cells: this.$store.state.cells,
        enemiesMaster: this.$store.getters.getEnemies,
        siteSetting: this.setting,
      };

      return simulatorAdapter.executeSimulation(suggestion, adapterContext, mapIdToApply);
    },

    scrollToBottom() {
      Vue.nextTick(() => {
        const container = this.$refs.chatWindow as HTMLElement;
        if (container) container.scrollTop = container.scrollHeight;
      });
    },
    async sendMessage() {
      if (!this.config || !this.inputMessage.trim() || this.loading) return;

      const userText = this.inputMessage;
      this.inputMessage = '';
      this.error = '';
      this.loadingText = 'AI提督が考え中...';

      this.chatHistory.push({ role: 'user', message: userText });
      this.saveHistoryToStorage();
      this.scrollToBottom();
      this.loading = true;

      try {
        let { calcManager } = this.$store.state;
        if (!calcManager && this.$store.state.mainSaveData) {
          const { items, ships, siteSetting: setting } = this.$store.state;
          const enemies = this.$store.getters.getEnemies;
          calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
        }

        const fleetContext = await buildFleetContext(
          this.$store.state.shipStock,
          this.$store.state.ships,
          this.$store.state.itemStock,
          this.$store.state.items,
          this.$store.state.equipShips,
          userText,
          calcManager,
        );

        const searchTerms = this.chatHistory.filter((m) => m.role === 'user').map((m) => m.message).join(' ');
        const knowledgeContext = await buildKnowledgeContext(searchTerms);

        const aiResponse = await chatWithAi(this.config, this.chatHistory, fleetContext, knowledgeContext, this.selectedMode);

        if (aiResponse) {
          this.chatHistory.push(aiResponse);
          this.saveHistoryToStorage();
          if (aiResponse.suggestion) {
            this.runSimulationForMessage(this.chatHistory.length - 1);
          }
        } else {
          this.error = 'AIからの応答を取得できませんでした。';
        }
      } catch (err) {
        console.error('Chat API Error:', err);
        this.error = '通信中にエラーが発生しました。';
      } finally {
        this.loading = false;
        this.scrollToBottom();
      }
    },

    async runSimulationForMessage(index: number) {
      const msg = this.chatHistory[index];
      if (!msg || !msg.suggestion) return;

      const loadingArr = [...this.simulationLoading];
      loadingArr[index] = true;
      this.simulationLoading = loadingArr;

      try {
        let { calcManager } = this.$store.state;
        if (!calcManager && this.$store.state.mainSaveData) {
          const { items, ships, siteSetting: setting } = this.$store.state;
          const enemies = this.$store.getters.getEnemies;
          calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
        }

        let mapIdToApply = msg.suggestion.mapId;
        if (!mapIdToApply) {
          const userMsg = this.chatHistory.slice(0, index + 1).reverse().find((m) => m.role === 'user')?.message || '';
          const match = userMsg.match(/([1-7])-([1-7])/);
          if (match) mapIdToApply = parseInt(match[1] + match[2], 10);
        }

        const adapterContext: AdapterSimulationContext = {
          baseCalcManager: calcManager,
          ships: this.$store.state.ships,
          items: this.$store.state.items,
          shipStocks: this.$store.state.shipStock,
          itemStocks: this.$store.state.itemStock,
          cells: this.$store.state.cells,
          enemiesMaster: this.$store.getters.getEnemies,
          siteSetting: this.setting,
        };

        const result = await simulatorAdapter.executeSimulation(msg.suggestion, adapterContext, mapIdToApply);
        const resArr = [...this.simulationResult];
        resArr[index] = result;
        this.simulationResult = resArr;
      } catch (e) {
        console.error('Simulation error:', e);
        this.error = e instanceof Error ? e.message : 'シミュレーションエラー';
      } finally {
        const arr = [...this.simulationLoading];
        arr[index] = false;
        this.simulationLoading = arr;
      }
    },

    async runComparisonForMessage(index: number) {
      const msg = this.chatHistory[index];
      if (!msg || !msg.suggestion) return;

      this.loading = true;
      this.loadingText = '⚔️ 提督の現在編成 vs AI提案編成 を比較検証中 (各5000回出撃)...';

      try {
        let { calcManager } = this.$store.state;
        if (!calcManager && this.$store.state.mainSaveData) {
          const { items, ships, siteSetting: setting } = this.$store.state;
          const enemies = this.$store.getters.getEnemies;
          calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
        }

        let mapIdToApply = msg.suggestion.mapId;
        if (!mapIdToApply) {
          const userMsg = this.chatHistory.slice(0, index + 1).reverse().find((m) => m.role === 'user')?.message || '';
          const match = userMsg.match(/([1-7])-([1-7])/);
          if (match) mapIdToApply = parseInt(match[1] + match[2], 10);
        }

        const adapterContext: AdapterSimulationContext = {
          baseCalcManager: calcManager,
          ships: this.$store.state.ships,
          items: this.$store.state.items,
          shipStocks: this.$store.state.shipStock,
          itemStocks: this.$store.state.itemStock,
          cells: this.$store.state.cells,
          enemiesMaster: this.$store.getters.getEnemies,
          siteSetting: this.setting,
        };

        const compResult = await simulatorAdapter.compareFleets(msg.suggestion, adapterContext, mapIdToApply);

        const textReport = `
### 【対振比較シミュレーション結果（各5000回試行 / 夜戦ON）】
${compResult.summary}

| 比較項目 | 提督の現在編成 | AI提案の編成 | 差分 |
| :--- | :---: | :---: | :---: |
| **ボス到達率** | ${compResult.userFleetSim.bossReachRate}% | ${compResult.aiFleetSim.bossReachRate}% | ${Math.round((compResult.aiFleetSim.bossReachRate - compResult.userFleetSim.bossReachRate) * 10) / 10}% |
| **ボス旗艦撃破率** | **${compResult.userFleetSim.bossFlagshipSinkRate || 0}%** | **${compResult.aiFleetSim.bossFlagshipSinkRate || 0}%** | **${Math.round(((compResult.aiFleetSim.bossFlagshipSinkRate || 0) - (compResult.userFleetSim.bossFlagshipSinkRate || 0)) * 10) / 10}%** |
| **ボスS勝利率** | ${compResult.userFleetSim.bossSWinRate}% | ${compResult.aiFleetSim.bossSWinRate}% | ${compResult.diffSWinRate}% |
| **バケツ平均** | ${compResult.userFleetSim.bucketsUsed}個 | ${compResult.aiFleetSim.bucketsUsed}個 | - |
| **燃料/弾薬消費** | ${compResult.userFleetSim.fuelConsumed}/${compResult.userFleetSim.ammoConsumed} | ${compResult.aiFleetSim.fuelConsumed}/${compResult.aiFleetSim.ammoConsumed} | - |
        `.trim();

        this.chatHistory.push({
          role: 'model',
          message: textReport,
        });
        this.saveHistoryToStorage();
        this.scrollToBottom();
      } catch (err) {
        console.error('Comparison error:', err);
        this.error = '比較シミュレーション中にエラーが発生しました';
      } finally {
        this.loading = false;
        this.loadingText = '';
      }
    },
    openCompassSim(suggestion: MultiFleetSuggestion) {
      if (!suggestion || !suggestion.fleets || !suggestion.fleets.length) return;
      const shipMasters = this.$store.state.ships;
      const itemMasters = this.$store.state.items;

      const deck: any = { version: 4, hqlv: 120 };
      suggestion.fleets.forEach((fleetSuggest: any, fIdx: number) => {
        const fleetKey = `f${fIdx + 1}`;
        const fleetObj: any = { name: fleetSuggest.name || `第${fIdx + 1}艦隊`, t: 0 };
        const shipsArray = Array.isArray(fleetSuggest.ships) ? fleetSuggest.ships : [];

        shipsArray.forEach((shipSuggest: any, sIdx: number) => {
          const shipKey = `s${sIdx + 1}`;
          const cleanedShipName = (shipSuggest.name || '').split('(')[0].trim();
          const shipMaster = shipMasters.find((s: any) => s && (s.id === shipSuggest.shipId || s.name === cleanedShipName));
          if (!shipMaster) return;

          const shipData: any = { id: shipMaster.id, lv: 99, items: {} };
          const equipmentsArray = Array.isArray(shipSuggest.equipments) ? shipSuggest.equipments : [];
          let normalItemIdx = 1;

          equipmentsArray.forEach((eqName: string, eqIdx: number) => {
            const isEx = eqName.startsWith('補強増設:');
            const eqCleanName = eqName.replace('補強増設:', '').trim();
            const remodelMatch = eqCleanName.match(/★\+(\d+)/);
            const rf = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
            const baseEqName = eqCleanName.replace(/★\+\d+/, '').trim();

            let itemMaster = null;
            const { equipIds } = shipSuggest;
            if (Array.isArray(equipIds) && equipIds[eqIdx]) {
              const targetEqId = equipIds[eqIdx];
              itemMaster = itemMasters.find((i: any) => i && i.id === targetEqId);
            }
            if (!itemMaster) {
              itemMaster = itemMasters.find((i: any) => i && i.name === baseEqName);
            }

            if (itemMaster) {
              if (isEx) {
                shipData.items.ix = { id: itemMaster.id, rf };
              } else {
                shipData.items[`i${normalItemIdx}`] = { id: itemMaster.id, rf };
                normalItemIdx += 1;
              }
            }
          });
          fleetObj[shipKey] = shipData;
        });
        deck[fleetKey] = fleetObj;
      });

      const encoded = encodeURIComponent(JSON.stringify(deck));
      window.open(`https://x-20a.github.io/compass/?predeck=${encoded}`, '_blank');
    },
    applyFleetSuggestion(suggestion: MultiFleetSuggestion) {
      if (!suggestion || !suggestion.fleets || !suggestion.fleets.length) return;
      const { mainSaveData } = this.$store.state;
      if (!mainSaveData) {
        alert('計算機で編成が開かれていません。メイン画面で計算データを開いてください。');
        return;
      }

      const manager = mainSaveData.tempData[mainSaveData.tempIndex];
      if (!manager || !manager.fleetInfo || !manager.fleetInfo.fleets) return;

      const shipMasters = this.$store.state.ships;
      const itemMasters = this.$store.state.items;
      const { shipStock } = this.$store.state;

      // 💡 【海域IDの強靭な抽出】提案データ、全会話履歴、または既存艦隊データから海域IDを特定
      let mapIdToApply = suggestion.mapId;
      if (!mapIdToApply) {
        const userMsgs = this.chatHistory.filter((m) => m.role === 'user').map((m) => m.message);
        for (let i = userMsgs.length - 1; i >= 0; i -= 1) {
          const match = userMsgs[i].match(/([1-7])-([1-7])/);
          if (match) {
            mapIdToApply = parseInt(`${match[1]}${match[2]}`, 10);
            break;
          }
        }
      }
      if (!mapIdToApply && manager.battleInfo && manager.battleInfo.fleets[0] && manager.battleInfo.fleets[0].area) {
        mapIdToApply = manager.battleInfo.fleets[0].area;
      }
      if (!mapIdToApply) {
        mapIdToApply = 55; // 5-5 デフォルト補全
      }

      if (mapIdToApply) {
        applyMapAndEnemies(manager, mapIdToApply, this.$store.state.cells, this.$store.getters.getEnemies, itemMasters);
        if (manager.battleInfo && Array.isArray(manager.battleInfo.fleets)) {
          manager.battleInfo.fleets.forEach((f: any) => {
            f.selected = true;
            f.isActive = true;
            f.area = mapIdToApply;
          });
        }
      }

      suggestion.fleets.forEach((fleetSuggest, fIdx) => {
        if (fIdx >= manager.fleetInfo.fleets.length) return;

        const newShips: Ship[] = [];
        const shipsArray = Array.isArray(fleetSuggest.ships) ? fleetSuggest.ships : [];

        shipsArray.forEach((shipSuggest) => {
          if (!shipSuggest || !shipSuggest.name) return;

          const cleanedShipName = shipSuggest.name.split('(')[0].trim();
          const shipMaster = shipSuggest.shipId
            ? shipMasters.find((s: any) => s && s.id === shipSuggest.shipId)
            : shipMasters.find((s: any) => s && s.name === cleanedShipName);

          if (shipMaster) {
            const lvMatch = shipSuggest.name.match(/Lv(\d+)/);
            const level = lvMatch ? parseInt(lvMatch[1], 10) : 99;

            const normalItems: Item[] = [];
            let exItem = new Item();
            const equipmentsArray = Array.isArray(shipSuggest.equipments) ? shipSuggest.equipments : [];

            equipmentsArray.forEach((eqName: string) => {
              if (!eqName || typeof eqName !== 'string') return;
              const isExHeader = eqName.startsWith('補強増設:');
              const eqCleanName = eqName.replace('補強増設:', '').trim();

              const remodelMatch = eqCleanName.match(/★\+(\d+)/);
              const remodel = remodelMatch ? parseInt(remodelMatch[1], 10) : 0;
              const baseEqName = eqCleanName.replace(/★\+\d+/, '').trim();

              const itemMaster = itemMasters.find((i: any) => i && i.name === baseEqName);
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

            const slotCount = shipMaster.slotCount || 0;
            while (normalItems.length < slotCount) {
              const slotCap = Array.isArray(shipMaster.slots) ? shipMaster.slots[normalItems.length] : 0;
              normalItems.push(new Item({ slot: slotCap }));
            }

            const stockItem = Array.isArray(shipStock) ? shipStock.find((s: any) => s && s.id === shipMaster.id) : null;
            const releaseExpand = (exItem && exItem.data && exItem.data.id > 0) || (stockItem ? stockItem.releaseExpand : false);
            const area = stockItem ? stockItem.area || 0 : 0;

            const newShip = new Ship({
              master: shipMaster,
              level,
              items: normalItems,
              exItem,
              releaseExpand,
              area,
            });

            newShips.push(newShip);
          }
        });

        if (newShips.length > 0) {
          manager.fleetInfo.fleets[fIdx].ships = newShips;
        }
      });

      // 💡 【修正3: 基地航空隊の反映】提案に基地航空隊データが含まれる場合、計算機へ反映
      if (Array.isArray(suggestion.airbases) && manager.airbaseInfo && Array.isArray(manager.airbaseInfo.airbases)) {
        suggestion.airbases.forEach((abSuggest: any) => {
          if (!abSuggest) return;
          let abIdx = -1;
          if (typeof abSuggest.index === 'number') {
            abIdx = abSuggest.index;
          } else if (typeof abSuggest.id === 'number') {
            abIdx = abSuggest.id;
          }
          if (abIdx < 0 || abIdx >= manager.airbaseInfo.airbases.length) return;

          const targetAb = manager.airbaseInfo.airbases[abIdx];
          if (targetAb) {
            targetAb.mode = typeof abSuggest.mode === 'number' ? abSuggest.mode : 1; // 出撃モード
            if (Array.isArray(abSuggest.items)) {
              abSuggest.items.forEach((itemSuggest: any, itemIdx: number) => {
                if (!itemSuggest || itemIdx >= targetAb.items.length) return;
                const eqName = typeof itemSuggest === 'string' ? itemSuggest : itemSuggest.name;
                if (!eqName) return;
                const baseEqName = eqName.replace(/★\+\d+/, '').trim();
                const itemMaster = itemMasters.find((i: any) => i && i.name === baseEqName);
                if (itemMaster) {
                  targetAb.items[itemIdx] = new Item({ master: itemMaster, slot: itemMaster.airbaseMaxSlot || 18, level: 120 });
                }
              });
            }
          }
        });
      }

      mainSaveData.putHistory(manager);
      mainSaveData.saveManagerData();
      this.$store.commit('setCalcManager', manager);
      this.$store.commit('setMainSaveData', mainSaveData);
      alert('編成・海域・基地航空隊データを計算機メイン画面に正常に反映しました！');
    },
  },
});
</script>
