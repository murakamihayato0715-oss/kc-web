import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFleetContext } from '../src/ai/fleetContext';
import ShipStock from '../src/classes/fleet/shipStock';
import ShipMaster from '../src/classes/fleet/shipMaster';

describe('Remodel Advisor (Phase 2)', () => {
  it('未改装艦があり、改装資材が必要な場合に、fleetContextに改装未完了候補として正しく出力される', async () => {
    const masterBase = new ShipMaster();
    Object.assign(masterBase, {
      id: 1001,
      originalId: 1001,
      name: 'テスト艦',
      version: 0,
      nextLv: 50,
      blueprints: 1,
      actionReports: 0,
      catapults: 0,
    });

    const masterKai = new ShipMaster();
    Object.assign(masterKai, {
      id: 1002,
      originalId: 1001,
      name: 'テスト艦改',
      version: 1,
      beforeId: 1001,
      isFinal: true,
    });

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
      [masterBase, masterKai],
      [],
      [],
      {},
      '',
    );

    ok(context.includes('【改装未完了の候補と必要資材】'));
    ok(context.includes('テスト艦 (Lv10) ➔ テスト艦改 (必要Lv50, 改装設計図x1'));
  });

  it('すでに上位バージョンを所持している場合は、改装未完了候補に出力されない', async () => {
    const masterBase = new ShipMaster();
    Object.assign(masterBase, {
      id: 1001,
      originalId: 1001,
      name: 'テスト艦',
      version: 0,
      nextLv: 50,
      blueprints: 1,
      actionReports: 0,
      catapults: 0,
    });

    const masterKai = new ShipMaster();
    Object.assign(masterKai, {
      id: 1002,
      originalId: 1001,
      name: 'テスト艦改',
      version: 1,
      beforeId: 1001,
      isFinal: true,
    });

    const stockBase = new ShipStock();
    Object.assign(stockBase, {
      id: 1001,
      level: 10,
      exp: 1000,
      improvement: { hp: 0, asw: 0, luck: 0 },
    });

    const stockKai = new ShipStock();
    Object.assign(stockKai, {
      id: 1002,
      level: 55,
      exp: 150000,
      improvement: { hp: 0, asw: 0, luck: 0 },
    });

    const context = await buildFleetContext(
      [stockBase, stockKai],
      [masterBase, masterKai],
      [],
      [],
      {},
      '',
    );

    equal(context.includes('【改装未完了の候補と必要資材】'), false);
  });
});
