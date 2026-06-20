<template>
  <v-container
    class="d-flex flex-column"
    :style="isSidebar
      ? 'height: 100%; max-width: 100%; background: white; margin: 0; padding: 12px; border-radius: 0; box-shadow: none;'
      : 'height: calc(100vh - 80px); max-width: 1000px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 10px;'"
  >
    <!-- ヘッダー -->
    <div v-if="!isSidebar" class="d-flex align-center mb-3 px-2 pt-2">
      <div>
        <div class="text-h6 font-weight-bold">AI提督チャット</div>
        <div class="text-caption text--secondary">所持艦娘や装備、海域Wiki情報に基づき、最適な編成案をご提案します</div>
      </div>
      <v-spacer />
      <v-btn
        v-if="chatHistory.length > 0"
        outlined
        color="error"
        small
        @click="clearHistory"
      >
        <v-icon left small>mdi-delete-sweep</v-icon>
        会話をクリア
      </v-btn>
    </div>

    <!-- APIキー未設定アラート -->
    <v-card class="mb-4 pa-4" v-if="!hasApiKey" outlined>
      <v-alert type="warning" dense class="mb-0">
        AIを使用するにはAPIキーを設定してください。
        <v-btn text small color="primary" @click="$emit('showSiteSetting')">
          設定画面へ
        </v-btn>
      </v-alert>
    </v-card>

    <!-- チャットタイムライン -->
    <v-card
      ref="chatWindow"
      class="flex-grow-1 overflow-y-auto pa-4 mb-3 d-flex flex-column"
      style="background: rgba(0, 0, 0, 0.02); border-radius: 12px; gap: 16px;"
      outlined
    >
      <div v-if="chatHistory.length === 0" class="d-flex flex-column align-center justify-center my-auto py-10">
        <v-icon size="64" color="grey lighten-1">mdi-chat-question-outline</v-icon>
        <div class="text-subtitle-1 grey--text text--darken-1 font-weight-bold mt-2">
          AI提督への質問・相談を入力してください
        </div>
        <div class="text-body-2 grey--text text-center mt-1" style="max-width: 500px;">
          「5-3のPマス用の編成を3つ作って」「7-1の周回編成を提案して」「高速+編成のやり方は？」など、チャットに入力するだけで、海域Wikiのナレッジを自動で取得して回答します。
        </div>

        <!-- おすすめ質問チップ -->
        <div class="d-flex flex-wrap justify-center mt-6" style="gap: 8px; max-width: 600px;">
          <v-chip
            v-for="(q, idx) in recommendedQuestions"
            :key="idx"
            outlined
            color="primary"
            class="ma-1 font-weight-medium"
            style="cursor: pointer;"
            @click="sendRecommendedQuestion(q)"
            :disabled="!hasApiKey || loading"
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
        <!-- メッセージバブル -->
        <div :style="{ maxWidth: '90%' }">
          <v-card
            :color="msg.role === 'user' ? 'primary' : 'white'"
            :dark="msg.role === 'user'"
            :class="['pa-3', msg.role === 'user' ? 'rounded-br-0' : 'rounded-bl-0']"
            style="border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);"
            outlined
          >
            <!-- メッセージ本文 -->
            <div class="text-body-2 chat-text" v-html="formatMessage(msg.message)"></div>

            <!-- 編成提案の表示 -->
            <div v-if="msg.suggestion" class="mt-3">
              <v-divider class="my-2" :dark="msg.role === 'user'" />
              <div v-for="(fleet, fi) in msg.suggestion.fleets" :key="fi" class="mb-3">
                <div class="font-weight-bold text-subtitle-2 mb-1" :class="msg.role === 'user' ? 'white--text' : 'primary--text'">
                  【編成{{ fi + 1 }}】{{ fleet.comment }}
                </div>
                <v-simple-table dense class="elevation-1 rounded">
                  <template v-slot:default>
                    <thead>
                      <tr>
                        <th style="width: 50px;">隻</th>
                        <th style="width: 150px;">艦娘</th>
                        <th>装備構成</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="ship in fleet.ships" :key="ship.slot">
                        <td>{{ ship.slot }}</td>
                        <td class="font-weight-bold">{{ ship.name }}</td>
                        <td>{{ ship.equipments.join(' / ') }}</td>
                      </tr>
                    </tbody>
                  </template>
                </v-simple-table>
              </div>

              <!-- 全体コメント＆コピーボタン -->
              <div class="d-flex align-center justify-between mt-2 flex-wrap" style="gap: 8px;">
                <div class="text-caption grey--text text--darken-2" style="flex: 1;">
                  {{ msg.suggestion.comment }}
                </div>
                <v-btn
                  outlined
                  x-small
                  color="success"
                  @click="applyFleetSuggestion(msg.suggestion)"
                  :disabled="!$store.state.mainSaveData"
                  class="mr-2"
                >
                  <v-icon left x-small>mdi-import</v-icon>
                  計算機に反映
                </v-btn>
                <v-btn
                  outlined
                  x-small
                  color="primary"
                  @click="copyFleetSuggestion(msg.suggestion)"
                >
                  <v-icon left x-small>mdi-content-copy</v-icon>
                  編成をコピー
                </v-btn>
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <!-- ローディング/タイピング中 -->
      <div v-if="loading" class="d-flex justify-start">
        <v-card
          color="white"
          class="pa-3 rounded-bl-0 d-flex align-center"
          style="border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);"
          outlined
        >
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="ml-2 text-caption grey--text">AI提督が考え中...</span>
        </v-card>
      </div>
    </v-card>

    <!-- 入力エリア -->
    <v-card class="pa-2" outlined style="border-radius: 12px; background: white;">
      <div class="d-flex align-center" style="gap: 8px;">
        <v-textarea
          v-model="inputMessage"
          placeholder="AI提督にメッセージを送信... (Enterで送信 / Ctrl+Enterで改行)"
          outlined
          dense
          auto-grow
          rows="1"
          hide-details
          :disabled="!hasApiKey || loading"
          style="flex: 1;"
          @keydown.enter="handleEnterKey"
        />
        <v-btn
          color="primary"
          fab
          small
          :disabled="!hasApiKey || !inputMessage.trim() || loading"
          @click="sendMessage"
        >
          <v-icon>mdi-send</v-icon>
        </v-btn>
      </div>
    </v-card>

    <!-- エラー表示 -->
    <v-alert v-if="error" type="error" dismissible dense class="mt-2 mb-0">
      {{ error }}
    </v-alert>
  </v-container>
