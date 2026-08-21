/**
 * Test Suite 2: Game Core Rules & Boundary Condition Verification Tests (Post-Patch)
 */

import assert from 'node:assert/strict';
import { G } from '../../src/game-core.js';

console.log('='.repeat(70));
console.log('▶ RUNNING TEST SUITE 2: Game Core Rules & Boundary Verification (Patched)');
console.log('='.repeat(70));

// -----------------------------------------------------------------------------
// TEST 2.1: Insolvent Negative Cash & Unbacked Fiat Inflation (VULN-CORE-01 -> FIXED)
// -----------------------------------------------------------------------------
function testInsolventNegativeCash() {
  console.log('\n[TEST 2.1] Verifying Insolvent Debt Protection & No Fiat Creation (VULN-CORE-01)...');

  const s = G.freshState('INSOLVENCY_TEST', 2);
  s.round = 2;
  s.teams[1].cash = 100; // Debtor has only $100
  s.teams[0].cash = 2000;
  s.teams[0].baseIdx = 2;
  s.teams[0].level = 3; // Stay fee = $800

  // Team 1 lands on Team 0's Level 3 Casino
  s.teams[1].pos = 2;
  G.landEffect(s, 1, [], () => 0);

  console.log(`  Debtor initial cash: $100 | Stay fee owed: $800`);
  console.log(`  Debtor final cash: $${s.teams[1].cash}`);
  console.log(`  Payee final cash: $${s.teams[0].cash} (+$${s.teams[0].cash - 2000})`);

  // Assert debtor cash cannot plunge below 0
  assert.equal(s.teams[1].cash, 0, 'Debtor cash must not drop below 0');
  // Payee only receives actual cash available ($100)
  assert.equal(s.teams[0].cash, 2100, 'Payee receives only actual paid amount without unbacked fiat injection');

  // Attack debtor with missile
  s.teams[0].pts = 10;
  s.bank = 0;
  const attackRes = G.playAttack(s, 0, 'missile', () => 0);
  assert.equal(attackRes.ok, true, 'Missile attack should succeed');
  assert.equal(s.teams[1].cash, 0, 'Debtor cash remains non-negative 0');
  assert.equal(s.bank, 0, 'Bank receives 0 unbacked phantom liquidity');

  console.log('  ✔ VULN-CORE-01 Successfully Patched: Insolvent debt protected and fiat inflation eliminated.');
}

// -----------------------------------------------------------------------------
// TEST 2.2: Double Jail Decrement & Reroll Card Jailbreak Exploit (VULN-CORE-02 -> FIXED)
// -----------------------------------------------------------------------------
function testJailRerollJailbreak() {
  console.log('\n[TEST 2.2] Verifying Jail State Enforcement & Jailbreak Prevention (VULN-CORE-02)...');

  const s = G.freshState('JAIL_REROLL_TEST', 2);
  s.teams[0].pos = 42; // In Jail
  s.teams[0].jail = 1; // 1 round sentence
  s.teams[0].buffs.reroll = 1;
  s.phase = 'market';

  // Phase transition: market -> sell -> shop -> roll
  G.nextPhase(s); // sell
  G.nextPhase(s); // shop
  G.nextPhase(s); // roll (Round 2 begins)

  console.log(`  Upon entering roll phase: Team 0 jail = ${s.teams[0].jail}, rolled = ${s.teams[0].rolled}, jailedThisTurn = ${s.teams[0].jailedThisTurn}`);
  assert.equal(s.teams[0].jailedThisTurn, true, 'jailedThisTurn set to true during roll transition');

  // Attempt move
  G.applyMove(s, 0, 4, () => 0);
  console.log(`  Team 0 attempted move. Final position: Tile ${s.teams[0].pos}`);
  assert.equal(s.teams[0].pos, 42, 'Team 0 must remain in jail on Tile 42');
  console.log('  ✔ VULN-CORE-02 Successfully Patched: Jail sentence strictly enforced.');
}

// -----------------------------------------------------------------------------
// TEST 2.3: Unchecked Base Upgrade Without Base Assignment (VULN-CORE-03 -> FIXED)
// -----------------------------------------------------------------------------
function testUpgradeWithoutBaseAssignment() {
  console.log('\n[TEST 2.3] Verifying Unchecked Base Upgrade Defense (VULN-CORE-03)...');

  const s = G.freshState('UPGRADE_NO_BASE_TEST', 2);
  s.teams[0].pts = 10;
  s.teams[0].level = 1;
  s.teams[0].baseIdx = null; // No base assigned yet

  const result = G.upgradeBase(s, 0);
  console.log(`  upgradeBase(team 0) result: ok = ${result.ok}, msg = "${result.msg}"`);
  assert.equal(result.ok, false, 'upgradeBase must fail when baseIdx is null');
  assert.equal(s.teams[0].pts, 10, 'Points must not be deducted when unassigned');
  console.log('  ✔ VULN-CORE-03 Successfully Patched: Base upgrade on unassigned base prevented.');
}

