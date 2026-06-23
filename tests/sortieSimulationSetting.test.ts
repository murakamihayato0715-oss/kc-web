import { equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import SiteSetting from '../src/classes/siteSetting';

describe('Sortie Simulation Settings Tests', () => {
  it('SiteSetting should initialize with correct simulation defaults', () => {
    const setting = new SiteSetting();
    equal(setting.simSortieMode, 'single');
    equal(setting.simRetreatPolicy, 'damecon');
    equal(setting.simBucketHpPercent, 0.5);
    equal(setting.simBucketTime, 5940);
    equal(setting.simSubmarineDecoy, false);
  });

  it('SiteSetting constructor should clone simulation settings correctly', () => {
    const original = new SiteSetting();
    original.simSortieMode = 'consecutive';
    original.simRetreatPolicy = 'advance';
    original.simBucketHpPercent = 0.25;
    original.simBucketTime = 120;
    original.simSubmarineDecoy = true;

    const clone = new SiteSetting(original);
    equal(clone.simSortieMode, 'consecutive');
    equal(clone.simRetreatPolicy, 'advance');
    equal(clone.simBucketHpPercent, 0.25);
    equal(clone.simBucketTime, 120);
    equal(clone.simSubmarineDecoy, true);
  });

  it('SiteSetting constructor should fall back to defaults if input fields are missing', () => {
    // Mock setting object with missing sim properties (like an old settings database record)
    const oldSettingRecord = {
      id: 'setting',
      simulationCount: 5000,
    } as any;

    const setting = new SiteSetting(oldSettingRecord);
    equal(setting.simSortieMode, 'single');
    equal(setting.simRetreatPolicy, 'damecon');
    equal(setting.simBucketHpPercent, 0.5);
    equal(setting.simBucketTime, 5940);
    equal(setting.simSubmarineDecoy, false);
  });

  describe('sim-worker logic simulation', () => {
    it('should correctly count consumed Damecons and resupply them from the global pool in carry-over mode', () => {
      // Mock the globals
      let CARRYOVERHP = true;
      let CARRYOVERMORALE = true;
      let GLOBAL_DAMECON_POOL = 5;
      let GLOBAL_GODDESS_POOL = 2;
      let TEMP_DAMECON_USED = 0;
      let TOTAL_DAMECON_USED = 0;
      let TEMP_GODDESS_USED = 0;
      let TOTAL_GODDESS_USED = 0;
      let FLEETS1 = [
        {
          ships: [] as any[]
        }
      ];

      // Simulate a ship object
      const ship: any = {
        morale: 30,
        repairsOrig: [42, 42, 43], // 2 normal, 1 goddess
        repairs: [42], // 1 normal left, meaning 1 normal and 1 goddess consumed
        reset: function(notHP: boolean, notMorale: boolean) {
          // Wrapped Ship.prototype.reset logic
          if (this.repairsOrig) {
            let count42Orig = this.repairsOrig.filter((id: number) => id == 42).length;
            let count42 = this.repairs ? this.repairs.filter((id: number) => id == 42).length : 0;
            let cons42 = count42Orig - count42; // 2 - 1 = 1
            TEMP_DAMECON_USED += cons42;
            TOTAL_DAMECON_USED += cons42;

            let count43Orig = this.repairsOrig.filter((id: number) => id == 43).length;
            let count43 = this.repairs ? this.repairs.filter((id: number) => id == 43).length : 0;
            let cons43 = count43Orig - count43; // 1 - 0 = 1
            TEMP_GODDESS_USED += cons43;
            TOTAL_GODDESS_USED += cons43;

            if (CARRYOVERHP) {
              let resupply42 = Math.min(cons42, GLOBAL_DAMECON_POOL);
              GLOBAL_DAMECON_POOL -= resupply42;

              let resupply43 = Math.min(cons43, GLOBAL_GODDESS_POOL);
              GLOBAL_GODDESS_POOL -= resupply43;

              let deficit42 = cons42 - resupply42;
              let deficit43 = cons43 - resupply43;
              let nextRepairs = [];
              for (let id of this.repairsOrig) {
                if (id == 42 && deficit42 > 0) {
                  deficit42--;
                } else if (id == 43 && deficit43 > 0) {
                  deficit43--;
                } else {
                  nextRepairs.push(id);
                }
              }
              this._nextRepairs = nextRepairs;
            }
          }

          if (CARRYOVERHP && CARRYOVERMORALE) {
            if (!notHP) {
              this.morale = Math.max(this.morale, 49);
            }
          }

          // originalShipReset mock
          if (CARRYOVERHP && this._nextRepairs !== undefined) {
            this.repairs = this._nextRepairs.slice();
          }
        }
      };

      FLEETS1[0].ships.push(ship);

      // Trigger reset with no bucket (notHP = true)
      ship.reset(true, true);

      // Verify that 1 normal was resupplied (cost 1 from pool, pool is now 4)
      // and 1 goddess was resupplied (cost 1 from pool, pool is now 1)
      equal(GLOBAL_DAMECON_POOL, 4);
      equal(GLOBAL_GODDESS_POOL, 1);
      // repairs should be restored to original [42, 42, 43] because both were resupplied from pool
      equal(ship.repairs.length, 3);
      equal(ship.repairs[0], 42);
      equal(ship.repairs[1], 42);
      equal(ship.repairs[2], 43);

      // Now consume again when the pools are empty
      GLOBAL_DAMECON_POOL = 0;
      GLOBAL_GODDESS_POOL = 0;
      ship.repairs = [42]; // 1 normal consumed, 1 goddess consumed

      ship.reset(true, true);
      // No pool left, so repairs cannot be resupplied, meaning repairs should remain at [42]
      equal(GLOBAL_DAMECON_POOL, 0);
      equal(ship.repairs.length, 1);
      equal(ship.repairs[0], 42);

      // Check morale reset when bucket is used (notHP = false)
      ship.morale = 20;
      ship.reset(false, true);
      equal(ship.morale, 49);
    });
  });

  describe('canContinue submarine decoy override tests', () => {
    it('should allow advancing on submarine decoy Taiha when decoy is active, but retreat when decoy is inactive', () => {
      // Mock original canContinue which returns false if any non-flagship ship has HP <= 25%
      const originalCanContinue = (ships1: any[], ships1C: any[] | null, ignoreFCF: boolean, ignoreDamecon: boolean) => {
        // Flagship check (ships1[0])
        if (ships1[0].HP / ships1[0].maxHP <= 0.25) return false;
        // Non-flagship check
        for (let i = 1; i < ships1.length; i++) {
          if (ships1[i].HP / ships1[i].maxHP <= 0.25) return false;
        }
        return true;
      };

      // Mock the wrapper logic
      const runWrappedCanContinue = (ships1: any[], ships1C: any[] | null, isDecoyActive: boolean) => {
        let tempHPs = [];
        if (isDecoyActive) {
          for (let i = 1; i < ships1.length; i++) {
            let ship = ships1[i];
            if (ship && (ship.type === 'SS' || ship.type === 'SSV') && ship.HP/ship.maxHP <= 0.25) {
              tempHPs.push({ ship: ship, HP: ship.HP });
              ship.HP = ship.maxHP;
            }
          }
        }

        const result = originalCanContinue(ships1, null, false, false);

        // Restore HPs
        for (let item of tempHPs) {
          item.ship.HP = item.HP;
        }

        return result;
      };

      // Scenario: Flagship is DD (healthy), Ship 2 is SS (Taiha'd at 20%), Ship 3 is DD (healthy)
      const ships = [
        { type: 'DD', HP: 30, maxHP: 30 },
        { type: 'SS', HP: 4, maxHP: 20 },
        { type: 'DD', HP: 32, maxHP: 32 }
      ];

      // Test 1: Decoy is inactive -> should retreat (return false)
      let resultInactive = runWrappedCanContinue(ships, null, false);
      equal(resultInactive, false);
      equal(ships[1].HP, 4); // should still be 4

      // Test 2: Decoy is active -> should advance (return true)
      let resultActive = runWrappedCanContinue(ships, null, true);
      equal(resultActive, true);
      equal(ships[1].HP, 4); // should be restored to 4

      // Scenario 2: Flagship is DD (healthy), Ship 2 is SS (Taiha'd at 20%), Ship 3 is DD (Taiha'd at 5%)
      const shipsWithTaihaDD = [
        { type: 'DD', HP: 30, maxHP: 30 },
        { type: 'SS', HP: 4, maxHP: 20 },
        { type: 'DD', HP: 2, maxHP: 40 }
      ];

      // Even with decoy active, Ship 3 (DD) is Taiha'd, so it must retreat (return false)
      let resultWithDD = runWrappedCanContinue(shipsWithTaihaDD, null, true);
      equal(resultWithDD, false);
      equal(shipsWithTaihaDD[1].HP, 4); // SS HP restored to 4
      equal(shipsWithTaihaDD[2].HP, 2); // DD HP remains 2
    });
  });
});
