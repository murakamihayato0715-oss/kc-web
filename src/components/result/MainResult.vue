<template>
  <v-card class="my-2 px-1 py-2" id="result-container" :class="{ captured: capturing }">
    <div class="d-flex pb-1">
      <div class="pl-2 align-self-center">{{ $t("Result.計算結果") }}</div>
      <v-spacer />
      <v-tooltip bottom color="black">
        <template v-slot:activator="{ on, attrs }">
          <v-btn icon @click="refresh" v-bind="attrs" v-on="on">
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
        </template>
        <span>{{ $t("Result.再計算") }}</span>
      </v-tooltip>
      <v-tooltip bottom color="black">
        <template v-slot:activator="{ on, attrs }">
          <v-btn icon @click="captureResult" v-bind="attrs" v-on="on">
            <v-icon>mdi-camera</v-icon>
          </v-btn>
        </template>
        <span>{{ $t("Common.スクリーンショットを保存") }}</span>
      </v-tooltip>
      <v-tooltip bottom color="black">
        <template v-slot:activator="{ on, attrs }">
          <v-btn icon @click="handleMinimize(true)" v-bind="attrs" v-on="on">
            <v-icon>mdi-minus</v-icon>
          </v-btn>
        </template>
        <span>{{ $t("Common.最小化") }}</span>
      </v-tooltip>
    </div>
    <v-divider class="mb-3" />
    <v-alert border="left" dense outlined type="info" class="ma-1 ma-sm-3 body-2" v-if="!moreCalculateRequested && !capturing">
      <div class="d-flex flex-wrap">
        <div class="align-self-center">
          {{ $t("Result.出撃x回分の計算結果が表示されています。", { number: calculateCount.toLocaleString() }) }}
        </div>
        <div class="align-self-center ml-2">
          <v-btn small color="primary" @click="calculateMore()" :disabled="moreCalculateRequested">
            {{ $t("Result.再計算して精度を上げる") }}
          </v-btn>
        </div>
      </div>
    </v-alert>
    <v-alert border="left" dense outlined type="warning" class="ma-1 ma-sm-3 body-2" v-if="existUnknownEnemy">
      <div>{{ $t("Enemies.搭載数が未確定の敵艦が含まれています。") }}{{ $t("Result.計算結果が実際の制空状態と異なる可能性があります。") }}</div>
    </v-alert>
    <div class="px-1 px-sm-3 scrollable-table">
      <div class="d-flex flex-wrap">
        <div class="body-2">{{ $t("Result.戦闘開始時の搭載数推移") }}</div>
        <div class="caption ml-auto" v-show="!capturing">※ {{ $t("Result.行クリックで詳細計算画面展開") }}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="text-center">{{ $t("Fleet.艦娘") }}</th>
            <th class="text-center">{{ $t("Fleet.装備") }}</th>
            <th v-for="i in battleCount" :key="i" :class="`td-battle${i - 1}`">{{ $t("Enemies.x戦目", { number: i }) }}</th>
            <th class="pl-1 pl-sm-0">{{ $t("Result.出撃後") }}</th>
            <th class="pl-1 pl-sm-0">{{ $t("Result.全滅率") }}</th>
            <th class="pl-1 pl-sm-0 pr-1">{{ $t("Result.棒立ち率") }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(ship, i) in tableData">
            <tr v-for="(item, j) in ship.items" :key="`${i}-${j}`" class="cursor-pointer" @click="clickedShipRow(ship.index)">
              <td class="td-ship-name" v-if="j === 0" :rowspan="ship.items.length">
                {{ getShipName(ship.data) }}
              </td>
              <td :class="`text-left item-input type-${item.data.iconTypeId}`">
                <div class="d-flex">
                  <div class="px-0 px-md-1">
                    <v-img :src="`./img/type/icon${item.data.iconTypeId}.png`" height="25" width="25" />
                  </div>
                  <div class="align-self-center item-name text-truncate">
                    {{ needTrans ? $t(`${item.data.name}`) : item.data.name }}
                  </div>
                </div>
              </td>
              <td v-for="k in battleCount" :key="k" :class="`td-battle${k - 1}`">{{ item.slotHistories[k - 1] }}</td>
              <td>{{ item.slotResult }}</td>
              <td>{{ item.deathRate > 0 ? `${item.deathRate} %` : "-" }}</td>
              <td class="pr-1" v-if="j === 0" :rowspan="ship.items.length" :class="{ 'is-not-cv': !ship.data.isCV }">
                {{ ship.allDeathRate > 0 ? `${ship.allDeathRate} %` : "-" }}
              </td>
            </tr>
          </template>
          <tr>
            <td class="text-center text-no-wrap" rowspan="2">{{ $t("Common.制空値") }}({{ $t("Common.平均") }})</td>
            <td class="text-center py-1">{{ $t("Fleet.自艦隊") }}</td>
            <td v-for="(result, i) in results" :key="i" class="pr-md-1" :class="`td-battle${i}`">{{ result.avgAirPower }}</td>
            <td class="text-center header-td" colspan="3">
              {{ $t("Result.消費予測") }}<span v-if="hasBattleAirbase" class="ml-1">( {{ $t("Result.基地") }} )</span>
            </td>
          </tr>
          <tr>
            <td class="text-center py-1">{{ $t("Enemies.敵艦隊") }}</td>
            <td v-for="(result, i) in results" :key="i" class="pr-md-1" :class="`td-battle${i}`">
              <span :class="{ 'orange--text text--darken-2': result.isUnknownEnemyAirPower }">
                {{ result.avgEnemyAirPower }}
                {{ result.isUnknownEnemyAirPower ? "?" : "" }}
              </span>
            </td>
            <td colspan="3">
              <div class="d-flex justify-center">
                <div><v-img :src="`./img/util/fuel.png`" height="20" width="20" /></div>
                <div class="resource-value">{{ sumFuelAndAmmo[0] }}</div>
                <div v-if="hasBattleAirbase" class="resource-value ml-1">( {{ totalAirbaseResource[0] }} )</div>
              </div>
            </td>
          </tr>
          <tr class="tr-status">
            <td class="text-center" colspan="2">{{ $t("Result.制空") }}</td>
            <td v-for="(result, i) in results" :key="i" :class="`td-battle${i}`">
              <span :class="`state-label state-${result.airState.value}`">{{ $t(`Common.${result.airState.text}`) }}</span>
            </td>
            <td colspan="3" class="border-top-none">
              <div class="d-flex justify-center">
                <div><v-img :src="`./img/util/ammo.png`" height="20" width="20" /></div>
                <div class="resource-value">{{ sumFuelAndAmmo[1] }}</div>
                <div v-if="hasBattleAirbase" class="resource-value ml-1">( {{ totalAirbaseResource[1] }} )</div>
              </div>
            </td>
          </tr>
          <tr class="tr-status">
            <td class="text-center" colspan="2">{{ $t("Common.陣形") }}</td>
            <td v-for="(formation, i) in formationNames" :key="i" :class="`td-battle${i}`">{{ formation }}</td>
            <td colspan="3" class="border-top-none">
              <div class="d-flex justify-center">
                <div><v-img :src="`./img/util/steel.png`" height="20" width="20" /></div>
                <div class="resource-value">{{ calcSteel }}</div>
                <div v-if="hasBattleAirbase" class="resource-value ml-1">( {{ totalAirbaseResource[2] }} )</div>
              </div>
            </td>
          </tr>
          <tr class="tr-status tr-fuel-ammo">
            <td class="text-center" colspan="2">{{ $t("Common.燃料") }} &amp; {{ $t("Common.弾薬") }}</td>
            <td v-for="(row, i) in remainingFuelAndAmmos" :key="i" :class="`td-battle${i}`">
              <div
                class="d-flex flex-wrap justify-end"
                @mouseenter="bootTooltip(row.fuel.value, row.ammo.value, $event)"
                @mouseleave="clearTooltip"
                @focus="bootTooltip(row.fuel.value, row.ammo.value, $event)"
                @blur="clearTooltip"
              >
                <div class="d-flex">
                  <v-img :src="`./img/util/fuel.png`" height="20" width="20" />
                  <div class="align-self-center ml-0_5" :class="row.fuel.color">{{ row.fuel.value }}%</div>
                </div>
                <div class="d-flex">
                  <v-img :src="`./img/util/ammo.png`" height="20" width="20" />
                  <div class="align-self-center ml-0_5" :class="row.ammo.color">{{ row.ammo.value }}%</div>
                </div>
              </div>
            </td>
            <td colspan="3" class="border-top-none">
              <div class="d-flex justify-center">
                <div><v-img :src="`./img/util/bauxite.png`" height="20" width="20" /></div>
                <div class="resource-value">{{ calcBauxite }}</div>
                <div v-if="hasBattleAirbase" class="resource-value ml-1">( {{ totalAirbaseResource[3] }} )</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <v-divider />
    </div>
    <v-tabs v-model="tab" class="px-1 px-sm-3" show-arrows center-active>
      <v-tab v-for="(enemyFleet, i) in battles" :key="i" :href="`#battle${i}`" @click="changedTab(i)">{{ $t("Enemies.x戦目", { number: i + 1 }) }}</v-tab>
    </v-tabs>
    <v-divider class="mx-3" />
    <div class="d-flex px-1 px-sm-3 mt-6">
      <div>
        <v-select
          class="form-input"
          v-model="fleet.formation"
          :items="formations"
          :label="$t('Common.陣形')"
          hide-details
          dense
          @change="changedFormation(fleet.formation)"
        />
      </div>
      <v-tooltip bottom color="black">
        <template v-slot:activator="{ on, attrs }">
          <v-icon class="align-self-center ml-3" small v-bind="attrs" v-on="on">mdi-help-circle-outline</v-icon>
        </template>
        <div class="caption">
          <div>{{ $t("Result.このマスで選択する味方艦隊の陣形") }}</div>
        </div>
      </v-tooltip>
    </div>
    <v-card class="mx-1 mx-sm-3 my-2 py-3 pr-2 pr-sm-4 pl-2">
      <div class="d-flex mt-1">
        <div class="bar-label" />
        <div class="flex-grow-1 d-flex">
          <div class="status-bar-label" style="width: 10%">
            <div>{{ $t("Common.喪失") }}</div>
          </div>
          <div class="status-bar-divide" />
          <div class="status-bar-label" style="width: 10%">
            <div>{{ $t("Common.劣勢") }}</div>
          </div>
          <div class="status-bar-divide" />
          <div class="status-bar-label" style="width: 25%">
            <div>{{ $t("Common.拮抗") }}</div>
          </div>
          <div class="status-bar-divide" />
          <div class="status-bar-label" style="width: 45%">
            <div>{{ $t("Common.優勢") }}</div>
          </div>
          <div class="status-bar-divide" />
          <div class="status-bar-label" style="width: 10%">
            <div>{{ $t("Common.確保") }}</div>
          </div>
        </div>
      </div>
      <div
        v-for="(ab, i) in airbaseWaveResults"
        :key="i"
        class="pb-1 cursor-pointer"
        @click="clickedAirbaseRow(ab.baseIndex)"
        @keypress.enter="clickedAirbaseRow(ab.baseIndex)"
      >
        <div class="d-flex">
          <div class="bar-label">{{ ab.text }}</div>
          <div class="align-self-center flex-grow-1">
            <air-status-result-bar :result="ab.result" :no-label="true" />
          </div>
        </div>
      </div>
      <div class="d-flex mt-2">
        <div class="bar-label">{{ $t("Result.本隊") }}</div>
        <div class="align-self-center flex-grow-1">
          <air-status-result-bar :result="fleet.mainResult" :no-label="true" />
        </div>
      </div>
    </v-card>
    <v-card class="mx-1 mx-sm-3 my-2 py-3 px-2">
      <div class="body-2 px-2 mb-1">{{ $t("Result.各フェーズ制空状態の確率") }}</div>
      <div class="scrollable-table">
        <table>
          <thead>
            <tr>
              <th />
              <th class="pr-1">{{ $t("Common.制空値") }}</th>
              <th class="pr-1">
                {{ $t("Common.敵制空値") }}( {{ $t("Common.確保") }} / {{ $t("Common.優勢") }} / {{ $t("Common.拮抗") }} / {{ $t("Common.劣勢") }})
              </th>
              <th class="pr-1">{{ $t("Common.確保") }}</th>
              <th class="pr-1">{{ $t("Common.優勢") }}</th>
              <th class="pr-1">{{ $t("Common.拮抗") }}</th>
              <th class="pr-1">{{ $t("Common.劣勢") }}</th>
              <th class="pr-1">{{ $t("Common.喪失") }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(ab, i) in airbaseWaveResults" :key="`${i}`" class="cursor-pointer" @click="clickedAirbaseRow(ab.baseIndex)">
              <td class="text-no-wrap pr-1">{{ ab.text }}</td>
              <td class="text-no-wrap pr-1">{{ ab.result.avgAirPower }}</td>
              <td class="text-no-wrap pr-1">{{ airPowerBorders(ab.result.avgEnemyAirPower) }}</td>
              <td v-for="(rate, j) in ab.result.rates" :key="`${i}-${j}`" class="pr-1 py-1 text-no-wrap">
                <span v-if="rate">{{ rate }} %</span>
                <span v-else-if="j < 5">-</span>
              </td>
            </tr>
            <tr>
              <td class="text-no-wrap pr-1">{{ $t("Result.本隊") }}</td>
              <td class="text-no-wrap pr-1">{{ fleet.mainResult.avgAirPower }}</td>
              <td class="text-no-wrap pr-1">{{ airPowerBorders(fleet.mainResult.avgEnemyAirPower) }}</td>
              <td v-for="(rate, i) in fleet.mainResult.rates" :key="i" class="pr-1 py-1 text-no-wrap">
                <span v-if="rate">{{ rate }} %</span>
                <span v-else-if="i < 5">-</span>
              </td>
            </tr>
          </tbody>
        </table>
        <v-divider />
      </div>
    </v-card>
    <v-card class="mx-1 mx-sm-3 my-2 py-3 px-2">
      <div class="body-2 px-2">{{ $t("Result.敵機残数") }}</div>
      <div class="scrollable-table">
        <table>
          <thead>
            <tr>
              <th class="text-center">{{ $t("Result.敵艦") }}</th>
              <th class="text-center">{{ $t("Fleet.装備") }}</th>
              <th class="pl-1 pl-sm-0">{{ $t("Result.初期搭載") }}</th>
              <th class="pl-1 pl-sm-0">{{ $t("Result.残数平均") }}</th>
              <th class="pl-1 pl-sm-0">{{ $t("Result.全滅率") }}</th>
              <th class="pl-1 pl-sm-0">{{ $t("Result.棒立ち率") }}</th>
              <th class="pl-1 pl-sm-0 pr-1" v-if="!capturing">{{ $t("Result.詳細") }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, i) in enemyTableData">
              <tr v-for="(item, j) in row.items" :key="`${i}-${j}`">
                <td class="td-enemy-name text-truncate" v-if="j === 0" :rowspan="row.items.length">
                  {{ getEnemyName(row.enemy.data.name) }}
                </td>
                <td :class="`text-left d-flex item-input py-1 type-${item.data.iconTypeId}`">
                  <div class="px-0 px-md-1">
                    <v-img :src="`./img/type/icon${item.data.iconTypeId}.png`" height="20" width="20" />
                  </div>
                  <div class="align-self-center item-name text-truncate">
                    {{ needTrans ? $t(`${item.data.name}`) : item.data.name }}
                  </div>
                </td>
                <td>{{ item.fullSlot }}</td>
                <td>{{ item.slotResult }}</td>
                <td>{{ item.deathRate > 0 ? `${item.deathRate} %` : "-" }}</td>
                <td class="pr-1" v-if="j === 0" :rowspan="row.items.length">
                  {{ row.allDeathRate > 0 ? `${row.allDeathRate} %` : "-" }}
                </td>
                <td v-if="j === 0 && !capturing" :rowspan="row.items.length">
                  <v-btn color="primary" icon small @click="viewDetail(row.enemy, row.index)">
                    <v-icon>mdi-information-outline</v-icon>
                  </v-btn>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <v-divider />
      </div>
    </v-card>
    <v-card class="mx-1 mx-sm-3 my-2 py-3 px-2">
      <div class="body-2 px-2">{{ $t("Result.支援艦隊") }}</div>
      <div class="scrollable-table">
        <table>
          <thead>
            <tr>
              <th class="text-left py-1 pl-3">{{ $t("Result.艦隊") }}</th>
              <th class="text-left pl-1 pr-2">{{ $t("Result.種別") }}</th>
              <th class="pr-2">{{ $t("Common.制空値") }}</th>
              <th class="pr-2">{{ $t("Result.対潜支援制空") }}</th>
              <th class="pr-2">
                {{ $t("Common.敵制空値") }}( {{ $t("Common.確保") }} / {{ $t("Common.優勢") }} / {{ $t("Common.拮抗") }} / {{ $t("Common.劣勢") }})
              </th>
              <th class="pr-2">{{ $t("Common.確保") }}</th>
              <th class="pr-2">{{ $t("Common.優勢") }}</th>
              <th class="pr-2">{{ $t("Common.拮抗") }}</th>
              <th class="pr-2">{{ $t("Common.劣勢") }}</th>
              <th class="pr-2">{{ $t("Common.喪失") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in supportsTableRow" :key="`support_${i}`">
              <td class="text-left py-2 pl-3 text-no-wrap">{{ $t("Fleet.第x艦隊", { number: row.number }) }}</td>
              <td class="text-left pl-1 text-no-wrap">{{ row.typeName }}</td>
              <td>{{ row.airPower }}</td>
              <td>{{ row.aswAirPower }}</td>
              <td>{{ row.enemyAirPower }}</td>
              <td v-for="(rate, j) in row.rates" :key="`support_row${i}_rate${j}`" class="pr-2">
                <span v-if="rate">{{ rate }} %</span>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>
        <v-divider />
      </div>
      <div class="pl-2 caption mt-1">※ {{ $t("Result.制空値は航空支援専用の制空値です。熟練度や改修値に影響されません。") }}</div>
      <div class="pl-2 caption">※ {{ $t("Result.敵制空値は本隊航空戦終了時点での制空値の平均です。") }}</div>
    </v-card>

    <!-- 戦闘シミュレーション (kancolle-replay) -->
    <v-card class="mx-1 mx-sm-3 my-2 pa-4" outlined>
      <div class="d-flex align-center pb-2">
        <v-icon color="primary" class="mr-2">mdi-sword-cross</v-icon>
        <span class="text-subtitle-1 font-weight-bold">実戦戦闘シミュレーション</span>
        <v-spacer />
        <div class="d-flex align-center" style="gap: 8px;" v-show="!simRunning">
          <v-select
            v-model="simCount"
            :items="[100, 500, 1000]"
            label="試行回数"
            dense
            hide-details
            outlined
            style="width: 110px;"
          />
          <v-btn color="primary" small @click="startSortieSim">
            シミュレーション実行
          </v-btn>
        </div>
      </div>
      <v-divider class="my-2" />

      <!-- シミュレーション設定パネル -->
      <v-expansion-panels class="mb-3" flat v-show="!simRunning">
        <v-expansion-panel class="border rounded-lg">
          <v-expansion-panel-header class="py-2 px-4 grey lighten-5">
            <div class="d-flex align-center">
              <v-icon color="primary" class="mr-2">mdi-cog-outline</v-icon>
              <span class="text-subtitle-2 font-weight-bold grey--text text--darken-3">シミュレーション設定</span>
              <v-spacer />
              <span class="text-caption grey--text mr-2" v-if="setting">
                モード: {{ setting.simSortieMode === 'consecutive' ? '連続周回' : '単発出撃' }} /
                大破: {{ setting.simRetreatPolicy === 'retreat' ? '大破撤退' : setting.simRetreatPolicy === 'damecon' ? 'ダメコン進撃' : '大破進撃' }} /
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

            <!-- 陣形情報 (一時的オーバーライド) -->
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

      <div v-if="simRunning" class="text-center py-4">
        <v-progress-circular indeterminate color="primary" class="mb-2" />
        <div class="text-caption grey--text">シミュレーション計算中... ({{ simCount }}回)</div>
      </div>
      <sortie-simulation-result :result="simResult" v-else-if="simResult && !simRunning" />
      <div v-else class="text-center py-6 text-caption grey--text">
        現在の自軍編成、基地航空隊、敵艦隊の配置をもとに、実戦形式（昼夜戦闘・撤退判定あり）のシミュレーションを実行します。
      </div>
    </v-card>

    <v-dialog width="1200" v-model="detailDialog" transition="scroll-x-transition" @input="toggleDetailDialog" :fullscreen="isMobile">
      <v-card :class="{ fullscreen: isMobile }">
        <div class="d-flex pt-2 pb-1 pr-2">
          <div class="align-self-center ml-3">{{ $t("Result.詳細計算") }}</div>
          <v-spacer />
          <v-btn icon @click="closeDetail">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <v-divider />
        <plane-detail-result
          class="detail-result-container"
          v-if="!destroyDialog && detailParent"
          :arg-parent="detailParent"
          :index="detailIndex"
          :fleetIndex="detailFleetIndex"
          :handle-change-items="updateDetailFormItems"
        />
      </v-card>
    </v-dialog>
    <v-tooltip v-model="enabledTooltip" color="black" bottom right transition="slide-y-transition" :position-x="tooltipX" :position-y="tooltipY">
      <div>
        <table class="border-top-none body-2">
          <tr>
            <td class="border-top-none py-1 d-flex">
              <div>
                <v-img :src="`./img/util/fuel.png`" height="20" width="20" />
              </div>
              <div class="ml-1 align-self-center">{{ $t("Result.燃料補正") }}</div>
            </td>
            <td class="border-top-none pl-5">{{ fuelCorr ? $t("Result.回避項x", { value: fuelCorr }) : "-" }}</td>
          </tr>
          <tr>
            <td class="border-top-none py-1 d-flex">
              <div>
                <v-img :src="`./img/util/ammo.png`" height="20" width="20" />
              </div>
              <div class="ml-1 align-self-center">{{ $t("Result.残弾薬補正") }}</div>
            </td>
            <td class="border-top-none pl-5">{{ ammoCorr ? ammoCorr : "-" }}</td>
          </tr>
        </table>
      </div>
    </v-tooltip>
  </v-card>
</template>

<style scoped>
.v-timeline-item {
  padding-bottom: 8px;
}
.cursor-pointer {
  cursor: pointer;
}

.scrollable-table {
  overflow-x: auto;
}
@media (min-width: 600px) {
  .scrollable-table {
    overflow-x: unset;
  }
}

table {
  font-size: 0.75em;
  text-align: right;
  width: 100%;
  border-top: 1px solid rgba(128, 128, 128, 0.4);
  border-collapse: separate;
  border-spacing: 0;
}
table thead th {
  padding: 0.2rem 0;
}
table thead tr {
  background-color: rgba(128, 128, 128, 0.1);
}

table th {
  opacity: 0.8;
  white-space: nowrap;
}
table tr td {
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}
table.border-top-none,
table tr td.border-top-none {
  border-top: none;
}

table tbody tr:hover {
  background-color: rgba(128, 128, 128, 0.05);
}
td.td-ship-name {
  font-size: 12px;
  text-align: center;
  width: 100px;
  white-space: nowrap;
}
.td-enemy-name {
  font-size: 12px;
  text-align: center;
}
.td-battle0 {
  border-left: 1px solid rgba(128, 128, 128, 0.4);
}
td.item-input {
  border-left: none !important;
  border-right: none !important;
  border-bottom: none !important;
  border-top: 1px solid rgba(128, 128, 128, 0.25) !important;
  margin: 0 !important;
}
.item-name {
  flex-grow: 1;
  font-size: 0.9em;
  width: 85px;
  padding-top: 2px;
}

.is-not-cv {
  opacity: 0.4;
}

.tr-status {
  height: 25px;
}
.tr-status td {
  position: relative;
}
.tr-fuel-ammo td {
  cursor: default;
}
.ml-0_5 {
  margin-left: 2px;
}
.fuel-warning {
  font-weight: 700;
  color: rgb(240, 164, 0);
}
.fuel-warning1 {
  font-weight: 700;
  color: rgb(255, 123, 0);
}
.fuel-warning2 {
  font-weight: 700;
  color: rgb(255, 94, 0);
}
.fuel-warning3 {
  font-weight: 700;
  color: rgb(255, 60, 0);
}
.fuel-warning4 {
  font-weight: 700;
  color: rgb(255, 0, 0);
}

.resource-value {
  text-align: right;
  width: 28px;
  white-space: nowrap;
}

.state-label {
  position: absolute;
  text-align: center;
  font-size: 12px;
  padding: 1px 0;
  width: 42px;
  border-radius: 0.25rem;
  right: 0px;
  bottom: 1px;
}
.state-0 {
  border: 1px solid rgba(76, 175, 80, 0.6);
  box-shadow: inset 0 0 12px rgba(76, 175, 80, 0.6);
}
.state-1 {
  border: 1px solid rgba(139, 195, 74, 0.6);
  box-shadow: inset 0 0 12px rgba(139, 195, 74, 0.6);
}
.state-2 {
  border: 1px solid rgba(249, 217, 37, 0.6);
  box-shadow: inset 0 0 12px rgba(249, 217, 37, 0.6);
}
.state-3 {
  border: 1px solid rgba(239, 143, 0, 0.6);
  box-shadow: inset 0 0 12px rgba(239, 143, 0, 0.6);
}
.state-4 {
  border: 1px solid rgba(244, 67, 54, 0.6);
  box-shadow: inset 0 0 12px rgba(244, 67, 54, 0.6);
}

.header-td {
  background-color: rgba(128, 128, 128, 0.1);
}

.bar-label {
  text-align: center;
  font-size: 12px;
  width: 78px;
  margin-right: 0.25rem;
}

.status-bar-label {
  margin-bottom: 2px;
  text-align: center;
  border-bottom: 1px solid #888;
  position: relative;
}
.status-bar-label > div {
  opacity: 0.8;
  bottom: -2px;
  width: 100%;
  font-size: 11px;
  white-space: nowrap;
  position: absolute;
}
.status-bar-divide {
  align-self: flex-end;
  height: 10px;
  border-right: 1px solid #888;
  margin-bottom: 2px;
}

.form-input {
  width: 160px;
}

#result-container.captured {
  width: 1000px !important;
  background: #fff !important;
  border: 1px solid #bbb;
  border-radius: 0.25rem;
}
.theme--dark #result-container.captured {
  background: rgb(40, 40, 45) !important;
  border: 1px solid #444;
}
.deep-sea .theme--dark #result-container.captured {
  background: rgb(8, 18, 42) !important;
}
.captured .v-card {
  box-shadow: none !important;
  border: 1px solid #bbb;
}
.theme--dark .captured .v-card {
  border: 1px solid #444;
}

.fullscreen {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.fullscreen .detail-result-container {
  overflow-y: auto;
}
</style>

<script lang="ts">
import Vue from 'vue';
import html2canvas from 'html2canvas';
import AirStatusResultBar from '@/components/result/AirStatusResultBar.vue';
import PlaneDetailResult from '@/components/result/PlaneDetailResult.vue';
import CalcManager from '@/classes/calcManager';
import EnemyFleet from '@/classes/enemy/enemyFleet';
import Fleet from '@/classes/fleet/fleet';
import AirCalcResult from '@/classes/airCalcResult';
import Item from '@/classes/item/item';
import Const, { AB_MODE, Formation, SUPPORT_TYPE } from '@/classes/const';
import CommonCalc from '@/classes/commonCalc';
import Airbase from '@/classes/airbase/airbase';
import Enemy from '@/classes/enemy/enemy';
import Ship from '@/classes/fleet/ship';
import Convert from '@/classes/convert';
import EnemyMaster from '@/classes/enemy/enemyMaster';
import ShipMaster from '@/classes/fleet/shipMaster';
import SiteSetting from '@/classes/siteSetting';
import SortieSimulationResult from '@/components/result/SortieSimulationResult.vue';
import { runSortieSimulation, SimTotalResult } from '@/simulator/executor';
import FleetInfo from '../../classes/fleet/fleetInfo';
import AirbaseInfo from '../../classes/airbase/airbaseInfo';

export default Vue.extend({
  name: 'MainResult',
  components: {
    AirStatusResultBar,
    PlaneDetailResult,
    SortieSimulationResult,
  },
  props: {
    value: {
      type: CalcManager,
      required: true,
    },
    handleChangeMainBattle: {
      type: Function,
      required: true,
    },
    handleChangeFormation: {
      type: Function,
      required: true,
    },
    handleMoreCalculate: {
      type: Function,
      required: true,
    },
    handleMinimize: {
      type: Function,
      required: true,
    },
    handleChangeAirbase: {
      type: Function,
      required: true,
    },
    handleChangeFleet: {
      type: Function,
      required: true,
    },
    calculateCount: {
      type: Number,
      default: 5000,
    },
  },
  data: () => ({
    tab: 'battle0',
    displayBattle: 0,
    destroyDialog: false,
    detailDialog: false,
    detailParent: undefined as Ship | Enemy | Airbase | undefined,
    detailIndex: 0,
    detailFleetIndex: 0,
    capturing: false,
    moreCalculateRequested: false,
    enabledTooltip: false,
    tooltipTimer: undefined as undefined | number,
    tooltipX: 0,
    tooltipY: 0,
    fuelCorr: '',
    ammoCorr: '',
    detailEditableItems: [] as Item[],
    isMobile: true,
    simResult: null as SimTotalResult | null,
    simRunning: false,
    simCount: 1000,
    customFormations: [] as number[],
  }),
  computed: {
    formations(): Formation[] {
      if (this.$i18n.locale !== 'ja') {
        const items = [];
        for (let i = 0; i < Const.FORMATIONS.length; i += 1) {
          const { text, value, correction } = Const.FORMATIONS[i];
          items.push({ text: `${this.$t(`Common.${text}`)}`, value, correction });
        }
        return items;
      }
      return Const.FORMATIONS;
    },
    airbaseWaveResults(): { text: string; result: AirCalcResult; baseIndex: number }[] {
      const waveResults: { text: string; result: AirCalcResult; baseIndex: number }[] = [];
      for (let i = 0; i < this.value.airbaseInfo.airbases.length; i += 1) {
        const airbase = this.value.airbaseInfo.airbases[i];

        if (airbase.mode !== AB_MODE.BATTLE) {
          continue;
        }

        if (this.$i18n.locale !== 'ja') {
          if (airbase.battleTarget[0] === this.displayBattle) {
            waveResults.push({ text: `${this.$t('Result.基地x y波目', { number: i + 1, wave: 1 })}`, result: airbase.resultWave1, baseIndex: i });
          }
          if (airbase.battleTarget[1] === this.displayBattle) {
            waveResults.push({ text: `${this.$t('Result.基地x y波目', { number: i + 1, wave: 2 })}`, result: airbase.resultWave2, baseIndex: i });
          }
        } else {
          if (airbase.battleTarget[0] === this.displayBattle) {
            waveResults.push({ text: `基地${i + 1} 1波目`, result: airbase.resultWave1, baseIndex: i });
          }
          if (airbase.battleTarget[1] === this.displayBattle) {
            waveResults.push({ text: `基地${i + 1} 2波目`, result: airbase.resultWave2, baseIndex: i });
          }
        }
      }

      return waveResults;
    },
    fleet(): Fleet {
      return this.value.fleetInfo.mainFleet;
    },
    airbases(): Airbase[] {
      return this.value.airbaseInfo.airbases;
    },
    hasBattleAirbase(): boolean {
      return this.airbases.some((v) => v.mode === AB_MODE.BATTLE);
    },
    tableData(): { data: ShipMaster; items: Item[]; allDeathRate: number; index: number }[] {
      const fleet = this.value.fleetInfo.mainFleet;
      const ships = [];

      const activeShips = fleet.ships.filter((v) => v.isActive && !v.isEmpty);
      for (let i = 0; i < activeShips.length; i += 1) {
        const planes = activeShips[i].items.filter((v) => v.data.isPlane);
        if (planes.length) {
          ships.push({
            data: activeShips[i].data,
            items: planes,
            allDeathRate: activeShips[i].allPlaneDeathRate,
            index: i,
          });
        }
      }
      return ships;
    },
    enemyTableData(): { enemy: Enemy; items: Item[]; allDeathRate: number; index: number }[] {
      const fleet = this.value.battleInfo.fleets[this.value.mainBattle];
      const enemies = [];

      for (let i = 0; i < fleet.enemies.length; i += 1) {
        const enemy = fleet.enemies[i];
        const planes = enemy.items.filter((v) => v.data.isPlane && !v.data.isRecon);
        if (planes.length) {
          for (let j = 0; j < planes.length; j += 1) {
            const plane = planes[j];
            plane.deathRate = Math.floor(plane.deathRate);
          }
          enemies.push({
            enemy,
            items: planes,
            allDeathRate: enemy.allPlaneDeathRate,
            index: i,
          });
        }
      }
      return enemies;
    },
    supportsTableRow(): {
      number: number;
      typeName: string;
      airPower: number;
      aswAirPower: number;
      enemyAirPower: string;
      rates: number[];
      isMainFleet: boolean;
    }[] {
      const rows = [];
      const fleets = this.value.fleetInfo.fleets.concat();
      const mainIndex = this.value.fleetInfo.mainFleetIndex;
      // 敵
      const enemyFleet = this.value.battleInfo.fleets[this.value.mainBattle];
      for (let i = 0; i < fleets.length; i += 1) {
        // 出撃中のやつは出撃中フラグを建てる
        let isMainFleet = false;
        if (i === mainIndex || (this.value.fleetInfo.isUnion && mainIndex <= 1 && i <= 1)) {
          isMainFleet = true;
        }

        const fleet = fleets[i];
        const types = fleet.supportTypes;

        const needResult = types.includes(SUPPORT_TYPE.AIRSTRIKE) || types.includes(SUPPORT_TYPE.ANTI_SUBMARINE);
        const result = fleet.results.find((v) => v.supportRates.some((w) => w > 0));

        let rates = needResult && result ? result.supportRates.map((v) => Math.round(10 * v) / 10) : [0, 0, 0, 0, 0];
        const avg = needResult && result ? Math.round(result.avgEnemySupportAirPower) : 0;
        let enemyAirPower = avg ? `${avg}（ ${CommonCalc.getAirStatusBorder(avg).slice(0, 4).join(' / ')} ）` : '';
        if (!enemyFleet.isAswSupportCell && fleet.supportTypes.length === 1 && fleet.enabledAswSupport) {
          // 敵が対潜支援不可マスで、かつこの艦隊が対潜支援しかできない場合
          enemyAirPower = `${this.$t('Result.支援不可(攻撃機なし)')}`;
          rates = [0, 0, 0, 0, 0];
        }
        rows.push({
          number: i + 1,
          typeName: fleet
            .getSupportTypeNames()
            .map((v) => this.$t(`Result.${v}`))
            .join(' / '),
          airPower: fleet.supportAirPower,
          aswAirPower: fleet.supportAswAirPower,
          enemyAirPower,
          rates: rates.slice(0, 5),
          isMainFleet,
        });
      }

      return rows;
    },
    battles(): EnemyFleet[] {
      return this.value.battleInfo.fleets;
    },
    battleCount(): number {
      return this.value.battleInfo.battleCount;
    },
    results(): AirCalcResult[] {
      return this.value.fleetInfo.mainFleet.results;
    },
    calcBauxite(): string {
      return (5 * this.value.fleetInfo.mainFleet.mainResult.avgDownSlot).toFixed();
    },
    calcSteel(): string {
      return this.value.fleetInfo.mainFleet.mainResult.avgUsedSteels.toFixed();
    },
    airPowerBorders: () => (airPower: number) => `${airPower}（ ${CommonCalc.getAirStatusBorder(airPower).slice(0, 4).join(' / ')} ）`,
    consumptions(): number[][] {
      return this.value.battleInfo.getResourceConsumptions(this.$store.state.maps);
    },
    remainingFuelAndAmmos(): { fuel: { value: number; color: string }; ammo: { value: number; color: string } }[] {
      // 残りの燃料弾薬を計算 表示用
      const values = [[100, 100]];
      const array = this.consumptions;
      for (let i = 0; i < array.length - 1; i += 1) {
        values.push([Math.max(values[i][0] - array[i][0], 0), Math.max(values[i][1] - array[i][1], 0)]);
      }

      const remaining = [];
      for (let i = 0; i < values.length; i += 1) {
        const fuel = values[i][0];
        const ammo = values[i][1];
        remaining.push({
          fuel: { value: fuel, color: this.getFuelTextColor(fuel) },
          ammo: { value: ammo, color: this.getAmmoTextColor(ammo) },
        });
      }
      return remaining;
    },
    sumFuelAndAmmo(): number[] {
      const ships = this.fleet.ships
        .filter((v) => v.isActive && !v.isEmpty)
        .map((v) => Object.assign(v, { consumptionFuel: 0, consumptionAmmo: 0, consumptionAmmo2: 0 }));
      const array = this.consumptions;
      for (let i = 0; i < array.length; i += 1) {
        const isLast = i === array.length - 1;
        // この戦闘で消費する燃料弾薬 %
        const fuelConsumptionRate = array[i][0] / 100;
        const ammoConsumptionRate = array[i][1] / 100;
        for (let j = 0; j < ships.length; j += 1) {
          const { fuel, ammo } = ships[j].data;
          // 消費記録
          if (fuelConsumptionRate) {
            ships[j].consumptionFuel += Math.max(Math.floor(fuel * fuelConsumptionRate), 1);
          }
          if (ammoConsumptionRate) {
            ships[j].consumptionAmmo += Math.max(Math.floor(ammo * ammoConsumptionRate), 1);
            if (isLast) {
              // todo 最終戦闘 夜戦した時の消費の仕様
              ships[j].consumptionAmmo2 += Math.max(Math.floor(ammo * ammoConsumptionRate), 1);
            } else {
              ships[j].consumptionAmmo2 += Math.max(Math.floor(ammo * ammoConsumptionRate), 1);
            }
          }
        }
      }

      let sumFuel = 0;
      let sumAmmo = 0;
      for (let j = 0; j < ships.length; j += 1) {
        const isMarriage = ships[j].level > 99;
        const { consumptionFuel, consumptionAmmo, data } = ships[j];
        // 消費記録
        if (consumptionFuel) {
          if (consumptionFuel < data.fuel) {
            sumFuel += Math.max(Math.floor(consumptionFuel * (isMarriage ? 0.85 : 1)), 1);
          } else {
            sumFuel += Math.max(Math.floor(data.fuel * (isMarriage ? 0.85 : 1)), 1);
          }
        }

        if (consumptionAmmo) {
          if (consumptionAmmo < data.ammo) {
            sumAmmo += Math.max(Math.floor(consumptionAmmo * (isMarriage ? 0.85 : 1)), 1);
          } else {
            sumAmmo += Math.max(Math.floor(data.ammo * (isMarriage ? 0.85 : 1)), 1);
          }
        }
      }
      return [sumFuel, sumAmmo];
    },
    totalAirbaseResource(): number[] {
      let fuel = 0;
      let ammo = 0;
      let steel = 0;
      let bauxite = 0;
      // 基地の消費があれば突っ込む
      for (let i = 0; i < this.airbases.length; i += 1) {
        const airbase = this.airbases[i];
        if (airbase.mode === AB_MODE.BATTLE) {
          fuel += airbase.fuel + airbase.totalSupplyFuel;
          ammo += airbase.ammo;
          bauxite += airbase.totalSupplyBauxite;
          steel += airbase.totalUsedSteel;
        }
      }

      return [fuel, ammo, steel, bauxite];
    },
    formationNames(): string[] {
      const formationNames = [];
      for (let index = 0; index < this.value.battleInfo.fleets.length; index += 1) {
        const formationIds = this.value.battleInfo.fleets[index].mainFleetFormation;
        const form = Const.FORMATIONS.find((v) => v.value === formationIds);
        if (form) {
          formationNames.push(`${this.$t(`Common.${form.text}`)}`);
        } else {
          formationNames.push('-');
        }
      }

      return formationNames;
    },
    existUnknownEnemy(): boolean {
      return this.value.battleInfo.fleets.some((v) => v.existUnknownEnemy);
    },
    needTrans(): boolean {
      const setting = this.$store.state.siteSetting as SiteSetting;
      return this.$i18n.locale !== 'ja' && !setting.nameIsNotTranslate;
    },
    setting(): any {
      return this.$store.state.siteSetting;
    },
    dameconCount(): { normal: number; goddess: number } {
      let normal = 0;
      let goddess = 0;
      const manager = this.value;
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
  },
  watch: {
    value: {
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
  methods: {
    refresh() {
      this.handleChangeMainBattle(this.displayBattle);
    },
    changedTab(index: number) {
      if (this.displayBattle === index) {
        return;
      }

      if (index >= 0) {
        this.displayBattle = index;
      } else {
        this.displayBattle = this.battles.length - 1;
      }

      this.handleChangeMainBattle(this.displayBattle);
    },
    changedFormation(formation: number) {
      this.handleChangeFormation(formation);
    },
    calculateMore() {
      this.moreCalculateRequested = true;
      this.handleMoreCalculate();
    },
    clickedAirbaseRow(index: number) {
      this.viewDetail(this.airbases[index], index);
    },
    clickedShipRow(index: number) {
      const fleet = this.value.fleetInfo.mainFleet;
      const activeShips = fleet.ships.filter((v) => v.isActive && !v.isEmpty);
      const ship = activeShips[index];

      const shipIndex = fleet.ships.findIndex((v) => v === ship);
      if (shipIndex >= 0) {
        // 連合随伴の時
        if (ship.isEscort) {
          this.detailFleetIndex = 1;
          this.viewDetail(ship, shipIndex - fleet.ships.filter((v) => !v.isEscort).length);
        } else {
          this.detailFleetIndex = this.value.fleetInfo.mainFleetIndex;
          this.viewDetail(ship, shipIndex);
        }
      }
    },
    viewDetail(parent: Enemy | Ship | Airbase, index: number): void {
      this.detailParent = parent;
      this.detailIndex = index;
      if (parent instanceof Enemy) {
        this.detailFleetIndex = this.displayBattle;
      }
      this.destroyDialog = false;
      this.isMobile = window.innerWidth < 600;
      this.detailDialog = true;
    },
    updateDetailFormItems(items: Item[]) {
      // 詳細計算画面にて装備の変更があったときに発火
      this.detailEditableItems = items;
    },
    closeDetail() {
      // 詳細計算画面にて変更された装備を適用する
      const items = [];
      for (let i = 0; i < this.detailEditableItems.length; i += 1) {
        const editedItem = this.detailEditableItems[i];
        items.push(new Item({ item: editedItem }));
      }

      if (this.detailParent instanceof Ship) {
        // 詳細計算画面による変更を適用
        const baseShip = this.value.fleetInfo.fleets[this.detailFleetIndex].ships[this.detailIndex];
        const ship = new Ship({ ship: baseShip, items });
        const baseFleet = this.value.fleetInfo.fleets[this.detailFleetIndex];
        baseFleet.ships[this.detailIndex] = ship;
        const fleet = new Fleet({ fleet: baseFleet });
        const baseInfo = this.value.fleetInfo;
        baseInfo.fleets[this.detailFleetIndex] = fleet;
        // 親画面に通知し、履歴の追加と計算を発火
        this.handleChangeFleet(new FleetInfo({ info: this.value.fleetInfo }));
      } else if (this.detailParent instanceof Airbase) {
        // 詳細計算画面による変更を適用
        const airbase = new Airbase({ airbase: this.value.airbaseInfo.airbases[this.detailIndex], items });
        this.value.airbaseInfo.airbases[this.detailIndex] = airbase;
        // 親画面に通知し、履歴の追加と計算を発火
        this.handleChangeAirbase(new AirbaseInfo({ info: this.value.airbaseInfo }));
      }

      this.detailDialog = false;
      setTimeout(() => {
        this.detailParent = undefined;
      }, 100);
    },
    toggleDetailDialog() {
      if (!this.detailDialog) {
        this.closeDetail();
      } else {
        this.destroyDialog = false;
      }
    },
    captureResult() {
      // 背景色とかを塗るフラグ立て
      this.capturing = true;
      const div = document.getElementById('result-container') as HTMLDivElement;
      setTimeout(() => {
        html2canvas(div, { scale: 1 }).then((canvas) => {
          const link = document.createElement('a');
          const setting = this.$store.state.siteSetting as SiteSetting;
          link.href = canvas.toDataURL(setting.imageType === 'png' ? 'image/png' : 'image/jpeg');
          link.download = `result_${Convert.formatDate(new Date(), 'yyyyMMdd-HHmmss')}.${setting.imageType}`;
          link.click();
          this.capturing = false;
        });
      }, 10);
    },
    getFuelTextColor(value: number): string {
      if (value <= 10) {
        return 'fuel-warning4';
      }
      if (value <= 20) {
        return 'fuel-warning3';
      }
      if (value <= 30) {
        return 'fuel-warning2';
      }
      if (value <= 50) {
        return 'fuel-warning1';
      }
      if (value < 75) {
        return 'fuel-warning';
      }
      return 'fuel-normal';
    },
    getAmmoTextColor(value: number): string {
      if (value <= 15) {
        return 'fuel-warning4';
      }
      if (value <= 25) {
        return 'fuel-warning3';
      }
      if (value <= 35) {
        return 'fuel-warning2';
      }
      if (value <= 40) {
        return 'fuel-warning1';
      }
      if (value < 50) {
        return 'fuel-warning';
      }
      return 'fuel-normal';
    },
    bootTooltip(fuel: number, ammo: number, e: MouseEvent) {
      const setting = this.$store.state.siteSetting as SiteSetting;
      window.clearTimeout(this.tooltipTimer);
      this.tooltipTimer = window.setTimeout(() => {
        this.tooltipX = e.clientX;
        this.tooltipY = e.clientY;
        this.enabledTooltip = true;

        this.fuelCorr = fuel < 75 ? `${75 - fuel}` : '';
        this.ammoCorr = ammo < 50 ? `× ${(ammo * 2) / 100}` : '';
      }, Math.max(setting.popUpCount, 10));
    },
    clearTooltip() {
      this.enabledTooltip = false;
      window.clearTimeout(this.tooltipTimer);
    },
    getShipName(ship: ShipMaster) {
      if (this.needTrans) {
        const shipName = ShipMaster.getSuffix(ship);
        const trans = (v: string) => (v ? `${this.$t(v)}` : '');
        return shipName.map((v) => trans(v)).join('');
      }
      return ship.name || '';
    },
    getEnemyName(name: string) {
      if (name && this.needTrans) {
        const shipName = EnemyMaster.getSuffix(name);
        const trans = (v: string) => (v ? `${this.$t(v)}` : '');
        return shipName.map((v) => trans(v)).join('');
      }

      return name;
    },
    async startSortieSim() {
      if (this.simRunning) return;
      this.simRunning = true;
      try {
        const itemStock = this.$store.state.itemStock || [];
        const findStockCount = (id: number) => {
          const s = itemStock.find((v: any) => v.id === id);
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
        this.simResult = await runSortieSimulation(this.value, this.simCount, simSettings);
      } catch (e) {
        console.error(e);
        this.$emit('inform', 'シミュレーション実行中にエラーが発生しました。');
      } finally {
        this.simRunning = false;
      }
    },
    saveSettings() {
      this.$store.dispatch('updateSetting', this.setting);
    },
  },
});
</script>
