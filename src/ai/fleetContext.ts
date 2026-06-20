/* eslint-disable */
import ShipStock from '@/classes/fleet/shipStock';
import ShipMaster from '@/classes/fleet/shipMaster';
import ItemStock from '@/classes/item/itemStock';
import ItemMaster from '@/classes/item/itemMaster';
import { MasterEquipmentShip } from '@/classes/interfaces/master';
import ShipValidation from '@/classes/fleet/shipValidation';
import Const from '@/classes/const';
import { SHIP_SLOT_EQUIP_RESTRICTIONS } from '@/classes/constants/ships';
import Ship from '@/classes/fleet/ship';
import Item from '@/classes/item/item';

/** 艦種IDから艦種名を返す */
function getShipTypeName(type: number): string {
  const map: Record<number, string> = {
    2: '駆逐艦', 3: '軽巡洋艦', 4: '重雷装巡洋艦', 5: '重巡洋艦',
    6: '航空巡洋艦', 7: '軽空母', 8: '巡洋戦艦', 9: '戦艦',
    10: '航空戦艦', 11: '正規空母', 13: '潜水艦', 14: '潜水空母',
    16: '水上機母艦', 17: '揚陸艦', 18: '装甲空母', 19: '工作艦',
    20: '潜水母艦', 21: '練習巡洋艦', 22: '補給艦', 1: '海防艦',
  };
  return map[type] || `艦種${type}`;
}

/** 装備カテゴリIDから装備種別名を返す */
function getItemTypeName(apiTypeId: number): string {
  const map: Record<number, string> = {
    1: '小口径主砲', 2: '中口径主砲', 3: '大口径主砲', 4: '副砲',
    5: '魚雷', 6: '艦上戦闘機', 7: '艦上爆撃機', 8: '艦上攻撃機',
    9: '艦上偵察機', 10: '水上偵察機', 11: '水上爆撃機', 12: '小型電探',
    13: '大型電探', 14: 'ソナー', 15: '爆雷', 17: '機関部強化',
    18: '対空強化弾', 19: '対艦強化弾', 20: '対空機銃', 21: '高射装置',
    22: '電探', 23: '徹甲弾', 24: '爆雷投射機', 25: 'オートジャイロ',
    26: '対潜哨戒機', 29: '探照灯', 30: '簡易輸送部材', 31: '艦艇修理施設',
    32: '潜水艦魚雷', 33: '照明弾', 34: '司令部施設', 35: '航空要員',
    36: '高射装置', 37: '対地装備', 38: '大口径主砲(II)', 39: '水上戦闘機',
    40: '大型ソナー', 41: '大型飛行艇', 42: '大型探照灯', 43: '戦闘糧食',
    44: '補給物資', 45: '夜間戦闘機', 46: '夜間攻撃機', 47: '陸上攻撃機',
    48: '局地戦闘機', 49: '陸上偵察機', 50: '輸送機材', 51: '潜水艦装備',
    53: '大型ソナー(後期型)', 56: '噴式戦闘爆撃機', 57: '噴式攻撃機',
    58: '夜間偵察機',
  };
  return map[apiTypeId] || `装備種別${apiTypeId}`;
}

/** リクエストから練度上限を抽出 */
function extractMaxLevel(request: string): number {
  const match = request.match(/練度?(\d+)以下/);
  return match ? parseInt(match[1]) : 9999;
}

/** リクエストで艦娘を絞り込む */
function filterShipsByRequest(
  stocks: ShipStock[],
  request: string,
): ShipStock[] {
  const maxLevel = extractMaxLevel(request);
  return stocks.filter((stock) => stock.level <= maxLevel);
}

