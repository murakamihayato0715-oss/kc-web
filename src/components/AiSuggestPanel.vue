<template>
  <v-card class="general-container my-2 pa-3" v-if="visible">
    <!-- ヘッダー -->
    <div class="d-flex align-center mb-2">
      <span class="font-weight-bold">AI提督チャット</span>
      <v-spacer />
      <v-btn
        v-if="chatHistory.length > 0"
        icon
        x-small
        color="error"
        class="mr-1"
        @click="clearHistory"
        title="会話をクリア"
      >
        <v-icon>mdi-delete-sweep</v-icon>
      </v-btn>
      <v-btn icon x-small @click="visible = false" title="閉じる">
        <v-icon>mdi-minus</v-icon>
      </v-btn>
    </div>
    <v-divider class="mb-2" />

    <!-- 未設定時 -->
    <div v-if="!hasApiKey">
      <v-alert type="warning" dense class="mb-0">
        APIキーが未設定です。
        <v-btn text x-small color="primary" @click="$router.push('/ai-settings')">設定へ</v-btn>
      </v-alert>
    </div>

    <!-- チャットコンテンツ -->
    <div v-else class="d-flex flex-column" style="gap: 8px;">
      <!-- メッセージ履歴（スクロールエリア） -->
      <div
        ref="chatTimeline"
        class="overflow-y-auto pa-1 d-flex flex-column"
        style="max-height: 250px; min-height: 80px; gap: 10px; background: rgba(0,0,0,0.02); border-radius: 6px;"
      >
        <div v-if="chatHistory.length === 0" class="text-caption grey--text text-center my-auto py-4">
          質問を入力するか、以下をタップ：
          <div class="d-flex flex-wrap justify-center mt-2" style="gap: 4px;">
            <v-chip
              v-for="(q, idx) in recommendedQuestions"
              :key="idx"
              x-small
              outlined
              color="primary"
              style="cursor: pointer;"
              @click="sendRecommended(q)"
              :disabled="loading"
            >
              {{ q }}
            </v-chip>
          </div>
        </div>

        <div
          v-for="(msg, index) in chatHistory"
          :key="index"
          :class="['d-flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <!-- バブル -->
          <div :style="{ maxWidth: '90%' }">
            <v-card
              :color="msg.role === 'user' ? 'primary' : 'grey lighten-4'"
              :dark="msg.role === 'user'"
              :class="['pa-2', msg.role === 'user' ? 'rounded-br-0' : 'rounded-bl-0']"
              style="border-radius: 8px; box-shadow: none;"
              outlined
            >
              <!-- 本文 -->
              <div class="text-caption chat-text" v-html="formatMessage(msg.message)"></div>

              <!-- 編成提案 -->
              <div v-if="msg.suggestion" class="mt-2">
                <v-divider class="my-1" :dark="msg.role === 'user'" />
                <div v-for="(fleet, fi) in msg.suggestion.fleets" :key="fi" class="mb-2">
                  <div class="text-caption font-weight-bold" :class="msg.role === 'user' ? 'white--text' : 'primary--text'">
                    編成{{ fi + 1 }}：{{ fleet.comment }}
                  </div>
                  <v-simple-table dense class="elevation-0 rounded border">
                    <template v-slot:default>
                      <thead>
                        <tr>
                          <th style="width: 30px; font-size: 10px; height: 24px; padding: 0 4px;">隻</th>
                          <th style="width: 80px; font-size: 10px; height: 24px; padding: 0 4px;">艦娘</th>
                          <th style="font-size: 10px; height: 24px; padding: 0 4px;">装備</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="ship in fleet.ships" :key="ship.slot" style="height: 24px;">
                          <td style="font-size: 10px; padding: 0 4px; height: 24px;">{{ ship.slot }}</td>
                          <td style="font-size: 10px; padding: 0 4px; height: 24px;" class="font-weight-bold">{{ ship.name }}</td>
                          <td style="font-size: 10px; padding: 0 4px; height: 24px;">{{ ship.equipments.join(' / ') }}</td>
                        </tr>
                      </tbody>
                    </template>
                  </v-simple-table>
                </div>
                <div class="d-flex align-center justify-end mt-1" style="gap: 6px;">
                  <v-btn
                    outlined
                    x-small
                    color="success"
                    style="height: 18px; font-size: 9px; padding: 0 4px;"
                    @click="applyFleetSuggestion(msg.suggestion)"
                    :disabled="!$store.state.mainSaveData"
                  >
                    反映
                  </v-btn>
                  <v-btn
                    outlined
                    x-small
                    color="primary"
                    style="height: 18px; font-size: 9px; padding: 0 4px;"
                    @click="copyFleetSuggestion(msg.suggestion)"
                  >
                    コピー
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </div>

        <!-- 考え中インジケーター -->
        <div v-if="loading" class="d-flex justify-start">
          <v-card color="grey lighten-4" class="pa-2 rounded-bl-0" style="border-radius: 8px;" outlined>
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </v-card>
        </div>
      </div>

      <!-- 入力・送信 -->
      <div class="d-flex align-center" style="gap: 4px;">
        <v-textarea
          v-model="request"
          placeholder="5-3 Pマス編成を3つ作って (Enterで送信)"
          outlined
          dense
          auto-grow
          rows="1"
          hide-details
          :disabled="loading"
          style="flex: 1;"
          @keydown.enter="handleEnterKey"
        />
        <v-btn
          color="primary"
          small
          fab
          depressed
          style="width: 32px; height: 32px; min-width: 32px;"
          :loading="loading"
          :disabled="!request.trim()"
          @click="suggest"
        >
          <v-icon small>mdi-send</v-icon>
        </v-btn>
      </div>

      <v-alert type="error" dense v-if="error" class="mt-1 mb-0" style="font-size: 11px;">
        {{ error }}
      </v-alert>
    </div>
  </v-card>

  <!-- 閉じている時のボタン -->
  <v-btn
    v-else
    class="general-container my-2"
    text
    small
    @click="visible = true"
  >
    AI提督チャットを開く
  </v-btn>
