import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFrontMatter, matchDestination, checkBranchConditions } from '../src/ai/routeMatcher';
import { buildFleetContext } from '../src/ai/fleetContext';
import EnemyFleet from '../src/classes/enemy/enemyFleet';
import Enemy from '../src/classes/enemy/enemy';
import EnemyMaster from '../src/classes/enemy/enemyMaster';
import BattleInfo from '../src/classes/enemy/battleInfo';
import ShipStock from '../src/classes/fleet/shipStock';

describe('Route Matcher & Threat Context (Phase 3)', () => {
  it('Front Matter が正しくパースされ、目的地が逆引きできること', () => {
    const md = `---
mapId: 71
destinations:
  - id: "K"
    routeName: "ブルネイ周回・戦果稼ぎルート (D➔H➔K)"
    path: ["D", "H", "K"]
---
## 7-1. ブルネイ泊地沖`;

    const { config, content } = parseFrontMatter(md);
    ok(config);
    equal(config.mapId, 71);
    equal(config.destinations.length, 1);
    equal(config.destinations[0].id, 'K');
    equal(config.destinations[0].routeName, 'ブルネイ周回・戦果稼ぎルート (D➔H➔K)');
    equal(config.destinations[0].path.length, 3);
    equal(config.destinations[0].path[0], 'D');
    equal(content.includes('## 7-1. ブルネイ泊地沖'), true);

    const dest = matchDestination(config, '7-1ボスにいきたい');
    ok(dest);
    equal(dest.id, 'K');
  });

  it('ルート上の敵編成から <route_threats> が正しく生成されること', async () => {
    const master = new EnemyMaster();
    Object.assign(master, {
      name: '軽巡ツ級 flag ship',
      hp: 66,
      armor: 58,
    });

    const enemy = new Enemy(master, []);
    const fleet = new EnemyFleet({
      enemies: [enemy],
      nodeName: 'K',
      area: 71,
    });

    const battleInfo = new BattleInfo({
      fleets: [fleet],
      battleCount: 1,
    });

    const calcManager = {
      battleInfo,
    };

    const stock = new ShipStock();
    Object.assign(stock, {
      id: 1001,
      level: 10,
      exp: 1000,
      releaseExpand: false,
      improvement: { hp: 0, asw: 0, luck: 0 },
    });

    const context = await buildFleetContext(
      [stock],
      [],
      [],
      [],
      {},
      '7-1ボスに周回したい',
      calcManager,
    );

    ok(context.includes('<route_threats>'));
    ok(context.includes('目標目的地: 7-1'));
    ok(context.includes('軽巡ツ級 flag ship'));
    ok(context.includes('属性: 強力対空'));
  });

  it('条件チェック (checkBranchConditions) とフォールバック敵情報が正しく動作すること', async () => {
    const md = `---
mapId: 71
destinations:
  - id: "K"
    routeName: "ブルネイ周回・戦果稼ぎルート (D➔H➔K)"
    conditions:
      ships: "軽巡1, 駆逐4"
      speed: "高速統一"
    path: ["D", "H", "K"]
---`;
    const { config } = parseFrontMatter(md);
    ok(config);

    // Fleet mismatch case: 6 ships (all destroyers), slow speed
    const mockFleetInfo = {
      fleets: [{
        ships: [
          { data: { id: 1, type: 2 }, speed: 5 }, // DD, Low Speed
          { data: { id: 2, type: 2 }, speed: 10 },
          { data: { id: 3, type: 2 }, speed: 10 },
          { data: { id: 4, type: 2 }, speed: 10 },
          { data: { id: 5, type: 2 }, speed: 10 },
          { data: { id: 6, type: 2 }, speed: 10 },
        ],
      }],
    };

    const dest = config.destinations[0];
    const warnings = checkBranchConditions(dest, mockFleetInfo);
    ok(warnings.some((w: string) => w.includes('速力')));
    ok(warnings.some((w: string) => w.includes('軽巡')));
    ok(warnings.some((w: string) => w.includes('駆逐')));

    // Test context generation with empty battleInfo (fallback to database)
    const stock = new ShipStock();
    Object.assign(stock, {
      id: 1001,
      level: 10,
      exp: 1000,
      releaseExpand: false,
      improvement: { hp: 0, asw: 0, luck: 0 },
    });

    const context = await buildFleetContext(
      [stock],
      [],
      [],
      [],
      {},
      '7-1ボスにいきたい',
      { fleetInfo: mockFleetInfo }, // battleInfo is omitted/empty
    );

    ok(context.includes('<route_threats>'));
    ok(context.includes('潜水ソ級flagship')); // From FALLBACK_MAP_THREATS
    ok(context.includes('属性: 潜水艦'));
    ok(context.includes('【警告：現在の艦隊構成によるルート逸れ・分岐条件違反】'));
  });
});
