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

    <!-- シミュレーション設定パネル -->
    <v-expansion-panels class="mb-3" flat>
      <v-expansion-panel class="border rounded-lg">
        <v-expansion-panel-header class="py-2 px-4 grey lighten-5">
          <div class="d-flex align-center">
            <v-icon color="primary" class="mr-2">mdi-cog-outline</v-icon>
            <span class="text-subtitle-2 font-weight-bold grey--text text--darken-3">シミュレーション設定</span>
            <v-spacer />
            <span class="text-caption grey--text mr-2" v-if="setting">
              モード: {{ setting.simSortieMode === 'consecutive' ? '連続周回' : '単発出撃' }} /
              大破挙動: {{ setting.simRetreatPolicy === 'retreat' ? '大破撤退' : setting.simRetreatPolicy === 'damecon' ? 'ダメコン進撃' : '大破進撃' }} /
              バケツ: {{ setting.simBucketHpPercent * 100 }}%
              {{ setting.simSubmarineDecoy ? ' / デコイ進撃' : '' }}
            </span>
          </div>
        </v-expansion-panel-header>
        <v-expansion-panel-content class="px-2 py-3 border-top">
          <v-row dense v-if="setting">
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="setting.simSortieMode"
                :items="sortieModeItems"
                label="出撃モード"
                dense
                outlined
                hide-details
                @change="saveSettings"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="setting.simRetreatPolicy"
                :items="retreatPolicyItems"
                label="大破時挙動"
                dense
                outlined
                hide-details
                @change="saveSettings"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="setting.simBucketHpPercent"
                :items="bucketHpItems"
                label="バケツ使用ライン"
                dense
                outlined
                hide-details
                @change="saveSettings"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model.number="setting.simBucketTime"
                type="number"
                label="許容修復時間 (分)"
                dense
                outlined
                hide-details
                suffix="分"
                @change="saveSettings"
              />
            </v-col>
          </v-row>

          <v-row dense v-if="setting" class="mt-2">
            <v-col cols="12">
              <v-checkbox
                v-model="setting.simSubmarineDecoy"
                label="潜水艦デコイ大破進撃を許可 (大破した潜水艦を撤退判定から除外)"
                dense
                hide-details
                @change="saveSettings"
                class="mt-0 font-weight-medium text-caption"
              />
            </v-col>
          </v-row>

          <!-- ダメコン所持情報および警告 -->
          <div class="d-flex align-center mt-3 flex-wrap text-caption" style="gap: 12px;" v-if="setting">
            <div class="grey--text text--darken-1 font-weight-medium">
              <v-icon small class="mr-1">mdi-shield-outline</v-icon>
              艦隊のダメコン装備数:
              <span class="font-weight-bold primary--text">要員 x{{ dameconCount.normal }}</span> /
              <span class="font-weight-bold success--text">女神 x{{ dameconCount.goddess }}</span>
            </div>
            <v-alert
              v-if="setting.simRetreatPolicy === 'damecon' && dameconCount.normal === 0 && dameconCount.goddess === 0"
              type="warning"
              dense
              class="mb-0 py-1 px-3 text-caption font-weight-bold"
              outlined
            >
              ⚠️ ダメコンが装備されていません。大破時は撤退扱いになります。
            </v-alert>
          </div>

          <!-- 陣形情報 -->
          <div class="mt-2 text-caption grey--text text--darken-1" v-if="customFormations.length > 0">
            <div class="font-weight-bold mb-1">
              <v-icon small class="mr-1">mdi-format-list-bulleted</v-icon>
              進行ルート陣形設定 (一時的オーバーライド)
            </div>
            <div class="d-flex flex-wrap align-center mt-1" style="gap: 8px;">
              <div v-for="(formVal, fIdx) in customFormations" :key="fIdx" style="width: 140px;">
                <v-select
                  v-model="customFormations[fIdx]"
                  :items="formations"
                  :label="`${fIdx + 1}戦目`"
                  dense
                  outlined
                  hide-details
                />
              </div>
            </div>
          </div>
        </v-expansion-panel-content>
      </v-expansion-panel>
    </v-expansion-panels>

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
              <div v-if="simulationResult[index]" class="mt-4">
                <SortieSimulationResult :result="simulationResult[index]" />
              </div>
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
                <v-btn outlined x-small color="success" @click="applyFleetSuggestion(msg.suggestion)" :disabled="!$store.state.mainSaveData" class="mr-2">
                  <v-icon left x-small>mdi-import</v-icon>
                  計算機に反映
                </v-btn>
                <v-btn outlined x-small color="primary" @click="copyFleetSuggestion(msg.suggestion)" class="mr-2">
                  <v-icon left x-small>mdi-content-copy</v-icon>
                  編成をコピー
                </v-btn>
                <v-btn outlined x-small color="secondary"
                        @click="runSimulationForMessage(index)"
                        :loading="simulationLoading[index]"
                        :disabled="!msg.suggestion || simulationLoading[index]">
                  シミュレーション実行
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
import { validateSuggestion, buildValidationMessage, validateInventory, applyEquipmentDowngrade } from '@/ai/suggestionValidator';
import Const from '@/classes/const';
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
import { runSortieSimulation } from '@/simulator/executor';
import { buildCalcManagerFromSuggestion } from '@/simulator/mapper';
import SortieSimulationResult from '@/components/result/SortieSimulationResult.vue';
import CalcManager from '@/classes/calcManager';
import EnemyMaster from '@/classes/enemy/enemyMaster';
import CellMaster from '@/classes/enemy/cellMaster';
import { applyMapAndEnemies } from '@/ai/utils';