function buildSpecialAttackHints(shipStocks: ShipStock[], shipMasters: ShipMaster[]): string {
  const ownedIds = new Set(shipStocks.map(s => s.id));
  const hints: string[] = [];

  // Helper to check if any of the IDs are owned
  const hasAny = (ids: number[]) => ids.some(id => ownedIds.has(id));

  // Yamato Touch
  const yamatoFlagships = [911, 916]; // 大和改二重, 大和改二
  const musashiPartners = [546]; // 武蔵改二
  const otherYamatoPartners = [392, 969, 724, 360, 178, 541, 573, 553, 554, 591, 592, 593, 954, 694];

  if (hasAny(yamatoFlagships)) {
    if (hasAny(musashiPartners)) {
      hints.push('・大和スペシャル（大和タッチ）: 旗艦「大和改二重/改二」、2番艦「武蔵改二」で発動可能（非常に強力）');
    } else if (hasAny(otherYamatoPartners)) {
      hints.push('・大和スペシャル（大和タッチ）: 旗艦「大和改二重/改二」、2番艦「アイオワ/リシュリュー/長門型/伊勢型/金剛型等」で発動可能');
    }
  }

  // Nagato / Mutsu Touch
  if (ownedIds.has(541) && ownedIds.has(573)) {
    hints.push('・一斉射かッ…胸が熱いな！（長門/陸奥タッチ）: 1番艦「長門改二」、2番艦「陸奥改二」（またはその逆）で発動可能（戦艦3隻以上編成）');
  }

  // Nelson / Rodney Touch
  if (ownedIds.has(576)) {
    hints.push('・Nelson Touch: 旗艦「Nelson改」、3番艦と5番艦に任意の艦を配置することで発動可能（複縦陣/輪形陣）');
  }
  if (ownedIds.has(577)) {
    hints.push('・Rodney Touch: 旗艦「Rodney改」、3番艦と5番艦に任意の艦を配置することで発動可能（複縦陣/輪形陣）');
  }

  // Colorado Touch
  if (ownedIds.has(1496) && ownedIds.has(918)) {
    hints.push('・Colorado Touch: 旗艦「Colorado改」、2番艦に「Maryland改」などのコロラド級/ビッグセブンを配置することで発動可能');
  }

  // Kongou Class Night Touch
  const kongouClass = [591, 592, 694, 593, 954];
  if (hasAny(kongouClass)) {
    hints.push('・僚艦夜戦突撃: 金剛型改二丙などを旗艦・2番艦に並べることで、夜戦時に特殊攻撃が発動可能');
  }

  // Jingei Submarine Touch
  const jingeiClass = [703, 685, 704, 686];
  if (hasAny(jingeiClass)) {
    hints.push('・潜水艦特殊攻撃: 旗艦に「迅鯨型潜水母艦」、随伴に潜水艦/潜水空母を複数編成することで発動可能');
  }

  if (hints.length === 0) return '';
  return `\n\n【特殊攻撃（タッチ攻撃）の編成可能候補】\n${hints.join('\n')}`;
}