// -----------------------------------------------------------------------------
// TEST 2.4: Uncaught TypeError in buyGamble / buyBuff with Invalid Indexes (VULN-CORE-04 -> FIXED)
// -----------------------------------------------------------------------------
function testShopCrashOnInvalidInputs() {
  console.log('\n[TEST 2.4] Verifying Safe Shop Index Validation (VULN-CORE-04)...');

  const s = G.freshState('SHOP_CRASH_TEST', 2);
  s.teams[0].pts = 100;

  const gambleRes = G.buyGamble(s, 0, 999);
  assert.equal(gambleRes.ok, false, 'buyGamble must return error for invalid index');
  assert.equal(gambleRes.msg, '找不到此抽獎項目');

  const buffRes = G.buyBuff(s, 0, 'invalid_card');
  assert.equal(buffRes.ok, false, 'buyBuff must return error for invalid buff kind');
  assert.equal(buffRes.msg, '找不到此道具卡');

  console.log('  ✔ VULN-CORE-04 Successfully Patched: Safe handling for out-of-bounds shop parameters.');
}

// -----------------------------------------------------------------------------
// TEST 2.5: Pass Buff Multi-Toll Count Deduction (VULN-CORE-05 -> FIXED)
// -----------------------------------------------------------------------------
function testPassCardMultiTollWaiver() {
  console.log('\n[TEST 2.5] Verifying Pass Card Exact Count Deduction (VULN-CORE-05)...');

  const s = G.freshState('PASS_CARD_TEST', 4);
  s.round = 2;
  s.teams[0].cash = 1000;
  s.teams[0].buffs.pass = 1; // Holds exactly 1 pass card
  s.teams[0].pos = 1; // Tile 1 is safe

  s.teams[1].baseIdx = 2; s.teams[1].level = 2; // passing toll = $60
  s.teams[2].baseIdx = 6; s.teams[2].level = 2; // passing toll = $60
  s.teams[3].baseIdx = 10; s.teams[3].level = 3; // stay fee = $800

  // Moves 9 steps: passes Base 2 (1 pass card consumed), passes Base 6 ($60 cash paid), lands on Base 10 ($800 cash paid)
  G.applyMove(s, 0, 9, () => 0);

  console.log(`  Team 0 final cash: $${s.teams[0].cash} | Remaining passes: ${s.teams[0].buffs.pass}`);
  assert.equal(s.teams[0].buffs.pass, 0, 'Pass card was consumed for first toll');
  assert.equal(s.teams[0].cash, 140, 'Remaining fees paid from cash: $1000 - $60 - $800 = $140');
  console.log('  ✔ VULN-CORE-05 Successfully Patched: Pass card deducted per fee event.');
}

// -----------------------------------------------------------------------------
// TEST 2.6: Zero-Step Movement at START (VULN-CORE-06 -> FIXED)
// -----------------------------------------------------------------------------
function testZeroStepStartLapBonus() {
  console.log('\n[TEST 2.6] Verifying Zero-Step at START No Unwarranted Bonus (VULN-CORE-06)...');

  const s = G.freshState('ZERO_STEP_TEST', 2);
  s.teams[0].pos = 31; // START_IDX
  s.teams[0].cash = 2000;

  G.applyMove(s, 0, 0, () => 0);
  assert.equal(s.teams[0].cash, 2000, 'Zero-step move must not grant lap bonus');
  console.log('  ✔ VULN-CORE-06 Successfully Patched: Zero-step move at START does not award lap bonus.');
}

// -----------------------------------------------------------------------------
// TEST 2.7: Wormhole Teleport Lap Bonus & Safe Single Wormhole (VULN-CORE-07 -> FIXED)
// -----------------------------------------------------------------------------
function testWormholeStartLapBonusAndCrash() {
  console.log('\n[TEST 2.7] Verifying Wormhole Lap Bonus & Single Wormhole Safety (VULN-CORE-07)...');

  const s = G.freshState('WORMHOLE_TEST', 2);
  s.teams[0].pos = 10;
  s.teams[0].cash = 2000;

  G.applyMove(s, 0, 2, () => 0);
  assert.equal(s.teams[0].pos, 37, 'Teleported across START tile');
  assert.equal(s.teams[0].cash, 2300, 'Crossing START via wormhole awards lap bonus ($300)');

  // Single Wormhole Safe Handling
  const origWorm = [...G.WORM_IDX];
  try {
    G.WORM_IDX.splice(1, 1);
    const sCrash = G.freshState('WORM_CRASH_TEST', 2);
    sCrash.teams[0].pos = 12;
    G.landEffect(sCrash, 0, [], () => 0);
    assert.equal(sCrash.teams[0].pos, 12, 'Single wormhole keeps position without crash');
  } finally {
    G.WORM_IDX.splice(0, G.WORM_IDX.length, ...origWorm);
  }
  console.log('  ✔ VULN-CORE-07 Successfully Patched: Wormhole lap bonus and single wormhole safety verified.');
}

export function runCoreRulesBoundaryTests() {
  testInsolventNegativeCash();
  testJailRerollJailbreak();
  testUpgradeWithoutBaseAssignment();
  testShopCrashOnInvalidInputs();
  testPassCardMultiTollWaiver();
  testZeroStepStartLapBonus();
  testWormholeStartLapBonusAndCrash();
  console.log('\n✔ All Suite 2 Game Core Rules & Boundary Verification Tests Passed!\n');
}

if (process.argv[1]?.endsWith('test_r2_core_rules_boundaries.mjs')) {
  runCoreRulesBoundaryTests();
}