</template>

<script lang="ts">
import Vue from 'vue';
import { ChatMessage, AiConfig, MultiFleetSuggestion } from '@/ai/types';
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

export default Vue.extend({
  name: 'AiSuggest',
  props: {
    isSidebar: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      inputMessage: '',
      loading: false,
      chatHistory: [] as ChatMessage[],
      error: '',
      config: null as AiConfig | null,
      recommendedQuestions: [
        '5-3のPマス用のレベリング編成を3つ作って',
        '7-1の周回編成を提案して',
        '5-5のボス攻略用のおすすめ編成を教えて',
        '手持ちの駆逐艦で対潜性能の高い艦を教えて',
      ],
    };
  },
  computed: {
    hasApiKey(): boolean {
      return !!(this.config && this.config.provider !== 'none' && this.config.apiKey);
    },
  },
  async created() {
    this.config = await loadAiConfig();
    this.loadHistoryFromStorage();
  },
  methods: {
    loadHistoryFromStorage() {
      try {
        const stored = localStorage.getItem('ai_fleet_chat_history');
        if (stored) {
          this.chatHistory = JSON.parse(stored);
        }
      } catch (e) {
        console.error('Failed to load chat history', e);
      }
    },
    saveHistoryToStorage() {
      try {
        localStorage.setItem('ai_fleet_chat_history', JSON.stringify(this.chatHistory));
      } catch (e) {
        console.error('Failed to save chat history', e);
      }
    },
    formatMessage(text: string): string {
      if (!text) return '';
      // HTMLエスケープ
      let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 太字の簡易マークダウン変換
      escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // 改行をbrタグに変換
      escaped = escaped.replace(/\n/g, '<br>');

      return escaped;
    },
    handleEnterKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (!event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
    },
    async sendMessage() {
      if (!this.config || !this.inputMessage.trim() || this.loading) return;

      const userText = this.inputMessage;
      this.inputMessage = '';
      this.error = '';

      // ユーザーのメッセージを履歴に追加
      this.chatHistory.push({
        role: 'user',
        message: userText,
      });

      this.saveHistoryToStorage();
      this.scrollToBottom();
      this.loading = true;

      try {
        // コンテキスト（手持ちデータ・Wiki知識）の構築
        const fleetContext = buildFleetContext(
          this.$store.state.shipStock,
          this.$store.state.ships,
          this.$store.state.itemStock,
          this.$store.state.items,
          this.$store.state.equipShips,
          userText,
        );

        // 過去の会話も含めたWiki検索用のクエリを作成
        const searchTerms = this.chatHistory
          .filter((m) => m.role === 'user')
          .map((m) => m.message)
          .join(' ');
        const knowledgeContext = await buildKnowledgeContext(searchTerms);

        // AIとの通信
        const aiResponse = await chatWithAi(
          this.config,
          this.chatHistory,
          fleetContext,
          knowledgeContext,
        );

        if (aiResponse) {
          this.chatHistory.push(aiResponse);
          this.saveHistoryToStorage();
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
    sendRecommendedQuestion(question: string) {
      this.inputMessage = question;
      this.sendMessage();
    },
    clearHistory() {
      /* eslint-disable-next-line no-alert, no-restricted-globals */
      if (confirm('これまでの会話履歴をクリアしますか？')) {
        this.chatHistory = [];
        this.saveHistoryToStorage();
        this.error = '';
      }
    },
    scrollToBottom() {
      Vue.nextTick(() => {
        const container = this.$refs.chatWindow as HTMLElement;
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
        if (fIdx >= manager.fleetInfo.fleets.length) return;

        const newShips: Ship[] = [];

        for (let slotIdx = 0; slotIdx < 6; slotIdx += 1) {
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

      // Trigger recalculation
      manager.fleetInfo.calculated = false;

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
  line-height: 1.6;
}

/* タイピングアニメーション */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
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