export default Vue.extend({
  name: 'AiSuggest',
  components: { SortieSimulationResult },
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
      simulationLoading: [] as boolean[],
      simulationResult: [] as any[],
      customFormations: [] as number[],
    };
  },
  computed: {
    mainSaveDataId(): string {
      return this.$store.state.mainSaveData ? this.$store.state.mainSaveData.id : 'default';
    },
    hasApiKey(): boolean {
      return !!(this.config && (this.config.provider === 'mock' || (this.config.provider !== 'none' && this.config.apiKey)));
    },
    setting(): any {
      return this.$store.state.siteSetting;
    },
    activeCalcManager(): CalcManager | undefined {
      let manager = this.$store.state.calcManager as CalcManager | undefined;
      if (!manager && this.$store.state.mainSaveData) {
        const { items, ships } = this.$store.state;
        const enemies = this.$store.getters.getEnemies;
        manager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, this.setting.admiralLevel);
      }
      return manager;
    },
    dameconCount(): { normal: number; goddess: number } {
      let normal = 0;
      let goddess = 0;
      const manager = this.activeCalcManager;
      if (manager && manager.fleetInfo) {
        manager.fleetInfo.fleets.forEach((fleet, fIdx) => {
          if (fIdx > 1) return;
          fleet.ships.forEach((ship) => {
            if (!ship.isActive || ship.isEmpty) return;
            ship.items.forEach((item) => {
              if (item.data && item.data.id === 42) {
                normal += 1;
              }
              if (item.data && item.data.id === 43) {
                goddess += 1;
              }
            });
            if (ship.exItem && ship.exItem.data) {
              if (ship.exItem.data.id === 42) {
                normal += 1;
              }
              if (ship.exItem.data.id === 43) {
                goddess += 1;
              }
            }
          });
        });
      }
      return { normal, goddess };
    },
    nodeFormations(): string[] {
      const manager = this.activeCalcManager;
      if (!manager || !manager.battleInfo || !manager.battleInfo.fleets) return [];
      const formationNames: string[] = [];
      for (let index = 0; index < manager.battleInfo.fleets.length; index += 1) {
        const formationIds = manager.battleInfo.fleets[index].mainFleetFormation;
        const form = Const.FORMATIONS.find((v) => v.value === formationIds);
        if (form) {
          formationNames.push(`${this.$t(`Common.${form.text}`)}`);
        } else {
          formationNames.push('-');
        }
      }
      return formationNames;
    },
    sortieModeItems(): any[] {
      return [
        { text: '単発出撃 (毎回HP・疲労回復)', value: 'single' },
        { text: '連続周回 (ダメージ・疲労蓄積)', value: 'consecutive' },
      ];
    },
    retreatPolicyItems(): any[] {
      return [
        { text: '大破撤退 (ダメコン無視)', value: 'retreat' },
        { text: 'ダメコン進撃 (ダメコン消費/無ければ撤退)', value: 'damecon' },
        { text: '大破進撃 (常に進撃)', value: 'advance' },
      ];
    },
    bucketHpItems(): any[] {
      return [
        { text: '使用しない (0%)', value: 0 },
        { text: '大破以下 (25%)', value: 0.25 },
        { text: '中破以下 (50%)', value: 0.5 },
        { text: '小破以下 (75%)', value: 0.75 },
        { text: '少しでも削れたら (99%)', value: 0.99 },
      ];
    },
    formations(): any[] {
      return Const.FORMATIONS.map((f) => ({
        text: this.$t ? `${this.$t(`Common.${f.text}`)}` : f.text,
        value: f.value,
      }));
    },
  },
  watch: {
    mainSaveDataId: {
      handler() {
        this.loadHistoryFromStorage();
      },
      immediate: true,
    },
    activeCalcManager: {
      handler(newVal) {
        if (newVal && newVal.battleInfo && newVal.battleInfo.fleets) {
          if (this.customFormations.length !== newVal.battleInfo.fleets.length) {
            this.customFormations = newVal.battleInfo.fleets.map((f: any) => f.mainFleetFormation);
          }
        } else {
          this.customFormations = [];
        }
      },
      immediate: true,
      deep: true,
    },
  },
  async created() {
    this.config = await loadAiConfig();
  },
  methods: {
    loadHistoryFromStorage() {
      try {
        const key = `ai_fleet_chat_history_${this.mainSaveDataId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          this.chatHistory = JSON.parse(stored);
        } else {
          // If no history exists for this specific ID, check if there is an old global history to import
          const oldGlobal = localStorage.getItem('ai_fleet_chat_history');
          if (oldGlobal && this.mainSaveDataId === 'default') {
            this.chatHistory = JSON.parse(oldGlobal);
          } else {
            this.chatHistory = [];
          }
        }
        // Reset simulation states for the new history
        this.simulationLoading = new Array(this.chatHistory.length).fill(false);
        this.simulationResult = new Array(this.chatHistory.length).fill(null);
      } catch (e) {
        console.error('Failed to load chat history', e);
      }
    },
    saveHistoryToStorage() {
      try {
        const key = `ai_fleet_chat_history_${this.mainSaveDataId}`;
        localStorage.setItem(key, JSON.stringify(this.chatHistory));
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

        let currentSuggestion = aiResponse ? aiResponse.suggestion : undefined;
        let currentMessage = aiResponse ? aiResponse.message : '';
        let finalResponse = aiResponse;

        if (aiResponse && currentSuggestion) {
          let retryCount = 0;
          const maxRetries = 2;
          let downgradeNotes: string[] = [];

          while (retryCount <= maxRetries) {
            // 1. Apply Equipment Downgrade
            const downgradeResult = applyEquipmentDowngrade(
              currentSuggestion,
              this.$store.state.itemStock,
              this.$store.state.items,
            );
            currentSuggestion = downgradeResult.suggestion;
            downgradeNotes = downgradeResult.notes;

            // 2. Validate
            let enemyAirPower: number | undefined;
            if (calcManager && calcManager.battleInfo && calcManager.battleInfo.fleets && calcManager.battleInfo.fleets.length > 0) {
              const { fleets } = calcManager.battleInfo;
              const lastFleet = fleets[fleets.length - 1];
              if (lastFleet) {
                enemyAirPower = lastFleet.fullAirPower || 0;
              }
            }

            const validationResult = validateSuggestion(
              currentSuggestion,
              this.$store.state.itemStock,
              this.$store.state.items,
              this.$store.state.ships,
              this.$store.state.shipStock,
              enemyAirPower,
            );

            const validationMsg = buildValidationMessage(validationResult);

            if (validationResult.isValid) {
              // Valid! Construct final messages and break
              let msg = validationMsg;
              if (downgradeNotes.length > 0) {
                msg += `\n\n**📋 自動代用情報**\n${downgradeNotes.map((n) => `- ${n}`).join('\n')}`;
              }
              currentMessage += msg;
              break;
            } else if (retryCount < maxRetries) {
              retryCount += 1;

              // Add retry message to history
              const retryPrompt = `【システム・ガードレール検知: 以下のエラーを修正してください】${validationMsg}\n\n上記の在庫不足エラーや制空値不足を修正した新しい編成案を出力してください。`;

              // Temporarily push the current AI response so chatWithAi has context of what it previously proposed
              const tempAiMsg: ChatMessage = { role: 'model', message: currentMessage, suggestion: currentSuggestion };
              const tempUserMsg: ChatMessage = { role: 'user', message: retryPrompt };

              const tempHistory: ChatMessage[] = [...this.chatHistory, tempAiMsg, tempUserMsg];

              /* eslint-disable-next-line no-await-in-loop */
              const retryResponse = await chatWithAi(
                this.config,
                tempHistory,
                fleetContext,
                knowledgeContext,
              );

              if (retryResponse) {
                currentSuggestion = retryResponse.suggestion;
                currentMessage = retryResponse.message;
                finalResponse = retryResponse;
              } else {
                // If retry API failed or returned empty, stop retry loop
                let msg = validationMsg;
                if (downgradeNotes.length > 0) {
                  msg += `\n\n**📋 自動代用情報**\n${downgradeNotes.map((n) => `- ${n}`).join('\n')}`;
                }
                currentMessage += msg;
                break;
              }
            } else {
              // Out of retries. Keep the last one and append validation message
              let msg = validationMsg;
              if (downgradeNotes.length > 0) {
                msg += `\n\n**📋 自動代用情報**\n${downgradeNotes.map((n) => `- ${n}`).join('\n')}`;
              }
              currentMessage += msg;
              break;
            }
          }

          if (finalResponse) {
            finalResponse.suggestion = currentSuggestion;
            finalResponse.message = currentMessage;
            this.chatHistory.push(finalResponse);
            this.saveHistoryToStorage();
            // AI の提案が届いたら自動でシミュレーションを実行
            const idx = this.chatHistory.length - 1;
            this.runSimulationForMessage(idx);
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

      // NEW: 在庫バリデーション
      const errors = validateInventory(
        suggestion,
        this.$store.state.itemStock,
        this.$store.state.items,
      );

      if (errors.length > 0) {
        const errorDetails = errors.map((err) => {
          const starText = err.remodel > 0 ? `★+${err.remodel}` : '';
          return `・${err.itemName}${starText}: 必要 ${err.required} 個 / 所持 ${err.available} 個`;
        }).join('\n');

        /* eslint-disable-next-line no-alert, no-restricted-globals */
        if (!confirm(`【警告】以下の装備が在庫不足です。反映を続行しますか？\n\n${errorDetails}`)) {
          return;
        }
      }

      const fleetSuggestList = suggestion.fleets;
      const shipMasters = this.$store.state.ships as ShipMaster[];
      const itemMasters = this.$store.state.items as ItemMaster[];

      // Apply map and enemies if mapId is suggested
      if (suggestion.mapId) {
        const cells = this.$store.state.cells as CellMaster[];
        const enemies = this.$store.getters.getEnemies as EnemyMaster[];
        applyMapAndEnemies(manager, suggestion.mapId, cells, enemies, itemMasters);
      }

      // Rename preset name if presetName is suggested
      if (suggestion.presetName) {
        mainSaveData.name = suggestion.presetName;
      }

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
    async runSimulationForMessage(index: number) {
      const msg = this.chatHistory[index];
      if (!msg || !msg.suggestion) return;

      // リアクティブな配列を更新
      const loadingArr = [...this.simulationLoading];
      loadingArr[index] = true;
      this.simulationLoading = loadingArr;

      const resultArr = [...this.simulationResult];
      resultArr[index] = null;
      this.simulationResult = resultArr;

      try {
        let { calcManager } = this.$store.state;
        if (!calcManager && this.$store.state.mainSaveData) {
          const { items, ships, siteSetting: setting } = this.$store.state;
          const enemies = this.$store.getters.getEnemies;
          calcManager = this.$store.state.mainSaveData.loadManagerData(items, ships, enemies, setting.admiralLevel);
        }
        const manager = buildCalcManagerFromSuggestion(
          calcManager as CalcManager,
          msg.suggestion,
          this.$store.state.ships as any[],
          this.$store.state.items as any[],
          this.$store.state.shipStock as any[],
        );
        const itemStock = this.$store.state.itemStock as any[];
        const findStockCount = (id: number) => {
          const s = itemStock.find((v) => v.id === id);
          return s ? s.num.reduce((a: number, b: number) => a + b, 0) : 0;
        };
        const simSettings = {
          sortieMode: this.setting.simSortieMode,
          retreatPolicy: this.setting.simRetreatPolicy,
          bucketHpPercent: this.setting.simBucketHpPercent,
          bucketTime: this.setting.simBucketTime,
          dameconStock: findStockCount(42),
          goddessStock: findStockCount(43),
          customFormations: this.customFormations,
          submarineDecoy: this.setting.simSubmarineDecoy,
        };
        const result = await runSortieSimulation(manager, 5000, simSettings);
        const resArr = [...this.simulationResult];
        resArr[index] = result;
        this.simulationResult = resArr;
      } catch (e) {
        console.error('Simulation error:', e);
      } finally {
        const arr = [...this.simulationLoading];
        arr[index] = false;
        this.simulationLoading = arr;
      }
    },
    saveSettings() {
      this.$store.dispatch('updateSetting', this.setting);
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
