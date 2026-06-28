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
import CommonCalc from '@/classes/commonCalc';
import { parseFrontMatter, matchDestination, checkBranchConditions } from './routeMatcher';

const FALLBACK_MAP_THREATS: Record<string, Record<string, any[]>> = {
  '7-1': {
    'D': [
      { name: '潜水ソ級elite', hp: 38, armor: 19, traits: ['潜水艦', '先制雷撃あり'] },
      { name: '潜水カ級', hp: 30, armor: 15, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'H': [
      { name: '潜水ソ級elite', hp: 38, armor: 19, traits: ['潜水艦', '先制雷撃あり'] },
      { name: '潜水ヨ級elite', hp: 36, armor: 18, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'K': [
      { name: '潜水ソ級flagship', hp: 48, armor: 24, traits: ['潜水艦', '先制雷撃あり'] },
      { name: '潜水ヨ級elite', hp: 36, armor: 18, traits: ['潜水艦', '先制雷撃あり'] }
    ]
  },
  '7-4': {
    'B': [
      { name: '潜水カ級flagship', hp: 42, armor: 21, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'C': [
      { name: '潜水カ級flagship', hp: 42, armor: 21, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'E': [
      { name: '軽母ヌ級elite', hp: 84, armor: 70, traits: ['先制航空攻撃あり'] },
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'J': [
      { name: '重巡リ級flagship', hp: 76, armor: 40, traits: [] },
      { name: '潜水ソ級flagship', hp: 48, armor: 24, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'L': [
      { name: '重巡リ級flagship', hp: 76, armor: 40, traits: [] },
      { name: '潜水ソ級flagship', hp: 48, armor: 24, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'P': [
      { name: 'ヒ船団棲姫', hp: 390, armor: 165, traits: ['潜水艦', '先制雷撃あり'] },
      { name: '軽巡ツ級elite', hp: 56, armor: 52, traits: ['強力対空'] },
      { name: '潜水ソ級flagship', hp: 48, armor: 24, traits: ['潜水艦', '先制雷撃あり'] }
    ]
  },
  '7-5': {
    'A': [
      { name: '潜水カ級elite', hp: 33, armor: 16, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'B': [
      { name: '軽母ヌ級flagship', hp: 90, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'D': [
      { name: '水雷戦隊', hp: 50, armor: 30, traits: [] }
    ],
    'J': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'K': [
      { name: '重巡ネ級flagship', hp: 85, armor: 60, traits: [] }
    ],
    'Q': [
      { name: '港湾棲姫', hp: 380, armor: 135, traits: ['陸上型'] }
    ],
    'T': [
      { name: '戦艦ル級flagship', hp: 98, armor: 99, traits: [] }
    ]
  },
  '5-6': {
    'A': [
      { name: '潜水ソ級elite', hp: 38, armor: 19, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'C2': [
      { name: '軽母ヌ級flagship', hp: 90, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'D': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'G': [
      { name: '戦艦ル級flagship', hp: 98, armor: 99, traits: [] }
    ],
    'J': [
      { name: '潜水ヨ級elite', hp: 36, armor: 18, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'K': [
      { name: '軽母ヌ級flagship', hp: 90, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'L': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'N': [
      { name: '空母ヲ級flagship', hp: 96, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'Q': [
      { name: '戦艦タ級flagship', hp: 90, armor: 96, traits: [] }
    ],
    'U': [
      { name: '軽母ヌ級flagship', hp: 90, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'X': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'Z': [
      { name: '深海海月姫', hp: 750, armor: 270, traits: [] }
    ]
  },
  '5-5': {
    'B': [
      { name: '潜水カ級flagship', hp: 42, armor: 21, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'P': [
      { name: '軽母ヌ級改flagship', hp: 98, armor: 88, traits: ['先制航空攻撃あり'] },
      { name: '戦艦レ級flagship', hp: 270, armor: 130, traits: ['先制雷撃あり', '超強力'] }
    ],
    'S': [
      { name: '南方棲戦姫', hp: 380, armor: 188, traits: ['ボス'] },
      { name: '戦艦レ級flagship', hp: 270, armor: 130, traits: ['先制雷撃あり', '超強力'] }
    ]
  },
  '6-4': {
    'B': [
      { name: '潜水カ級flagship', hp: 42, armor: 21, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'D': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] },
      { name: '駆逐イ級後期型', hp: 40, armor: 28, traits: [] }
    ],
    'C': [
      { name: '軽母ヌ級elite', hp: 84, armor: 70, traits: ['先制航空攻撃あり'] }
    ],
    'F': [
      { name: '重巡リ級flagship', hp: 76, armor: 40, traits: [] },
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'N': [
      { name: '離島棲姫', hp: 450, armor: 160, traits: ['陸上型', 'ボス旗艦', '三式弾/WG42特効'] },
      { name: '集積地棲姫', hp: 600, armor: 130, traits: ['陸上型', '内火艇/士魂隊/大発動艇超特効'] },
      { name: '砲台小鬼', hp: 160, armor: 100, traits: ['陸上型', '対地装備特効'] }
    ]
  },
  '6-5': {
    'A': [
      { name: '軽母ヌ級flagship', hp: 90, armor: 80, traits: ['先制航空攻撃あり'] }
    ],
    'C': [
      { name: '潜水ソ級flagship', hp: 48, armor: 24, traits: ['潜水艦', '先制雷撃あり'] }
    ],
    'D': [
      { name: '軽巡ツ級', hp: 48, armor: 48, traits: ['強力対空'] }
    ],
    'F': [
      { name: '空母ヲ級改flagship', hp: 160, armor: 90, traits: ['強力先制航空'] }
    ],
    'G': [
      { name: '重巡ネ級flagship', hp: 85, armor: 60, traits: [] }
    ],
    'M': [
      { name: '空母棲姫', hp: 350, armor: 150, traits: ['ボス旗艦', '高制空値(敵制空112/優勢168)'] },
      { name: '戦艦タ級flagship', hp: 90, armor: 96, traits: [] },
      { name: '軽巡ツ級elite', hp: 56, armor: 52, traits: ['強力対空'] }
    ]
  }
};

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

async function buildRouteThreatsContext(
  request: string,
  currentFleetData: any
): Promise<string> {
  let area = 0;
  if (currentFleetData && currentFleetData.battleInfo && currentFleetData.battleInfo.fleets && currentFleetData.battleInfo.fleets.length > 0) {
    const firstFleet = currentFleetData.battleInfo.fleets[0];
    area = firstFleet.area;
  }
  if (!area) {
    const match = request.match(/(\d)-(\d)/);
    if (match) {
      area = parseInt(match[1], 10) * 10 + parseInt(match[2], 10);
    }
  }
  if (!area) return '';

  const mapName = `${Math.floor(area / 10)}-${area % 10}`;

  let markdown = '';
  try {
    if (typeof window === 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(__dirname, `../../public/knowledge/maps/${mapName}.md`);
      if (fs.existsSync(filePath)) {
        markdown = fs.readFileSync(filePath, 'utf-8');
      }
    } else {
      const res = await fetch(`/knowledge/maps/${mapName}.md`);
      if (res.ok) {
        markdown = await res.text();
      }
    }
  } catch (e) {
    console.warn(`Failed to read map markdown for ${mapName}:`, e);
  }

  if (!markdown) return '';

  const { config } = parseFrontMatter(markdown);
  if (!config) return '';

  const dest = matchDestination(config, request);
  if (!dest) return '';

  const threats: string[] = [];
  threats.push(`目標目的地: ${mapName} ${dest.routeName}`);
  threats.push(`通過パス: ${dest.path.join(' ➔ ')}`);
  if (dest.radius) {
    threats.push(`必要行動半径: ${dest.radius}`);
  }
  if (dest.routeName.includes('輸送')) {
    threats.push('【作戦警告】本ルートは輸送作戦です。ドラム缶や上陸用舟艇（大発動艇等）の輸送用装備を多く積むことで、S/A勝利時の輸送量（TP）を増やすことができます。');
  }
  if (dest.conditions) {
    const conds: string[] = [];
    if (dest.conditions.ships) conds.push(`編成条件: ${dest.conditions.ships}`);
    if (dest.conditions.speed) conds.push(`速力条件: ${dest.conditions.speed}`);
    if (conds.length > 0) threats.push(conds.join(' / '));
  }
  threats.push('');

  const fallbackDb = FALLBACK_MAP_THREATS[mapName] || {};

  for (const node of dest.path) {
    const fleet = currentFleetData && currentFleetData.battleInfo && currentFleetData.battleInfo.fleets
      ? currentFleetData.battleInfo.fleets.find((f: any) => f.nodeName === node)
      : null;

    if (fleet) {
      let cellTypeName = '通常';
      if (fleet.cellType === 1) cellTypeName = '対潜';
      else if (fleet.cellType === 2) cellTypeName = '空襲';
      else if (fleet.isAllSubmarine) cellTypeName = '対潜';

      let airPowerInfo = '';
      if (fleet.fullAirPower && fleet.fullAirPower > 0) {
        const borders = CommonCalc.getAirStatusBorder(fleet.fullAirPower);
        airPowerInfo = ` (敵制空値: ${fleet.fullAirPower} / 優勢目安: ${borders[1]} / 確保目安: ${borders[0]} / 撃墜考慮推奨マージン: ${Math.floor(borders[1] * 1.1)})`;
      }

      threats.push(`【${node}マス (${cellTypeName})${airPowerInfo} の敵編成】`);
      const enemies = fleet.enemies || [];
      enemies.forEach((enemy: any) => {
        if (!enemy || !enemy.data || !enemy.data.name) return;
        const name = enemy.data.name;
        const hp = enemy.hp || enemy.data.hp || 0;
        const armor = enemy.actualArmor || enemy.data.armor || 0;

        const traits: string[] = [];
        const isSub = enemy.isSubmarine || (enemy.data && [13, 14].includes(enemy.data.type));
        if (isSub) {
          traits.push('属性: 潜水艦');
          traits.push('属性: 先制雷撃あり');
        } else {
          if (name.includes('ナ級') && name.includes('flagship')) {
            traits.push('属性: 先制雷撃あり');
          }
          if (name.includes('レ級')) {
            traits.push('属性: 先制雷撃あり');
          }
        }

        if (name.includes('ツ級')) {
          traits.push('属性: 強力対空');
        }

        const isCv = enemy.data.isCV;
        const hasBomber = enemy.items && enemy.items.some((item: any) => {
          const typeId = item.data?.apiTypeId;
          return [7, 8, 11, 47, 56, 57].includes(typeId);
        });
        if (isCv && hasBomber) {
          traits.push('属性: 先制航空攻撃あり');
        }

        const isLand = enemy.data.speed === 0 || enemy.data.isLandInstallation || (name.includes('棲姫') && (name.includes('港湾') || name.includes('飛行場') || name.includes('集積地') || name.includes('砲台') || name.includes('離島')));
        if (isLand) {
          traits.push('属性: 陸上型');
        }

        const traitsText = traits.length > 0 ? ` [${traits.join('/')}]` : '';
        threats.push(`- ${name} (HP ${hp} / 装甲 ${armor})${traitsText}`);
      });
      threats.push('');
    } else {
      let cellTypeName = '通常';
      if (['D', 'H', 'B', 'C'].includes(node)) cellTypeName = '対潜';
      if (node === 'E' && mapName === '7-4') cellTypeName = '空襲';
      if (node === 'K' && mapName === '7-1') cellTypeName = '対潜';
      if (node === 'P' && mapName === '7-4') cellTypeName = 'ボス/対潜';

      threats.push(`【${node}マス (${cellTypeName}) の敵編成】`);
      const fallbackEnemies = fallbackDb[node] || [];
      fallbackEnemies.forEach((enemy: any) => {
        const name = enemy.name;
        const hp = enemy.hp;
        const armor = enemy.armor;
        const traits = enemy.traits.map((t: string) => `属性: ${t}`);
        const traitsText = traits.length > 0 ? ` [${traits.join('/')}]` : '';
        threats.push(`- ${name} (HP ${hp} / 装甲 ${armor})${traitsText}`);
      });
      threats.push('');
    }
  }

  return `\n\n<route_threats>\n${threats.join('\n').trim()}\n</route_threats>`;
}

export async function buildFleetContext(
  shipStocks: ShipStock[],
  shipMasters: ShipMaster[],
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[],
  equipShips: MasterEquipmentShip = {},
  request = '',
  currentFleetData: any = null, // 追加: 現在計算機にロードされている艦隊データ
): Promise<string> {
  if (!shipStocks.length) return '';

  // Match destination first to get route condition requirements and warnings
  let matchedDest: any = null;
  let branchingWarnings: string[] = [];
  let area = 0;
  if (currentFleetData && currentFleetData.battleInfo && currentFleetData.battleInfo.fleets && currentFleetData.battleInfo.fleets.length > 0) {
    const firstFleet = currentFleetData.battleInfo.fleets[0];
    area = firstFleet.area;
  }
  if (!area) {
    const match = request.match(/(\d)-(\d)/);
    if (match) {
      area = parseInt(match[1], 10) * 10 + parseInt(match[2], 10);
    }
  }
  if (area) {
    const mapName = `${Math.floor(area / 10)}-${area % 10}`;
    try {
      let markdown = '';
      if (typeof window === 'undefined') {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.resolve(__dirname, `../../public/knowledge/maps/${mapName}.md`);
        if (fs.existsSync(filePath)) {
          markdown = fs.readFileSync(filePath, 'utf-8');
        }
      } else {
        const res = await fetch(`/knowledge/maps/${mapName}.md`);
        if (res.ok) {
          markdown = await res.text();
        }
      }
      if (markdown) {
        const { config } = parseFrontMatter(markdown);
        if (config) {
          matchedDest = matchDestination(config, request);
          if (matchedDest && currentFleetData && currentFleetData.fleetInfo) {
            branchingWarnings = checkBranchConditions(matchedDest, currentFleetData.fleetInfo);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load map for branch conditions', e);
    }
  }

  const whitelistedTypes = new Set<number>();
  if (matchedDest && matchedDest.conditions && matchedDest.conditions.ships) {
    const condShips = matchedDest.conditions.ships;
    if (condShips.includes('水母')) whitelistedTypes.add(16);
    if (condShips.includes('航戦')) whitelistedTypes.add(10);
    if (condShips.includes('軽空')) whitelistedTypes.add(7);
    if (condShips.includes('潜水')) { whitelistedTypes.add(13); whitelistedTypes.add(14); }
    if (condShips.includes('航巡')) whitelistedTypes.add(6);
    if (condShips.includes('揚陸')) whitelistedTypes.add(17);
    if (condShips.includes('補給')) whitelistedTypes.add(22);
    if (condShips.includes('海防')) whitelistedTypes.add(1);
    if (condShips.includes('雷巡')) whitelistedTypes.add(4);
    if (condShips.includes('軽巡')) whitelistedTypes.add(3);
    if (condShips.includes('駆逐')) whitelistedTypes.add(2);
  }

  // アクティブ編成内の艦娘IDを収集して、これらは必ず候補リストに残す
  const activeShipIds = new Set<number>();
  const activeShipNames: string[] = [];
  if (currentFleetData && currentFleetData.fleetInfo) {
    currentFleetData.fleetInfo.fleets.forEach((f: any) => {
      if (f.ships) {
        f.ships.forEach((s: any) => {
          if (s && s.data && s.data.id > 0) {
            activeShipIds.add(s.data.id);
            activeShipNames.push(s.data.name);
          }
        });
      }
    });
  }

  console.log('=== [KC-AI] Fleet Context Building ===');
  console.log('Active Ships in Fleet:', activeShipNames);

  // 1. リクエストによる一次絞り込み
  const initialStocks = request
    ? filterShipsByRequest(shipStocks, request)
    : shipStocks;

  const daihatsuMaster = itemMasters.find((im) => im.name === '大発動艇');
  const unconditionalAswIds = [141, 478, 394, 893, 624, 562, 596];
  const specialAttackLeaderIds = [
    911, 916, 546, 541, 573, 576, 577, 1496, 918,
    703, 685, 704, 686, 591, 592, 694, 593, 954
  ];

  // 装備搭載のみ（既存編成の装備調整）ジャンルの自動検知
  const isEquipOnlyRequest = request.includes('装備') || request.includes('搭載') || request.includes('載せ') || request.includes('既存') || request.includes('現在') || request.includes('今の編成');

  // 2. 艦種別にグループ化して、各艦種の上位10隻＋特殊能力持ちを残す
  const groups: Record<string, ShipStock[]> = {
    bb: [], cv: [], ca: [], cl: [], dd: [], ss: [], aux: []
  };

  initialStocks.forEach((stock) => {
    const master = shipMasters.find((m) => m.id === stock.id);
    if (!master) return;

    // 装備調整のみの場合、現在編成外の艦娘は追加しない
    if (isEquipOnlyRequest && !activeShipIds.has(stock.id)) {
      return;
    }

    // 特殊能力・用途がある艦は最優先
    const isSpecial =
      activeShipIds.has(stock.id) ||
      unconditionalAswIds.includes(master.id) ||
      specialAttackLeaderIds.includes(master.id) ||
      whitelistedTypes.has(master.type) ||
      (daihatsuMaster && ShipValidation.isValidItem(master, daihatsuMaster, 0));

    if (isSpecial) return;

    const type = master.type;
    if ([8, 9, 10].includes(type)) groups.bb.push(stock);
    else if ([7, 11, 18].includes(type)) groups.cv.push(stock);
    else if ([5, 6].includes(type)) groups.ca.push(stock);
    else if ([3, 4, 21].includes(type)) groups.cl.push(stock);
    else if (type === 2) groups.dd.push(stock);
    else if ([13, 14].includes(type)) groups.ss.push(stock);
    else groups.aux.push(stock);
  });

  const selectedStocks: ShipStock[] = [];

  // まず特殊枠を追加
  initialStocks.forEach((stock) => {
    const master = shipMasters.find((m) => m.id === stock.id);
    if (!master) return;

    if (isEquipOnlyRequest) {
      // 装備搭載のみの場合は現在編成中の艦娘のみを追加
      if (activeShipIds.has(stock.id)) {
        selectedStocks.push(stock);
      }
      return;
    }

    // 提督の指示文に特定の艦娘名が含まれている場合、ベース艦名(改二/改等を正規化)も含めて柔軟マッチング
    const baseName = master ? master.name.split('(')[0].replace(/(改二甲|改二乙|改二重|改二丁|改二特|改二|改甲|改乙|改丁|改|特|甲|乙|重|三|丁|Mk\.II)/g, '').trim() : '';
    const fullName = master ? master.name.split('(')[0].trim() : '';
    const matchedRequestedShip = master && baseName && (request.includes(baseName) || request.includes(fullName));

    const isSpecial =
      matchedRequestedShip ||
      activeShipIds.has(stock.id) ||
      unconditionalAswIds.includes(master.id) ||
      specialAttackLeaderIds.includes(master.id) ||
      whitelistedTypes.has(master.type) ||
      (daihatsuMaster && ShipValidation.isValidItem(master, daihatsuMaster, 0));
    if (isSpecial) {
      selectedStocks.push(stock);
    }
  });

  // 各グループの上位4隻を追加（トータル35隻程度へ集約）
  const isAswMap = area === 71 || area === 15 || area === 74 || request.includes('7-1') || request.includes('1-5') || request.includes('対潜') || request.includes('潜水');
  Object.keys(groups).forEach((key) => {
    const group = groups[key];
    group.sort((a, b) => {
      if (isAswMap) {
        const mA = shipMasters.find((m) => m && m.id === a.id);
        const mB = shipMasters.find((m) => m && m.id === b.id);
        const aswA = mA?.maxAsw || 0;
        const aswB = mB?.maxAsw || 0;
        if (aswA !== aswB) return aswB - aswA;
      }
      return b.level - a.level;
    });
    selectedStocks.push(...group.slice(0, 4));
  });

  // 重複除去および優先度順ソート（同一キャラは最高レベルの1隻のみに厳選）
  const uniqueSelected = Array.from(new Set(selectedStocks));
  uniqueSelected.sort((a, b) => {
    const mA = shipMasters.find((m) => m && m.id === a.id);
    const mB = shipMasters.find((m) => m && m.id === b.id);
    const baseA = mA ? mA.name.split('(')[0].replace(/(改二甲|改二乙|改二重|改二丁|改二特|改二|改甲|改乙|改丁|改|特|甲|乙|重|三|丁|Mk\.II)/g, '').trim() : '';
    const baseB = mB ? mB.name.split('(')[0].replace(/(改二甲|改二乙|改二重|改二丁|改二特|改二|改甲|改乙|改丁|改|特|甲|乙|重|三|丁|Mk\.II)/g, '').trim() : '';
    const reqA = mA && baseA && (request.includes(baseA) || request.includes(mA.name.split('(')[0]));
    const reqB = mB && baseB && (request.includes(baseB) || request.includes(mB.name.split('(')[0]));
    if (reqA !== reqB) return reqA ? -1 : 1;

    const aActive = activeShipIds.has(a.id);
    const bActive = activeShipIds.has(b.id);
    if (aActive !== bActive) return aActive ? -1 : 1;

    if (isAswMap) {
      const aswA = mA?.maxAsw || 0;
      const aswB = mB?.maxAsw || 0;
      if (aswA !== aswB) return aswB - aswA;
    }
    return b.level - a.level;
  });

  // キャラクター単位での1隻重複排除（レベル最高隻を残す）
  const charDeduplicated: ShipStock[] = [];
  const seenCharIds = new Set<number | string>();
  uniqueSelected.forEach((stock) => {
    const master = shipMasters.find((m) => m && m.id === stock.id);
    const charKey = master ? (master.originalId || master.albumId || master.name.split('(')[0]) : stock.id;
    if (!seenCharIds.has(charKey)) {
      seenCharIds.add(charKey);
      charDeduplicated.push(stock);
    }
  });

  let filteredStocks = charDeduplicated;
  if (filteredStocks.length > 80) {
    filteredStocks = filteredStocks.slice(0, 80);
  }

  const candidateNames = filteredStocks.map(stock => {
    const master = shipMasters.find((m) => m.id === stock.id);
    const tag = stock.area ? `[札${stock.area}]` : '[無札]';
    return master ? `${master.name}(shipId:${stock.id}/Lv${stock.level})${tag}` : `shipId:${stock.id}`;
  });
  console.log('Candidate Ships Passed to AI:', candidateNames);
  console.log('=======================================');

  // 手持ち艦娘リスト（shipIdを明記）
  const shipLines = filteredStocks.map((stock) => {
    const master = shipMasters.find((m) => m.id === stock.id);
    const name = master ? master.name : `ID:${stock.id}`;
    const typeName = master ? getShipTypeName(master.type) : '';
    const expand = stock.releaseExpand ? ' [補強増設あり]' : '';
    const areaTag = stock.area ? ` [出撃札: 札${stock.area}]` : ' [未出撃/無札]';

    const aswVal = master ? Ship.getStatusFromLevel(stock.level, master.maxAsw, master.minAsw) + (stock.improvement?.asw || 0) : 0;
    const fireVal = master ? master.fire + (stock.improvement?.fire || 0) : 0;
    const torpedoVal = master ? master.torpedo + (stock.improvement?.torpedo || 0) : 0;
    const antiAirVal = master ? master.antiAir + (stock.improvement?.antiAir || 0) : 0;
    const scoutVal = master ? Ship.getStatusFromLevel(stock.level, master.maxScout, master.minScout) : 0;
    const avoidVal = master ? Ship.getStatusFromLevel(stock.level, master.maxAvoid, master.minAvoid) : 0;
    const hpVal = master ? (stock.level > 99 ? master.hp2 : master.hp) + (stock.improvement?.hp || 0) : 0;
    const luckVal = master ? master.luck + (stock.improvement?.luck || 0) : 0;
    const speedVal = master ? (master.speed === 10 ? '高速' : master.speed === 5 ? '低速' : `速力${master.speed}`) : '不明';

    const isAswReady = (stock && master) ? checkOaswPotential(stock, master, itemStocks, itemMasters) : '';

    let restrictionLine = '';
    if (master) {
      const restrictions = SHIP_SLOT_EQUIP_RESTRICTIONS.filter((r) => r.shipIds.includes(master.id));
      if (restrictions.length > 0) {
        const restrictionNotes = restrictions.map((r) => r.note);
        restrictionLine = `\n    └スロット制限: ${restrictionNotes.join(' / ')}`;
      }
    }

    const expandSlotText = stock.releaseExpand ? '＋補強増設' : '';
    const slotCountText = master ? ` [${master.slotCount}スロット${expandSlotText}]` : '';
    const slotsText = master && master.slots && master.slots.length > 0 && master.slots.some((s) => s > 0)
      ? ` [搭載数: ${master.slots.slice(0, master.slotCount).join('/')}]`
      : '';

    const statsInfo = ` [HP:${hpVal}/火力:${fireVal}/雷装:${torpedoVal}/対空:${antiAirVal}/対潜:${aswVal}/索敵:${scoutVal}/回避:${avoidVal}/運:${luckVal}/${speedVal}]`;

    const rangeNames = ['', '短', '中', '長', '超長'];
    const baseRangeName = master ? (rangeNames[master.range] || '中') : '中';
    return `・${name} (shipId:${stock.id}/Lv${stock.level}, 艦種:${typeName}, 素の射程:${baseRangeName})${expand}${areaTag}${isAswReady}${slotCountText}${slotsText}${statsInfo}${restrictionLine}`;
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

  // アクティブ編成で現在装備されているアイテムのIDを収集
  const activeItemIds = new Set<number>();
  if (currentFleetData && currentFleetData.fleetInfo) {
    currentFleetData.fleetInfo.fleets.forEach((f: any) => {
      if (f.ships) {
        f.ships.forEach((s: any) => {
          if (s && s.items) {
            s.items.forEach((item: any) => {
              if (item && item.data && item.data.id > 0) {
                activeItemIds.add(item.data.id);
              }
            });
          }
          if (s && s.exItem && s.exItem.data && s.exItem.data.id > 0) {
            activeItemIds.add(s.exItem.data.id);
          }
        });
      }
    });
  }

  // 装備をカテゴリー別に分類する
  const itemGroups: Record<string, { stock: ItemStock; master: ItemMaster; score: number }[]> = {
    smallGun: [], mediumGun: [], largeGun: [], secGun: [],
    torpedo: [], fighter: [], bomber: [], recon: [],
    radar: [], asw: [], engine: [], landing: [], others: []
  };

  for (const stock of itemStocks) {
    if (!validItemIdsForCandidates.has(stock.id)) continue;

    const itemMaster = itemMasters.find((m) => m.id === stock.id);
    if (!itemMaster) continue;

    const type = itemMaster.apiTypeId;
    let category = 'others';
    let score = 0;

    // 最高改修値を特定して★補正を加算
    const maxRemodel = stock.num.reduce((max, val, idx) => (val > 0 ? idx : max), 0);
    const remodelBonus = Math.sqrt(maxRemodel);

    if (type === 1) { category = 'smallGun'; score = (itemMaster.fire || 0) + remodelBonus; }
    else if (type === 2) { category = 'mediumGun'; score = (itemMaster.fire || 0) + remodelBonus; }
    else if ([3, 38].includes(type)) { category = 'largeGun'; score = (itemMaster.fire || 0) + remodelBonus * 1.5; }
    else if (type === 4) { category = 'secGun'; score = (itemMaster.fire || 0) + remodelBonus; }
    else if ([5, 32].includes(type)) { category = 'torpedo'; score = (itemMaster.torpedo || 0) + remodelBonus * 1.2; }
    else if ([6, 39, 45, 48].includes(type)) { category = 'fighter'; score = (itemMaster.antiAir || 0) + maxRemodel * 0.2 + (itemMaster.name.includes('岩本') || itemMaster.name.includes('一航戦') ? 5 : 0); }
    else if ([7, 8, 47, 56, 57].includes(type)) {
      const isNamedPlane = itemMaster.name.includes('村田隊') || itemMaster.name.includes('友永隊') || itemMaster.name.includes('一航戦') || itemMaster.name.includes('江草隊');
      category = 'bomber';
      score = (itemMaster.torpedo || 0) * 1.5 + (itemMaster.bomber || 0) * 1.5 + maxRemodel * 0.5 + (isNamedPlane ? 10 : 0);
    }
    else if ([9, 10, 41, 49, 58].includes(type)) { category = 'recon'; score = (itemMaster.scout || 0) + maxRemodel * 0.2; }
    else if ([12, 13, 22].includes(type)) { category = 'radar'; score = (itemMaster.scout || 0) + (itemMaster.accuracy || 0) + remodelBonus; }
    else if ([14, 15, 24, 40, 53].includes(type)) { category = 'asw'; score = (itemMaster.asw || 0) + remodelBonus; }
    else if (type === 17) { category = 'engine'; score = 0; }
    else if ([30, 37].includes(type)) { category = 'landing'; score = 0; }

    itemGroups[category].push({ stock, master: itemMaster, score });
  }

  const allowedItemIds = new Set<number>();
  const utilityTypes = new Set([18, 29, 30, 33, 34, 42]);
  Object.keys(itemGroups).forEach((category) => {
    const list = itemGroups[category];
    
    // 現在装備中、缶・タービン、大発・内火艇、および重要ユーティリティ装備（ドラム缶、三式弾、照明弾、探照灯、司令部施設等）は無条件で許可
    list.forEach((entry) => {
      const isUtility = entry.master && utilityTypes.has(entry.master.apiTypeId);
      if (activeItemIds.has(entry.stock.id) || ['engine', 'landing'].includes(category) || isUtility) {
        allowedItemIds.add(entry.stock.id);
      }
    });

    // それ以外はスコア順（改修値も加味）でソートして上位10種類を採用
    list.sort((a, b) => {
      const aRemodelMax = a.stock.num.reduce((max, val, idx) => (val > 0 ? idx : max), 0);
      const bRemodelMax = b.stock.num.reduce((max, val, idx) => (val > 0 ? idx : max), 0);
      if (a.score !== b.score) return b.score - a.score;
      return bRemodelMax - aRemodelMax;
    });

    // 各カテゴリ最優良の上位4種類(上位改修・上位性能)へ厳選し、AIへ手渡すトークン量を大幅削減・精鋭化
    const top4 = list.slice(0, 4);
    top4.forEach((entry) => {
      allowedItemIds.add(entry.stock.id);
    });
  });

  // 手持ち装備の所持数を集計して一覧化 (候補艦娘の誰かが装備可能なもののみに絞り込む)
  const itemLines: string[] = [];
  for (const stock of itemStocks) {
    if (!allowedItemIds.has(stock.id)) continue;

    const itemMaster = itemMasters.find((m) => m.id === stock.id);
    if (!itemMaster) continue;

    // ステータス情報の構築
    const stats: string[] = [getItemTypeName(itemMaster.apiTypeId)];
    if (itemMaster.fire) stats.push(`火力+${itemMaster.fire}`);
    if (itemMaster.torpedo) stats.push(`雷装+${itemMaster.torpedo}`);
    if (itemMaster.antiAir) stats.push(`対空+${itemMaster.antiAir}`);
    if (itemMaster.asw) stats.push(`対潜+${itemMaster.asw}`);
    if (itemMaster.scout) stats.push(`索敵+${itemMaster.scout}`);
    if (itemMaster.accuracy) stats.push(`命中+${itemMaster.accuracy}`);
    if (itemMaster.avoid) stats.push(`回避+${itemMaster.avoid}`);
    if (itemMaster.isPlane && itemMaster.radius) stats.push(`行動半径:${itemMaster.radius}`);
    if (itemMaster.interception) stats.push(`迎撃+${itemMaster.interception}`);
    if (itemMaster.antiBomber) stats.push(`対爆+${itemMaster.antiBomber}`);
    
    // 対地特効装備の判定
    const isAntiLand = [18, 24, 37, 46, 52].includes(itemMaster.apiTypeId) || 
                       itemMaster.enabledAttackLandBase ||
                       (itemMaster.apiTypeId === 30 && itemMaster.name.includes('大発')) ||
                       itemMaster.name.includes('内火艇') ||
                       itemMaster.name.includes('陸戦隊');
    if (isAntiLand) stats.push('対地特効');

    // 輸送TPスコアの算出
    const tempItem = new Item({ master: itemMaster, remodel: 0 });
    if (tempItem.tp > 0) {
      stats.push(`輸送スコア:${tempItem.tp}`);
    }

    const statText = stats.length > 0 ? ` [${stats.join(', ')}]` : '';

    for (let remodel = 0; remodel < stock.num.length; remodel += 1) {
      const count = stock.num[remodel];
      if (count <= 0) continue;
      const starText = remodel > 0 ? `★+${remodel}` : '';
        
      // 航空機の場合、代表的なスロットサイズでの最大熟練度における予測制空値を計算
      // 1スロット目ボーナス: 熟練度による制空値が1.2倍（最大熟練度「>>」のときのボーナス）
      let airPowerText = '';
      if (itemMaster.isPlane && !itemMaster.isRecon) {
        if (itemMaster.isABAttacker) {
          const slotSize = itemMaster.airbaseMaxSlot || 18;
          const tempItem = new Item({
            master: itemMaster,
            remodel,
            level: 120,
            slot: slotSize,
          });
          airPowerText = ` [熟練度>>時(搭載${slotSize}): 出撃制空:${tempItem.fullAirPower}/防空制空:${tempItem.fullDefenseAirPower}]`;
        } else {
          const sampleSlots = [6, 12, 18, 24];
          const airPowers = sampleSlots.map((slotSize) => {
            const tempItem = new Item({
              master: itemMaster,
              remodel,
              level: 120, // 熟練度最大(>>マーク)
              slot: slotSize,
            });
            // 1スロット目ボーナス: 熟練度ボーナス(bonusAirPower)が1.2倍に強化される
            const baseAP = tempItem.fullAirPower;
            const slot1BonusAP = Math.floor(tempItem.actualAntiAir * Math.sqrt(slotSize) + tempItem.bonusAirPower * 1.2);
            return `搭載${slotSize}→通常:${baseAP}/1スロ目:${slot1BonusAP}`;
          });
        }
      }

      itemLines.push(`·${itemMaster.name}${starText}${statText}${airPowerText} x ${count}`);
    }
  }

  const specialAttackHints = buildSpecialAttackHints(shipStocks, shipMasters);

  // 現在の艦隊情報を文字列にする
  let currentFleetText = 'なし（未編成）';
  if (currentFleetData && currentFleetData.fleetInfo) {
    const fTexts: string[] = [];
    if (currentFleetData.fleetInfo.fleets && currentFleetData.fleetInfo.fleets.length) {
      currentFleetData.fleetInfo.fleets.forEach((f: any, idx: number) => {
        const shipNames = f.ships
          ? f.ships.map((s: any) => {
              if (typeof s === 'string') return s;
              return (s && s.data && s.data.name) ? s.data.name : '未配備';
            }).join(', ')
          : 'なし';
        fTexts.push(`・第${idx + 1}艦隊: [${shipNames}] (合計制空値:${f.airPower || 0}, 判定索敵値:${f.los || 0}, 速力:${f.speed || '不明'})`);
      });
    }
    currentFleetText = fTexts.join('\n');
  }

  const isSortieRequest = request.match(/(\d)-(\d)/) || request.includes('出撃') || request.includes('攻略') || request.includes('周回');
  const remodelContext = isSortieRequest ? '' : buildRemodelCandidatesContext(shipStocks, shipMasters);
  const routeThreatsContext = await buildRouteThreatsContext(request, currentFleetData);

  let warningsText = '';
  if (branchingWarnings.length > 0) {
    warningsText = `\n\n【警告：現在の艦隊構成によるルート逸れ・分岐条件違反】\n${branchingWarnings.map((w) => `・${w}`).join('\n')}`;
  }

  return `
【編成・装備アセンブリの前提ルール】
1. 提案を行う際は、解説テキストの中に必ず「敵ボス基準値」と「提案する自軍の予測値」を並べた「予測比較Markdownテーブル（制空値、索敵値、対潜隻数、艦隊速力）」を出力してください。
2. 基地航空隊の提案がある場合は、出力JSONの「airbases」フィールドに情報を格納してください。
   スキーマ例: "airbases": [ { "index": 0, "mode": 1, "items": ["一式陸攻★+0", "零式艦戦52型★+10"] } ] (indexは0が第一基地、1が第二基地。modeは1が出撃、2が防空、0が待機。itemsは最大4つの装備名。基地配置も所持装備一覧にあるもののみを指定してください)
3. 装備割り当て時は、艦種ごとの一般的なスロット装備可能制限や、一部艦娘（伊勢型改二など）に提示されている「スロット制限」を満たすようにしてください。
4. 【夜戦カットイン(CI)主要テンプレート条件】
   ・主魚電（主砲1, 魚雷1, 電探1）: 駆逐艦専用、要D型主砲/水上電探等
   ・魚魚（魚雷2枚以上）: 全艦種共通、発動率・威力共に安定した基本CI
   ・魚水電（魚雷1, 水雷戦隊見張員1, 電探1）: 駆逐艦専用、高い命中率と発動率
   ・潜水CI: 潜水艦専用、魚雷2枚、または潜水艦電探1+潜水艦魚雷1
   ※夜戦CIを狙う艦娘に対しては、上記の必要カテゴリの装備を過不足なく割り当ててください。

【現在の計算機上の編成情報】
${currentFleetText}

【所持装備一覧】
${itemLines.join('\n')}

【手持ち艦娘 (絞込後${filteredStocks.length}隻)】
${shipLines.join('\n')}${specialAttackHints}${remodelContext}${routeThreatsContext}${warningsText}
`.trim();
}

/**
 * 改装設計図・戦闘詳報・試製甲板カタパルトを必要とする未完了の改造候補をスキャンしてリスト化する
 */
function buildRemodelCandidatesContext(
  shipStocks: ShipStock[],
  shipMasters: ShipMaster[],
): string {
  const candidates: {
    currentName: string;
    currentLv: number;
    targetName: string;
    targetLv: number;
    blueprints: number;
    actionReports: number;
    catapults: number;
    remainingExp: number;
  }[] = [];

  for (const stock of shipStocks) {
    const currentMaster = shipMasters.find((m) => m.id === stock.id);
    if (!currentMaster) continue;

    // 同一の艦娘（originalId）のすべての改装段階を取得
    const allVersions = shipMasters.filter((m) => m.originalId === currentMaster.originalId);

    // 現在の段階より上位の段階をすべてチェック
    for (const targetMaster of allVersions) {
      if (targetMaster.version <= currentMaster.version) continue;

      // targetMaster に至る手前の段階（beforeId）を特定し、そこからの改装コストを取得
      const beforeMaster = allVersions.find((m) => m.id === targetMaster.beforeId);
      if (!beforeMaster) continue;

      const blueprints = beforeMaster.blueprints || 0;
      const actionReports = beforeMaster.actionReports || 0;
      const catapults = beforeMaster.catapults || 0;

      // 設計図、詳報、カタパルトのいずれかを消費するか確認
      if (blueprints === 0 && actionReports === 0 && catapults === 0) {
        continue;
      }

      // 手持ちの中に、すでにこの目標バージョン以上の段階を1隻でも所有しているかチェック
      const hasHigherOwned = shipStocks.some((s) => {
        const m = shipMasters.find((x) => x.id === s.id);
        return m && m.originalId === currentMaster.originalId && m.version >= targetMaster.version;
      });

      if (!hasHigherOwned) {
        // 必要Lvまでの残り必要経験値を算出
        const nextLv = beforeMaster.nextLv;
        const targetBorder = Const.LEVEL_BORDERS.find((b) => b.lv === nextLv);
        const targetReqExp = targetBorder ? targetBorder.req : 0;
        const remainingExp = Math.max(0, targetReqExp - stock.exp);

        candidates.push({
          currentName: currentMaster.name,
          currentLv: stock.level,
          targetName: targetMaster.name,
          targetLv: nextLv,
          blueprints,
          actionReports,
          catapults,
          remainingExp,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return '';
  }

  // 同名艦の重複を整理（複数持っている場合、もっともレベルが高いものを基準にする）
  const uniqueCandidates: typeof candidates = [];
  for (const cand of candidates) {
    const existing = uniqueCandidates.find(
      (c) => c.currentName === cand.currentName && c.targetName === cand.targetName
    );
    if (existing) {
      if (cand.currentLv > existing.currentLv) {
        existing.currentLv = cand.currentLv;
        existing.remainingExp = cand.remainingExp;
      }
    } else {
      uniqueCandidates.push(cand);
    }
  }

  const lines = uniqueCandidates.map((c) => {
    const materials: string[] = [];
    if (c.blueprints > 0) materials.push(`改装設計図x${c.blueprints}`);
    if (c.actionReports > 0) materials.push(`戦闘詳報x${c.actionReports}`);
    if (c.catapults > 0) materials.push(`試製甲板カタパルトx${c.catapults}`);

    return `・${c.currentName} (Lv${c.currentLv}) ➔ ${c.targetName} (必要Lv${c.targetLv}, ${materials.join(', ')}, 残り必要EXP: ${c.remainingExp.toLocaleString()})`;
  });

  return `\n\n【改装未完了の候補と必要資材】\n${lines.join('\n')}`;
}

/**
 * 艦娘が先制対潜(OASW)可能かどうか、およびその条件を判定する
 */
export function checkOaswPotential(
  stock: ShipStock,
  master: ShipMaster,
  itemStocks: ItemStock[],
  itemMasters: ItemMaster[]
): string {
  // 1. 無条件先制対潜（一部の固有艦・およびminAsw >= 50 の艦種制限を満たすもの）
  // 既存の unconditionalAswIds = [141, 478, 394, 893, 624, 562, 596];
  const unconditionalAswIds = [141, 478, 394, 893, 624, 562, 596];
  // 鈴谷/熊野軽空母(508, 509)はOASW不可
  const isSuzuKumaCVL = master.id === 508 || master.id === 509;

  if (!isSuzuKumaCVL && (unconditionalAswIds.includes(master.id) || (master.minAsw >= 50 && ![7, 11, 18, 9, 10].includes(master.type)))) {
    return ' [無条件OASW]';
  }

  if (isSuzuKumaCVL) {
    return ' [OASW不可]';
  }

  // 2. 装備搭載判定用の手持ち装備リスト作成
  // その艦娘が装備可能な対潜装備を集める
  const baseAsw = Ship.getStatusFromLevel(stock.level, master.maxAsw, master.minAsw) + (stock.improvement?.asw || 0);

  // 装備可能かつ対潜に関わるアイテムを収集
  const validAswItems: { id: number; name: string; apiTypeId: number; asw: number; isAttacker: boolean; isAswPlane: boolean }[] = [];
  for (const itemStock of itemStocks) {
    const itemMaster = itemMasters.find((m) => m.id === itemStock.id);
    if (!itemMaster) continue;

    // 装備可能かどうか（通常スロット、または増設スロットのいずれか）
    const canEquipNormal = ShipValidation.isValidItem(master, itemMaster, 0);
    const canEquipExpand = stock.releaseExpand && ShipValidation.isValidItem(master, itemMaster, Const.EXPAND_SLOT_INDEX);
    if (!canEquipNormal && !canEquipExpand) continue;

    // 改修値ごとに在庫を展開
    for (let remodel = 0; remodel < itemStock.num.length; remodel++) {
      const count = itemStock.num[remodel];
      for (let i = 0; i < count; i++) {
        validAswItems.push({
          id: itemMaster.id,
          name: itemMaster.name,
          apiTypeId: itemMaster.apiTypeId,
          asw: itemMaster.asw || 0,
          isAttacker: !!itemMaster.isAttacker,
          isAswPlane: !!itemMaster.isAswPlane,
        });
      }
    }
  }

  // 对潜値高的排前面
  validAswItems.sort((a, b) => b.asw - a.asw);

  // 艦娘のスロット数
  const slots = master.slotCount || 0;

  const { type } = master;

  // -- 各種艦種/IDの個別判定 --

  // A. 日向改二 (554)
  if (master.id === 554) {
    // S-51J (326) / S-51J改 (327) のいずれかがある
    const hasS51J = validAswItems.some(item => item.id === 326 || item.id === 327);
    // カ号 (69) / オ号改 (324) / オ号改二 (325) が2個以上ある
    const autogyroCount = validAswItems.filter(item => [69, 324, 325].includes(item.id)).length;
    if (hasS51J) {
      return ' [OASW可能 (要S-51J等ヘリ1機)]';
    }
    if (autogyroCount >= 2) {
      return ' [OASW可能 (要カ号等ヘリ2機)]';
    }
    return ' [OASW不可（ヘリ不足/要S-51J等）]';
  }

  // B. 大鷹型改/改二, 加賀改二護 (646)
  const isTaiyouClassKaiOrKagaGo = (master.type2 === 76 && master.name.indexOf('改') >= 0) || master.id === 646;
  if (isTaiyouClassKaiOrKagaGo) {
    const hasRequiredPlane = validAswItems.some(item => (item.isAttacker && item.asw >= 1) || item.isAswPlane);
    if (hasRequiredPlane) {
      return ' [OASW可能 (要対潜機1スロット)]';
    }
    return ' [OASW不可（対潜機不足）]';
  }

  // C. 山汐丸改 (717)
  if (master.id === 717) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);
    if (!sonar) {
      return ' [OASW不可（ソナーなし）]';
    }
    const plane = validAswItems.find(item => item.id !== sonar.id && ((item.isAttacker && item.asw >= 1) || item.isAswPlane));
    
    if (baseAsw + sonar.asw >= 100) {
      return ` [OASW可能 (要ソナー1スロット/対潜値:${baseAsw + sonar.asw})]`;
    }
    if (plane && (baseAsw + sonar.asw + plane.asw) >= 100) {
      return ` [OASW可能 (要ソナー1スロット+対潜機1スロット/対潜値:${baseAsw + sonar.asw + plane.asw})]`;
    }

    let itemAswSum = sonar.asw;
    let slotsUsed = 1;
    if (plane) {
      itemAswSum += plane.asw;
      slotsUsed++;
    }
    const remainingAswItems = validAswItems.filter(item => item !== sonar && item !== plane);
    for (let i = 0; i < slots - slotsUsed && i < remainingAswItems.length; i++) {
      itemAswSum += remainingAswItems[i].asw;
      slotsUsed++;
      if (baseAsw + itemAswSum >= 100) {
        return ` [OASW可能 (要対潜兵装${slotsUsed}スロット/対潜値:${baseAsw + itemAswSum})]`;
      }
    }
    return ` [OASW不可（対潜値不足:${baseAsw + itemAswSum}/要100）]`;
  }

  // D. 扶桑型改二 (411, 412)
  if (master.id === 411 || master.id === 412) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);
    if (!sonar) return ' [OASW不可（ソナーなし）]';
    const subWeapon = validAswItems.find(item => item.id !== sonar.id && (item.apiTypeId === 11 || item.apiTypeId === 15 || item.isAswPlane));
    if (!subWeapon) return ' [OASW不可（水爆/爆雷なし）]';
    
    let itemAswSum = sonar.asw + subWeapon.asw;
    let slotsUsed = 2;
    if (baseAsw + itemAswSum >= 100) {
      return ` [OASW可能 (要ソナー1スロット+対潜兵装1スロット/対潜値:${baseAsw + itemAswSum})]`;
    }

    const remainingAswItems = validAswItems.filter(item => item !== sonar && item !== subWeapon);
    for (let i = 0; i < slots - slotsUsed && i < remainingAswItems.length; i++) {
      itemAswSum += remainingAswItems[i].asw;
      slotsUsed++;
      if (baseAsw + itemAswSum >= 100) {
        return ` [OASW可能 (要対潜兵装${slotsUsed}スロット/対潜値:${baseAsw + itemAswSum})]`;
      }
    }
    return ` [OASW不可（対潜値不足:${baseAsw + itemAswSum}/要100）]`;
  }

  // E. 航空戦艦 (BBV) または 揚陸艦 (LHA)
  if (type === 10 || type === 17) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);
    if (!sonar) return ' [OASW不可（ソナーなし）]';
    const plane = validAswItems.find(item => item.id !== sonar.id && ((item.isAttacker && item.asw >= 1) || item.isAswPlane));
    if (!plane) return ' [OASW不可（対潜機なし）]';
    
    let itemAswSum = sonar.asw + plane.asw;
    let slotsUsed = 2;
    if (baseAsw + itemAswSum >= 100) {
      return ` [OASW可能 (要ソナー1スロット+対潜機1スロット/対潜値:${baseAsw + itemAswSum})]`;
    }

    const remainingAswItems = validAswItems.filter(item => item !== sonar && item !== plane);
    for (let i = 0; i < slots - slotsUsed && i < remainingAswItems.length; i++) {
      itemAswSum += remainingAswItems[i].asw;
      slotsUsed++;
      if (baseAsw + itemAswSum >= 100) {
        return ` [OASW可能 (要対潜兵装${slotsUsed}スロット/対潜値:${baseAsw + itemAswSum})]`;
      }
    }
    return ` [OASW不可（対潜値不足:${baseAsw + itemAswSum}/要100）]`;
  }

  // F. 駆逐 軽巡 練巡 雷巡 補給
  const isStandardAswShip = [2, 3, 4, 21, 22].includes(type);
  if (isStandardAswShip) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);
    if (!sonar) {
      return ' [OASW不可（ソナーなし）]';
    }

    let currentSum = sonar.asw;
    let requiredSlots = 1;
    let success = (baseAsw + currentSum) >= 100;
    const remainingAswItems = validAswItems.filter(item => item !== sonar);
    while (!success && requiredSlots < slots && (requiredSlots - 1) < remainingAswItems.length) {
      currentSum += remainingAswItems[requiredSlots - 1].asw;
      requiredSlots++;
      if ((baseAsw + currentSum) >= 100) {
        success = true;
      }
    }
    if (success) {
      return ` [OASW可能 (要対潜兵装${requiredSlots}スロット/要ソナー/対潜値:${baseAsw + currentSum})]`;
    }
    return ` [OASW不可 (対潜値不足:${baseAsw + currentSum}/要100)]`;
  }

  // G. 海防艦
  if (type === 1) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);

    let bestSlotsUsed = 999;
    let bestAswVal = 0;

    // Check Path 2: displayAsw >= 60 && hasSonar
    if (sonar) {
      let currentSum = sonar.asw;
      let requiredSlots = 1;
      let success = (baseAsw + currentSum) >= 60;
      const remainingAswItems = validAswItems.filter(item => item !== sonar);
      while (!success && requiredSlots < slots && (requiredSlots - 1) < remainingAswItems.length) {
        currentSum += remainingAswItems[requiredSlots - 1].asw;
        requiredSlots++;
        if ((baseAsw + currentSum) >= 60) {
          success = true;
        }
      }
      if (success && requiredSlots < bestSlotsUsed) {
        bestSlotsUsed = requiredSlots;
        bestAswVal = baseAsw + currentSum;
      }
    }

    // Check Path 1: displayAsw >= 75 && itemAsw >= 4
    let currentSum = 0;
    let requiredSlots = 0;
    let success = false;
    for (let i = 0; i < slots && i < validAswItems.length; i++) {
      currentSum += validAswItems[i].asw;
      requiredSlots++;
      if (currentSum >= 4 && (baseAsw + currentSum) >= 75) {
        success = true;
        break;
      }
    }
    if (success && requiredSlots < bestSlotsUsed) {
      bestSlotsUsed = requiredSlots;
      bestAswVal = baseAsw + currentSum;
    }

    if (bestSlotsUsed <= slots) {
      return ` [OASW可能 (要対潜兵装${bestSlotsUsed}スロット/対潜値:${bestAswVal})]`;
    }

    if (sonar) {
      const displayAsw = baseAsw + sonar.asw;
      return ` [OASW不可（対潜値不足:${displayAsw}/要60）]`;
    } else {
      return ' [OASW不可（ソナーなし）]';
    }
  }

  // H. 軽空母
  if (type === 7) {
    const sonar = validAswItems.find(item => item.apiTypeId === 14 || item.apiTypeId === 40);
    const planeAswGe1 = validAswItems.find(item => item.isAswPlane || (item.isAttacker && item.asw >= 1));
    const planeAswGe7 = validAswItems.find(item => item.isAswPlane || (item.apiTypeId === 8 && item.asw >= 7));

    let bestSlotsUsed = 999;
    let bestAswVal = 0;
    let conditionText = '';

    // Path B: displayAsw >= 65 && planeGe7
    if (planeAswGe7) {
      let currentSum = planeAswGe7.asw;
      let requiredSlots = 1;
      let success = (baseAsw + currentSum) >= 65;
      const remainingAswItems = validAswItems.filter(item => item !== planeAswGe7);
      while (!success && requiredSlots < slots && (requiredSlots - 1) < remainingAswItems.length) {
        currentSum += remainingAswItems[requiredSlots - 1].asw;
        requiredSlots++;
        if ((baseAsw + currentSum) >= 65) {
          success = true;
        }
      }
      if (success && requiredSlots < bestSlotsUsed) {
        bestSlotsUsed = requiredSlots;
        bestAswVal = baseAsw + currentSum;
        conditionText = `要対潜機含む${requiredSlots}スロット`;
      }
    }

    // Path C: displayAsw >= 50 && sonar && planeGe7
    if (sonar && planeAswGe7) {
      let currentSum = sonar.asw + planeAswGe7.asw;
      let requiredSlots = 2;
      let success = (baseAsw + currentSum) >= 50;
      const remainingAswItems = validAswItems.filter(item => item !== sonar && item !== planeAswGe7);
      while (!success && requiredSlots < slots && (requiredSlots - 2) < remainingAswItems.length) {
        currentSum += remainingAswItems[requiredSlots - 2].asw;
        requiredSlots++;
        if ((baseAsw + currentSum) >= 50) {
          success = true;
        }
      }
      if (success && requiredSlots < bestSlotsUsed) {
        bestSlotsUsed = requiredSlots;
        bestAswVal = baseAsw + currentSum;
        conditionText = `要ソナー+対潜機含む${requiredSlots}スロット`;
      }
    }

    // Path A: displayAsw >= 100 && sonar && planeGe1
    if (sonar && planeAswGe1) {
      let currentSum = sonar.asw + planeAswGe1.asw;
      let requiredSlots = 2;
      let success = (baseAsw + currentSum) >= 100;
      const remainingAswItems = validAswItems.filter(item => item !== sonar && item !== planeAswGe1);
      while (!success && requiredSlots < slots && (requiredSlots - 2) < remainingAswItems.length) {
        currentSum += remainingAswItems[requiredSlots - 2].asw;
        requiredSlots++;
        if ((baseAsw + currentSum) >= 100) {
          success = true;
        }
      }
      if (success && requiredSlots < bestSlotsUsed) {
        bestSlotsUsed = requiredSlots;
        bestAswVal = baseAsw + currentSum;
        conditionText = `要ソナー+対潜機含む${requiredSlots}スロット`;
      }
    }

    if (bestSlotsUsed <= slots) {
      return ` [OASW可能 (${conditionText}/対潜値:${bestAswVal})]`;
    }

    if (!sonar) return ' [OASW不可（ソナーなし）]';
    if (!planeAswGe1) return ' [OASW不可（対潜機なし）]';
    return ' [OASW不可（対潜値不足）]';
  }

  return '';
}