export function buildFleetContext(
  shipStocks: ShipStock[],
  shipMasters: ShipMaster[],
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
  equipShips: MasterEquipmentShip = {},
  request = '',
  currentFleetData: any = null, // 追加: 現在計算機にロードされている艦隊データ
): string {
  if (!shipStocks.length) return '';

  // リクエストで艦娘を絞り込む
  const filteredStocks = request
    ? filterShipsByRequest(shipStocks, request)
    : shipStocks;

  // 手持ち艦娘リスト（名前、艦種、Lv、補強増設状況、および装備可能手持ちをフィルタリングして出力）
  const shipLines = filteredStocks.map((stock) => {
    const master = shipMasters.find((m) => m.id === stock.id);
    const name = master ? master.name : `ID:${stock.id}`;
    const typeName = master ? getShipTypeName(master.type) : '';
    const expand = stock.releaseExpand ? ' [補強増設あり]' : '';

    const aswVal = master ? Ship.getStatusFromLevel(stock.level, master.maxAsw, master.minAsw) + (stock.improvement?.asw || 0) : 0;
    const fireVal = master ? master.fire + (stock.improvement?.fire || 0) : 0;
    const scoutVal = master ? Ship.getStatusFromLevel(stock.level, master.maxScout, master.minScout) : 0;
    const avoidVal = master ? Ship.getStatusFromLevel(stock.level, master.maxAvoid, master.minAvoid) : 0;
    const hpVal = master ? (stock.level > 99 ? master.hp2 : master.hp) + (stock.improvement?.hp || 0) : 0;
    const luckVal = master ? master.luck + (stock.improvement?.luck || 0) : 0;
    const speedVal = master ? (master.speed === 10 ? '高速' : master.speed === 5 ? '低速' : `速力${master.speed}`) : '不明';

    // 無条件先制対潜の判定（五十鈴改二=141, 龍田改二=478, Jervis改=394, Janus改=893など）
    const isAswReady = master && [141, 478, 394, 893].includes(master.id) ? ' [無条件先制対潜可]' : '';

    let equipLine = '';
    let exEquipLine = '';
    let restrictionLine = '';

    if (master) {
      const validItemNames: string[] = [];
      const validExItemNames: string[] = [];

      for (const itemStock of itemStocks) {
        const itemMaster = itemMasters.find((m) => m.id === itemStock.id);
        if (!itemMaster) continue;

        // 通常スロットで装備可能な手持ちアイテムを抽出
        if (ShipValidation.isValidItem(master, itemMaster, 0)) {
          for (let remodel = 0; remodel < itemStock.num.length; remodel += 1) {
            if (itemStock.num[remodel] > 0) {
              const starText = remodel > 0 ? `★+${remodel}` : '';
              validItemNames.push(`${itemMaster.name}${starText}`);
            }
          }
        }

        // 補強増設スロットで装備可能な手持ちアイテムを抽出（補強増設が解放されている場合のみ）
        if (stock.releaseExpand && ShipValidation.isValidItem(master, itemMaster, Const.EXPAND_SLOT_INDEX)) {
          for (let remodel = 0; remodel < itemStock.num.length; remodel += 1) {
            if (itemStock.num[remodel] > 0) {
              const starText = remodel > 0 ? `★+${remodel}` : '';
              validExItemNames.push(`${itemMaster.name}${starText}`);
            }
          }
        }
      }

      // 重複を除去
      const uniqueValids = [...new Set(validItemNames)].slice(0, 40);
      equipLine = uniqueValids.length > 0 ? `\n    └装備可能手持ち: ${uniqueValids.join(', ')}` : '';

      if (stock.releaseExpand) {
        const uniqueExValids = [...new Set(validExItemNames)];
        exEquipLine = uniqueExValids.length > 0 ? `\n    └増設装備可能手持ち: ${uniqueExValids.join(', ')}` : '';
      }

      // スロット制限の抽出
      const restrictions = SHIP_SLOT_EQUIP_RESTRICTIONS.filter((r) => r.shipIds.includes(master.id));
      if (restrictions.length > 0) {
        const restrictionNotes = restrictions.map((r) => r.note);
        restrictionLine = `\n    └スロット制限: ${restrictionNotes.join(' / ')}`;
      }
    }

    const slotsText = master && master.slots && master.slots.length > 0 && master.slots.some((s) => s > 0)
      ? ` [搭載数: ${master.slots.join('/')}]`
      : '';

    const statsInfo = ` [HP:${hpVal}/火力:${fireVal}/対潜:${aswVal}/索敵:${scoutVal}/回避:${avoidVal}/運:${luckVal}/${speedVal}]`;

    return `・${name}(${typeName}) Lv${stock.level}${expand}${isAswReady}${slotsText}${statsInfo}${equipLine}${exEquipLine}${restrictionLine}`;
  });

  // Find all item IDs that are valid for at least one ship in the filtered candidate list
  const validItemIdsForCandidates = new Set<number>();
  for (const stock of filteredStocks) {
    const master = shipMasters.find((m) => m.id === stock.id);
    if (!master) continue;
    for (const itemStock of itemStocks) {
      const itemMaster = itemMasters.find((m) => m.id === itemStock.id);
      if (!itemMaster) continue;
      if (
        ShipValidation.isValidItem(master, itemMaster, 0) ||
        (stock.releaseExpand && ShipValidation.isValidItem(master, itemMaster, Const.EXPAND_SLOT_INDEX))
      ) {
        validItemIdsForCandidates.add(itemMaster.id);
      }
    }
  }

  // 手持ち装備の所持数を集計して一覧化 (候補艦娘の誰かが装備可能なもののみに絞り込む)
  const itemLines: string[] = [];
  for (const stock of itemStocks) {
    if (!validItemIdsForCandidates.has(stock.id)) continue;

    const itemMaster = itemMasters.find((m) => m.id === stock.id);
    if (!itemMaster) continue;

    // ステータス情報の構築
    const stats: string[] = [];
    if (itemMaster.fire) stats.push(`火力+${itemMaster.fire}`);
    if (itemMaster.torpedo) stats.push(`雷装+${itemMaster.torpedo}`);
    if (itemMaster.antiAir) stats.push(`対空+${itemMaster.antiAir}`);
    if (itemMaster.asw) stats.push(`対潜+${itemMaster.asw}`);
    if (itemMaster.scout) stats.push(`索敵+${itemMaster.scout}`);
    if (itemMaster.accuracy) stats.push(`命中+${itemMaster.accuracy}`);
    if (itemMaster.avoid) stats.push(`回避+${itemMaster.avoid}`);
    const statText = stats.length > 0 ? ` [${stats.join(', ')}]` : '';

    for (let remodel = 0; remodel < stock.num.length; remodel += 1) {
      const count = stock.num[remodel];
      if (count > 0) {
        const starText = remodel > 0 ? `★+${remodel}` : '';
        
        // 航空機の場合、代表的なスロットサイズ（6, 12, 18, 24）での最大熟練度（>>マーク = level:120）における予測制空値を計算して付加する
        let airPowerText = '';
        if (itemMaster.isPlane && !itemMaster.isRecon && !itemMaster.isABAttacker) {
          const sampleSlots = [6, 12, 18, 24];
          const airPowers = sampleSlots.map(slotSize => {
            const tempItem = new Item({
              master: itemMaster,
              remodel: remodel,
              level: 120, // 熟練度最大(>>マーク)
              slot: slotSize
            });
            return `搭載${slotSize}で制空${tempItem.fullAirPower}`;
          });
          airPowerText = ` [熟練度>>時: ${airPowers.join(' / ')}]`;
        }

        itemLines.push(`·${itemMaster.name}${starText}${statText}${airPowerText} x ${count}`);
      }
    }
  }

  const specialAttackHints = buildSpecialAttackHints(shipStocks, shipMasters);

  // 現在の艦隊情報を文字列にする
  let currentFleetText = 'なし（未編成）';
  if (currentFleetData) {
    const fTexts: string[] = [];
    if (currentFleetData.fleets && currentFleetData.fleets.length) {
      currentFleetData.fleets.forEach((f: any, idx: number) => {
        const shipNames = f.ships ? f.ships.map((s: any) => s.name || '未配備').join(', ') : 'なし';
        fTexts.push(`・第${idx + 1}艦隊: [${shipNames}] (合計制空値:${f.airPower || 0}, 判定索敵値:${f.los || 0}, 速力:${f.speed || '不明'})`);
      });
    }
    currentFleetText = fTexts.join('\n');
  }

  return `
【編成・装備アセンブリの前提ルール】
1. 艦娘ごとに提示している「装備可能手持ち」リストは、大発動艇・特二式内火艇・バルジなどの特殊な可否制限（isValidItem）をすべて通過したものです。ここに名前がある装備のみが、その艦娘に装備可能な手持ち装備です。
2. 提案を行う際は、解説テキストの中に必ず「敵ボス基準値」と「提案する自軍の予測値」を並べた「予測比較Markdownテーブル（制空値、索敵値、対潜隻数、艦隊速力）」を出力してください。
3. 基地航空隊の提案がある場合は、出力JSONの「airbases」フィールドに情報を格納してください。
   スキーマ例: "airbases": [ { "index": 0, "mode": 1, "items": ["一式陸攻★+0", "零式艦戦52型★+10"] } ] (indexは0が第一基地、1が第二基地。modeは1が出撃、2が防空、0が待機。itemsは最大4つの装備名。基地配置も手持ち装備にあるもののみを指定してください)

【現在の計算機上の編成情報】
${currentFleetText}

【所持装備一覧】
${itemLines.join('\n')}

【手持ち艦娘 (絞込後${filteredStocks.length}隻)】
${shipLines.join('\n')}${specialAttackHints}
`.trim();
}