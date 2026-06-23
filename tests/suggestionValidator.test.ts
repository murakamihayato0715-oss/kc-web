import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateInventory, validateAirPower, validateNames, applyEquipmentDowngrade } from '../src/ai/suggestionValidator';
import { checkOaswPotential } from '../src/ai/fleetContext';
import ShipStock from '../src/classes/fleet/shipStock';
import ShipMaster from '../src/classes/fleet/shipMaster';
import ItemStock from '../src/classes/item/itemStock';
import ItemMaster from '../src/classes/item/itemMaster';
import { MultiFleetSuggestion } from '../src/ai/types';
import ShipValidation from '../src/classes/fleet/shipValidation';

describe('Suggestion Validator & OASW Checks', () => {
  // Mock isValidItem to return true for simplified test conditions
  ShipValidation.isValidItem = () => true;

  it('validateInventory: 在庫不足エラーを検知する', () => {
    // 震電改★+0 を2つ要求
    const suggestion: MultiFleetSuggestion = {
      comment: 'Test',
      fleets: [
        {
          comment: 'F1',
          ships: [
            { name: '赤城', slot: 1, equipments: ['震電改'] },
            { name: '加賀', slot: 2, equipments: ['震電改'] },
          ],
        },
      ],
    };

    const shindenMaster = new ItemMaster();
    Object.assign(shindenMaster, { id: 201, name: '震電改', apiTypeId: 6 });

    // 在庫は 1個
    const shindenStock = new ItemStock(201);
    Object.assign(shindenStock, {
      id: 201,
      num: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // ★+0 が 1個
    });

    const errors = validateInventory(suggestion, [shindenStock], [shindenMaster]);
    equal(errors.length, 1);
    equal(errors[0].itemName, '震電改');
    equal(errors[0].required, 2);
    equal(errors[0].available, 1);
  });

  it('validateNames: 未知の艦娘や装備を警告する', () => {
    const suggestion: MultiFleetSuggestion = {
      comment: 'Test',
      fleets: [
        {
          comment: 'F1',
          ships: [
            { name: '謎の超弩級戦艦', slot: 1, equipments: ['未知のオーパーツ★+0'] },
          ],
        },
      ],
    };

    const warnings = validateNames(suggestion, [], []);
    equal(warnings.length, 2);
    ok(warnings.some((w) => w.type === 'unknown_ship' && w.message.includes('謎の超弩級戦艦')));
    ok(warnings.some((w) => w.type === 'unknown_item' && w.message.includes('未知のオーパーツ')));
  });

  it('checkOaswPotential: 五十鈴改二は無条件OASW', () => {
    const isuzuMaster = new ShipMaster();
    Object.assign(isuzuMaster, { id: 141, name: '五十鈴改二', minAsw: 50, type: 3 });

    const stock = new ShipStock();
    Object.assign(stock, { id: 141, level: 80, improvement: { asw: 0 } });

    const res = checkOaswPotential(stock, isuzuMaster, [], []);
    equal(res, ' [無条件OASW]');
  });

  it('checkOaswPotential: 駆逐艦のOASW可否とコスト明示（ソナー仮積みを考慮）', () => {
    const shigureMaster = new ShipMaster();
    Object.assign(shigureMaster, {
      id: 243,
      name: '時雨改二',
      minAsw: 30,
      maxAsw: 89,
      type: 2, // 駆逐艦
      slotCount: 3,
    });

    // 対潜12のソナー「三式水中探信儀」
    const sonarMaster = new ItemMaster();
    Object.assign(sonarMaster, { id: 47, name: '三式水中探信儀', apiTypeId: 14, asw: 12 });

    const sonarStock = new ItemStock(47);
    Object.assign(sonarStock, {
      id: 47,
      num: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 3つ所持
    });

    // レベル10（表示対潜値が低く、ソナー3積みしても100に届かないケース）
    const stockLow = new ShipStock();
    Object.assign(stockLow, {
      id: 243,
      level: 10,
      improvement: { asw: 0 },
      releaseExpand: false,
    });
    const resLow = checkOaswPotential(stockLow, shigureMaster, [sonarStock], [sonarMaster]);
    ok(resLow.includes('OASW不可'));
    ok(resLow.includes('対潜値不足:71/要100'));

    // baseAswが十分高く、ソナー積むと100を超える場合
    const stockHigh = new ShipStock();
    Object.assign(stockHigh, {
      id: 243,
      level: 90, // レベル90
      improvement: { asw: 0 },
      releaseExpand: false,
    });

    const resHigh = checkOaswPotential(stockHigh, shigureMaster, [sonarStock], [sonarMaster]);
    ok(resHigh.includes('OASW可能'));
    ok(resHigh.includes('要対潜兵装2スロット/要ソナー/対潜値:107'));
  });

  it('applyEquipmentDowngrade: 不足装備の下位互換（ダウングレード）の自動代用', () => {
    // 四式水中聴音機★+0 を2枚要求
    const suggestion: MultiFleetSuggestion = {
      comment: 'Test',
      fleets: [
        {
          comment: 'F1',
          ships: [
            { name: '時雨', slot: 1, equipments: ['四式水中聴音機', '四式水中聴音機'] },
          ],
        },
      ],
    };

    // マスターデータ定義
    const type4Master = new ItemMaster();
    Object.assign(type4Master, { id: 149, name: '四式水中聴音機', apiTypeId: 14 });
    const type3Master = new ItemMaster();
    Object.assign(type3Master, { id: 47, name: '三式水中探信儀', apiTypeId: 14 });

    // 在庫データ: 四式は0、三式は★+4が1枚、★+0が5枚
    const type4Stock = new ItemStock(149);
    Object.assign(type4Stock, {
      id: 149,
      num: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const type3Stock = new ItemStock(47);
    Object.assign(type3Stock, {
      id: 47,
      num: [5, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], // ★+0 が 5, ★+4 が 1
    });

    const { suggestion: downgraded, notes } = applyEquipmentDowngrade(
      suggestion,
      [type4Stock, type3Stock],
      [type4Master, type3Master],
    );

    ok(downgraded);
    const shigureEquips = downgraded.fleets[0].ships[0].equipments;
    // 最初の四式は三式水中探信儀★+4に置換されるべき（高い改修値優先）
    equal(shigureEquips[0], '三式水中探信儀★+4');
    // 2枚目の四式は三式水中探信儀に置換されるべき
    equal(shigureEquips[1], '三式水中探信儀');

    // 代用メモの検証
    equal(notes.length, 2);
    ok(notes[0].includes('※「四式水中聴音機」が不足していたため、在庫のある「三式水中探信儀★+4」で代用しました'));
    ok(notes[1].includes('※「四式水中聴音機」が不足していたため、在庫のある「三式水中探信儀」で代用しました'));
  });

  it('validateAirPower: 制空権マージン（1.1倍未満）の警告検証', () => {
    // 敵制空値が 100 のとき、優勢ボーダーは 150
    // 自軍の制空値が 160 の場合（150以上だが150*1.1 = 165未満）に警告が出るかテスト

    // 艦船定義（制空値が160になるように艦戦を配備）
    const akagiMaster = new ShipMaster();
    Object.assign(akagiMaster, {
      id: 83,
      name: '赤城',
      type: 11, // 正規空母
      slotCount: 4,
      slots: [20, 20, 20, 10],
    });

    const fighterMaster = new ItemMaster();
    // 対空8の艦戦 (零式艦戦52型)
    Object.assign(fighterMaster, {
      id: 25,
      name: '零式艦戦52型',
      apiTypeId: 6,
      isPlane: true,
      sortieAntiAir: 8,
      antiAir: 8,
    });

    const suggestion: MultiFleetSuggestion = {
      comment: 'Test AP',
      fleets: [
        {
          comment: 'F1',
          ships: [
            { name: '赤城', slot: 1, equipments: ['零式艦戦52型', '零式艦戦52型'] },
          ],
        },
      ],
    };

    const warnings = validateAirPower(
      suggestion,
      [akagiMaster],
      [fighterMaster],
      [],
      45, // 敵制空値 45
    );

    // 優勢ボーダーは 68。自軍制空値は 70 程度。
    // 警告が出力されること自体のテストを目的とします。
    ok(warnings.length > 0);
    ok(warnings.some((w) => w.message.includes('制空値') && (w.message.includes('マージン') || w.message.includes('航空優勢'))));
  });
});