</template>

<script lang="ts">
import Vue from 'vue';
import { ChatMessage, MultiFleetSuggestion, AiConfig } from '@/ai/types';
import { loadAiConfig } from '@/ai/storage';
import { chatWithAi } from '@/ai/client';
import { buildFleetContext } from '@/ai/fleetContext';
import { buildKnowledgeContext } from '@/ai/knowledge';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';
import Fleet from '@/classes/fleet/fleet';
import SaveData from '@/classes/saveData/saveData';
import ShipMaster from '@/classes/fleet/shipMaster';
import ItemMaster from '@/classes/item/itemMaster';
import CalcManager from '@/classes/calcManager';
import Airbase from '@/classes/airbase/airbase';

export default Vue.extend({
  name: 'AiSuggestPanel',
  data() {
    return {
      visible: true,
      request: '',
      loading: false,
      chatHistory: [] as ChatMessage[],
      error: '',
      config: null as AiConfig | null,
      recommendedQuestions: ['7-1周回', '夜戦連撃の構成', '手持ち戦艦'],
    };
  },
  computed: {
    hasApiKey(): boolean {
      return !!(this.config && this.config.provider !== 'none' && this.config.apiKey);
    },
  },
  async created() {
    this.config = await loadAiConfig();
  },
  methods: {
    formatMessage(text: string): string {
      if (!text) return '';
      let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      escaped = escaped.replace(/\n/g, '<br>');
      return escaped;
    },
    handleEnterKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (!event.shiftKey) {
        event.preventDefault();
        this.suggest();
      }
    },
    async suggest() {
      if (!this.config || !this.request.trim()) return;

      const userText = this.request;
      this.request = '';
      this.error = '';
      this.loading = true;

      this.chatHistory.push({
        role: 'user',
        message: userText,
      });
      this.scrollToBottom();

      try {
        // 現在計算機にロードされている艦隊の計算値データを収集
        let currentFleetData: any = null;
        const mainSaveData = this.$store.state.mainSaveData as SaveData;
        if (mainSaveData) {
          const manager = mainSaveData.tempData[mainSaveData.tempIndex] as CalcManager;
          if (manager && manager.fleetInfo) {
            currentFleetData = {
              fleets: manager.fleetInfo.fleets.map((f: any) => {
                let speedText = '不明';
                if (f.speed === 10) speedText = '高速';
                else if (f.speed === 5) speedText = '低速';
                else if (f.speed === 15) speedText = '高速+';
                else if (f.speed === 20) speedText = '最速';

                return {
                  airPower: f.fullAirPower || 0,
                  los: f.los || 0,
                  speed: speedText,
                  ships: f.ships.map((s: any) => s.data.name || ''),
                };
              }),
            };
          }
        }

        const fleetContext = buildFleetContext(
          this.$store.state.shipStock,
          this.$store.state.ships,
          this.$store.state.itemStock,
          this.$store.state.items,
          this.$store.state.equipShips,
          userText,
          currentFleetData,
        );

        const searchTerms = this.chatHistory
          .filter((m) => m.role === 'user')
          .map((m) => m.message)
          .join(' ');
        const knowledgeContext = await buildKnowledgeContext(searchTerms);

        const res = await chatWithAi(this.config, this.chatHistory, fleetContext, knowledgeContext);
        if (res) {
          this.chatHistory.push(res);
        } else {
          this.error = 'AIからの応答を取得できませんでした。';
        }
      } catch (err) {
        this.error = 'エラーが発生しました。';
        console.error(err);
      } finally {
        this.loading = false;
        this.scrollToBottom();
      }
    },
    sendRecommended(q: string) {
      this.request = q;
      this.suggest();
    },
    clearHistory() {
      /* eslint-disable-next-line no-alert, no-restricted-globals */
      if (confirm('会話履歴をクリアしますか？')) {
        this.chatHistory = [];
        this.error = '';
      }
    },
    scrollToBottom() {
      Vue.nextTick(() => {
        const container = this.$refs.chatTimeline as HTMLElement;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    },
    copyFleetSuggestion(suggestion: MultiFleetSuggestion) {
      if (!suggestion) return;
      const lines: string[] = [suggestion.comment, ''];
      suggestion.fleets.forEach((fleet, i) => {
        lines.push(`■編成${i + 1}：${fleet.comment}`);
        fleet.ships.forEach((s) => {
          lines.push(`${s.slot}番艦: ${s.name} 装備: ${s.equipments.join(' / ')}`);
        });
        lines.push('');
      });
      navigator.clipboard.writeText(lines.join('\n'));
      /* eslint-disable-next-line no-alert */
      alert('編成データをクリップボードにコピーしました！');
    },
    applyFleetSuggestion(suggestion: MultiFleetSuggestion) {
      if (!suggestion || !suggestion.fleets || !suggestion.fleets.length) return;
      const mainSaveData = this.$store.state.mainSaveData as SaveData;
      if (!mainSaveData) {
        /* eslint-disable-next-line no-alert */
        alert('現在、計算機で編成が開かれていません。計算機で編成を作成するか、履歴から開いてから実行してください。');
        return;
      }

      const manager = mainSaveData.tempData[mainSaveData.tempIndex];
      if (!manager) return;

      const fleetSuggestList = suggestion.fleets;
      const shipMasters = this.$store.state.ships as ShipMaster[];
      const itemMasters = this.$store.state.items as ItemMaster[];

      fleetSuggestList.forEach((fleetSuggest, fIdx) => {
        // 第一艦隊(0)と第二艦隊(1)のみ対応。また、現在の計算機に第2艦隊が存在しない（通常艦隊編成など）場合はスルー
        if (fIdx >= manager.fleetInfo.fleets.length) return;

        const newShips: Ship[] = [];

        // 遊撃部隊の場合は最大7隻、通常は最大6隻スロットを埋める。AIが7番目の艦娘を提案している場合や、既に7隻以上編成されている場合は7隻とする。
        const has7thSuggest = fleetSuggest.ships.some((s) => s.slot === 7);
        const slotLimit = (manager.fleetInfo.fleets.length === 1 && fIdx === 0)
          ? Math.max(manager.fleetInfo.fleets[0].ships.length, has7thSuggest ? 7 : 6)
          : manager.fleetInfo.fleets[fIdx].ships.length;

        for (let slotIdx = 0; slotIdx < slotLimit; slotIdx += 1) {
          const slotNum = slotIdx + 1;
          const shipSuggest = fleetSuggest.ships.find((s) => s.slot === slotNum);
          if (!shipSuggest) {
            newShips.push(new Ship());
            continue;
          }

          // Match ship name
          const cleanedShipName = shipSuggest.name.split('(')[0].trim();
          const shipMaster = shipMasters.find((s) => s.name === cleanedShipName);

          if (!shipMaster) {
            newShips.push(new Ship());
            continue;
          }

          // Parse level
          const lvMatch = shipSuggest.name.match(/Lv(\d+)/);
          const level = lvMatch ? parseInt(lvMatch[1], 10) : 99;

          // Parse items
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

          // Add standard slot count items if missing
          while (normalItems.length < shipMaster.slotCount) {
            normalItems.push(new Item({ slot: shipMaster.slots[normalItems.length] }));
          }

          // Check releaseExpand status from shipStock
          const shipStock = this.$store.state.shipStock.find((s: any) => s.id === shipMaster.id);
          const releaseExpand = shipStock ? shipStock.releaseExpand : false;

          const builtShip = new Ship({
            master: shipMaster,
            level,
            items: normalItems,
            exItem,
            releaseExpand,
          });

          newShips.push(builtShip);
        }

        // Replace the fleet at index fIdx
        const currentFleet = manager.fleetInfo.fleets[fIdx];
        manager.fleetInfo.fleets[fIdx] = new Fleet({ fleet: currentFleet, ships: newShips });
      });

      // 基地航空隊の自動セット処理を追加
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
              newAbItems.push(new Item({
                master: itemMaster,
                slot: itemMaster.airbaseMaxSlot,
                remodel,
                level: 120, // 基地は熟練度最大で展開
              }));
            } else {
              newAbItems.push(new Item());
            }
          }

          // インスタンスを更新
          manager.airbaseInfo.airbases[abIdx] = new Airbase({
            airbase,
            items: newAbItems,
            mode: abSuggest.mode,
          });
        });
      }

      // Trigger recalculation
      manager.fleetInfo.calculated = false;
      manager.airbaseInfo.calculated = false;

      // Save to history and commit to store
      mainSaveData.putHistory(manager);
      mainSaveData.saveManagerData();

      const saveData = this.$store.state.saveData as SaveData;
      this.$store.dispatch('updateSaveData', saveData);
      this.$store.dispatch('setMainSaveData', mainSaveData);

      /* eslint-disable-next-line no-alert */
      alert('編成データを計算機に反映しました！');
    },
  },
});
</script>

<style scoped>
.chat-text {
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.4;
  font-size: 12px;
}

/* タイピングアニメーション */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 3px;
}
.typing-indicator span {
  width: 5px;
  height: 5px;
  background-color: #90a4ae;
  border-radius: 50%;
  display: inline-block;
  animation: bounce 1.3s infinite ease-in-out;
}
.typing-indicator span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing-indicator span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1.0);
    background-color: #1976d2;
  }
}
</style>
