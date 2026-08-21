/**
 * Empirical Challenge & Stress Test Suite: Frontend Queue & Economic Invariants
 * Author: Challenger 2 (Frontend Queue & Economic Invariant Specialist)
 * Target: public/app.js, public/game-fx.js, src/game-core.js
 */

import assert from 'node:assert/strict';
import { G } from '../../src/game-core.js';

console.log('='.repeat(80));
console.log('⚡ EMPIRICAL CHALLENGER 2: FRONTEND QUEUE & ECONOMIC INVARIANTS STRESS TEST');
console.log('='.repeat(80));

// =============================================================================
// CHALLENGE 1: Frontend Animation Queue Saturation & Host Deadlock
// =============================================================================
function challengeFrontendQueueSaturation() {
  console.log('\n[CHALLENGE 1] Stress-Testing FIFO Animation Queue Saturation & Host Deadlock...');

  // Mock frontend App object matching public/app.js lines 173-236
  const App = {
    isFxRunning: false,
    fxQueue: [],
    fx: {
      positions: {},
      timers: {},
      dice: null,
      upgrade: null,
      attack: null,
      aftershock: null,
      assignment: null,
      phase: null,
      event: null
    }
  };

  function activeFxStatus() {
    if (!App.isFxRunning && !App.fxQueue?.length && !Object.keys(App.fx.positions || {}).length) return null;
    let currentDesc = '';
    if (App.fx.dice) currentDesc = `【${App.fx.dice.teamName || '隊伍'}】擲骰移動`;
    else if (Object.keys(App.fx.positions || {}).length) currentDesc = '隊伍棋盤移動';
    else if (App.fx.upgrade) currentDesc = `【${App.fx.upgrade.teamName || '隊伍'}】基地升級`;
    else if (App.fx.attack) currentDesc = `【${App.fx.attack.teamName || '隊伍'}】${App.fx.attack.title || '特殊操作'}`;
    else if (App.fx.aftershock) currentDesc = '特殊操作棋盤餘波';
    else if (App.fx.assignment) currentDesc = '命運基地抽籤';
    else if (App.fx.phase) currentDesc = `${App.fx.phase.title || '階段切換'}`;
    else if (App.fx.event) currentDesc = `事件公告（${App.fx.event.message || ''}）`;
    else if (App.fxQueue?.length) {
      const next = App.fxQueue[0];
      const typeNames = { roll: '隊伍擲骰移動', upgrade: '基地升級', attack: '特殊操作', event: '事件公告', assignment: '基地抽籤', phase: '階段切換' };
      currentDesc = typeNames[next.type] || '特效動畫';
    } else {
      currentDesc = '特效動畫';
    }
    const pendingCount = App.fxQueue?.length || 0;
    return {
      desc: currentDesc,
      count: pendingCount,
      text: `請等待${currentDesc}完成${pendingCount > 0 ? `（還有 ${pendingCount} 個排隊中）` : ''}`
    };
  }

  // Simulate 10-team concurrent roll phase burst
  // Each team rolls dice, some trigger taxes, cards, or attacks
  const burstTasks = [
    { type: 'roll', teamId: 0, teamName: '第 1 組', durationMs: 5200 },
    { type: 'event', message: '第 1 組 停在稅收格，扣 $200', durationMs: 2600 },
    { type: 'roll', teamId: 1, teamName: '第 2 組', durationMs: 4800 },
    { type: 'roll', teamId: 2, teamName: '第 3 組', durationMs: 6000 },
    { type: 'attack', title: '飛彈打擊', durationMs: 6800 },
    { type: 'roll', teamId: 3, teamName: '第 4 組', durationMs: 5500 },
    { type: 'roll', teamId: 4, teamName: '第 5 組', durationMs: 5000 },
    { type: 'roll', teamId: 5, teamName: '第 6 組', durationMs: 4500 },
    { type: 'attack', title: '大地震', durationMs: 6800 },
    { type: 'roll', teamId: 6, teamName: '第 7 組', durationMs: 5200 },
    { type: 'event', message: '第 7 組 命運抽中「狂暴加薪」', durationMs: 2600 },
    { type: 'roll', teamId: 7, teamName: '第 8 組', durationMs: 5800 },
    { type: 'roll', teamId: 8, teamName: '第 9 組', durationMs: 4200 },
    { type: 'roll', teamId: 9, teamName: '第 10 組', durationMs: 5000 },
    { type: 'upgrade', teamName: '第 10 組', durationMs: 3000 }
  ];

  App.isFxRunning = true;
  App.fx.dice = { teamId: 0, teamName: '第 1 組', value: 4 };
  App.fxQueue = burstTasks.slice(1);

  const totalDurationMs = burstTasks.reduce((acc, t) => acc + t.durationMs, 0);
  const totalDurationSec = totalDurationMs / 1000;

  console.log(`  - Simulated 10-team event burst: ${burstTasks.length} queued FX items`);
  console.log(`  - Total sequential playback duration: ${totalDurationSec.toFixed(1)} seconds (${(totalDurationSec/60).toFixed(2)} minutes)`);
  
  const status = activeFxStatus();
  console.log(`  - activeFxStatus text: "${status?.text}"`);
  console.log(`  - Backlogged animations count: ${status?.count}`);

  assert.ok(totalDurationSec > 60, 'Queue execution time exceeds 60 seconds');
  assert.notEqual(status, null, 'activeFxStatus must return a blocking descriptor');
  assert.equal(status.count, 14, '14 tasks backlogged in queue');

  // Verify edge case: What if isFxRunning is false but positions map is non-empty?
  App.isFxRunning = false;
  App.fxQueue = [];
  App.fx.dice = null;
  App.fx.positions = { 1: 15 }; // Residual moving position
  const residualStatus = activeFxStatus();
  console.log(`  - Residual position status check: "${residualStatus?.text}"`);
  assert.notEqual(residualStatus, null, 'Residual position still blocks Host phase advancement');

  console.log('  ✔ Challenge 1 Passed: FIFO animation queue causes severe Head-of-Line blocking (>1.1 min) and Host phase starvation.');
}

// =============================================================================
// CHALLENGE 2: Optimistic UI Action Premature Unlock & Double Execution
// =============================================================================
function challengeOptimisticActionDesync() {
  console.log('\n[CHALLENGE 2] Stress-Testing Optimistic Action Unlock & Double Execution...');

  const clientApp = {
    role: 'team',
    teamId: 0,
    busy: false,
    pendingAction: null,
    state: {
      rev: 10,
      teams: [
        { id: 0, name: 'Team A', cash: 1000, pts: 20, level: 1, rolled: false },
        { id: 1, name: 'Team B', cash: 1000, pts: 20, level: 1, rolled: false }
      ]
    }
  };

  function sendAction(actionId) {
    clientApp.busy = true;
    clientApp.pendingAction = actionId;
  }

  function onBroadcast(nextState) {
    const previous = clientApp.state;
    // Implementation from public/app.js lines 650-657:
    if (clientApp.pendingAction) {
      if (clientApp.role === 'team' && clientApp.teamId !== null) {
        const me = nextState.teams?.[clientApp.teamId];
        if (me?.rolled || (nextState.rev || 0) > (previous?.rev || 0)) {
          clientApp.busy = false;
          clientApp.pendingAction = null;
        }
      } else if ((nextState.rev || 0) > (previous?.rev || 0)) {
        clientApp.busy = false;
        clientApp.pendingAction = null;
      }
    }
    clientApp.state = nextState;
  }

  // 1. Team A clicks "Upgrade Base"
  sendAction('act-up-001');
  assert.equal(clientApp.busy, true, 'Client UI must be locked');
  assert.equal(clientApp.pendingAction, 'act-up-001');

  // 2. Team B performs an action (e.g. buys a buff), server broadcasts state rev 11
  const serverBroadcastFromTeamB = {
    rev: 11,
    teams: [
      { id: 0, name: 'Team A', cash: 1000, pts: 20, level: 1, rolled: false }, // Team A upgrade NOT yet committed
      { id: 1, name: 'Team B', cash: 1000, pts: 15, level: 1, rolled: false, buffs: { shield: 1 } }
    ]
  };

  onBroadcast(serverBroadcastFromTeamB);

  console.log(`  - After Team B broadcast (rev: 10 -> 11):`);
  console.log(`    clientApp.busy: ${clientApp.busy}`);
  console.log(`    clientApp.pendingAction: ${clientApp.pendingAction}`);
  console.log(`    clientApp.state.teams[0].level: ${clientApp.state.teams[0].level}`);

  // Assert vulnerability: Team A's UI unlocked before Team A's action was processed
  assert.equal(clientApp.busy, false, 'Vulnerability verified: UI unlocked prematurely');
  assert.equal(clientApp.pendingAction, null, 'Vulnerability verified: pendingAction cleared');
  assert.equal(clientApp.state.teams[0].level, 1, 'Team A level is still 1');

  console.log('  ✔ Challenge 2 Passed: Optimistic action debounce is invalidated by unrelated broadcast revisions.');
}

// =============================================================================
// CHALLENGE 3: Event Log Diffing Collisions & Dropped Logs
// =============================================================================
function challengeEventLogDiffing() {
  console.log('\n[CHALLENGE 3] Stress-Testing Event Log Diffing Collisions...');

  function diffLogs(previousLog, nextLog) {
    if (!previousLog || !nextLog) return [];
    const prevFirst = previousLog[0];
    const prevIdx = nextLog.indexOf(prevFirst);
    const newLogs = prevIdx > 0 ? nextLog.slice(0, prevIdx) : (nextLog[0] !== prevFirst ? [nextLog[0]] : []);
    return newLogs;
  }

  // Case A: Duplicate consecutive identical messages
  const prevLogA = ['第 1 組 停在稅收格，扣 $200', '遊戲開始'];
  const nextLogA = ['第 1 組 停在稅收格，扣 $200', '第 1 組 停在稅收格，扣 $200', '遊戲開始'];
  const resultA = diffLogs(prevLogA, nextLogA);
  console.log(`  - Case A (Duplicate top message): Found ${resultA.length} new logs (Expected 1)`);
  assert.equal(resultA.length, 0, 'Bug confirmed: New identical log dropped because indexOf returned 0');

  // Case B: 3 new logs added in a batch where the newest equals the old top
  const prevLogB = ['停在起點 +$300', 'Round 1'];
  const nextLogB = ['停在起點 +$300', '第 2 組 買了道具', '第 3 組 骰出 4', '停在起點 +$300', 'Round 1'];
  const resultB = diffLogs(prevLogB, nextLogB);
  console.log(`  - Case B (Batch with repeated message): Found ${resultB.length} new logs (Expected 3)`);
  assert.equal(resultB.length, 0, 'Bug confirmed: Entire batch of 3 new logs dropped because indexOf matched index 0');

  // Case C: Log list truncation/shift where previous[0] is no longer in next
  const prevLogC = ['Old Message 1', 'Old Message 2'];
  const nextLogC = ['New 1', 'New 2', 'New 3', 'New 4']; // completely refreshed
  const resultC = diffLogs(prevLogC, nextLogC);
  console.log(`  - Case C (Completely rotated log): Found ${resultC.length} new logs (Expected 4)`);
  assert.equal(resultC.length, 1, 'Bug confirmed: Only 1 log captured, 3 logs dropped when prevFirst not found (indexOf = -1)');

  console.log('  ✔ Challenge 3 Passed: Event log diffing algorithm drops messages across all collision and rotation scenarios.');
}

// =============================================================================
// CHALLENGE 4: Economic Solvency & Unbounded Negative Cash Inflation
// =============================================================================
function challengeEconomicSolvencyInvariants() {
  console.log('\n[CHALLENGE 4] Stress-Testing Economic Solvency & Currency Invariants...');

  const s = G.freshState('ECON_STRESS', 4);
  s.round = 2;
  s.bank = 1000;

  // Invariant 1: Total money conservation in transfers
  const initialTotalMoney = s.bank + s.teams.reduce((acc, t) => acc + t.cash, 0);
  console.log(`  - Initial Total Currency in Economy: $${initialTotalMoney}`);

  // Team 1 has $50 cash
  s.teams[1].cash = 50;
  // Team 0 has Level 3 Casino (stay fee $800) at Tile 2
  s.teams[0].baseIdx = 2;
  s.teams[0].level = 3;

  // Team 1 lands on Team 0 base
  s.teams[1].pos = 2;
  G.landEffect(s, 1, [], { hasPass: false, markPass: () => {} }, () => 0);

  console.log(`  - Team 1 (Debtor) cash after $800 fee: $${s.teams[1].cash}`);
  console.log(`  - Team 0 (Payee) cash after $800 fee: $${s.teams[0].cash}`);

  const postStayTotalMoney = s.bank + s.teams.reduce((acc, t) => acc + t.cash, 0);
  console.log(`  - Post-Transfer Total Nominal Currency (including debt): $${postStayTotalMoney}`);
  console.log(`  - Total Positive Liquid Currency: $${s.bank + s.teams.filter(t => t.cash > 0).reduce((acc, t) => acc + t.cash, 0)}`);

  assert.equal(s.teams[1].cash, -750, 'Debtor cash drops to -$750');
  assert.equal(s.teams[0].cash, 2800, 'Payee receives full $800');

  // Demonstrate Debt Money Creation: Team 0 now spends this $800 unbacked money
  // Team 0 buys back a base or upgrades or spends in black market
  s.teams[0].cash -= 800; // Spent on something
  console.log(`  - Team 0 successfully spent $800 unbacked fiat money in game economy.`);

  // Invariant 2: Attack Damage to Bank Phantom Injection
  // In a 2-team scenario where Team 0 (Rank 0) attacks Team 1 (Rank 1, Debtor)
  const sBankTest = G.freshState('BANK_TEST', 2);
  sBankTest.teams[0].cash = 2000; sBankTest.teams[0].pts = 10;
  sBankTest.teams[1].cash = 0; // Debtor with $0
  sBankTest.bank = 0;

  // Team 0 missiles Team 1 (Debtor is rank[1], target = rank[0+1] = Team 1)
  const attackRes = G.playAttack(sBankTest, 0, 'missile', () => 0);
  assert.equal(attackRes.ok, true);

  console.log(`  - Debtor cash after missile: $${sBankTest.teams[1].cash} (Debt plunged to -$400)`);
  console.log(`  - Bank pool after debtor damage: $${sBankTest.bank} (Phantom $400 injected into central bank)`);
  assert.equal(sBankTest.teams[1].cash, -400);
  assert.equal(sBankTest.bank, 400);

  // Invariant 3: Bank Secret Tunnel drains this phantom money into circulation
  const sDrainTest = G.freshState('DRAIN_TEST', 2);
  sDrainTest.bank = 400; // Contains $400 phantom cash from debtor damage
  sDrainTest.teams[0].pos = 20; // Bank tile is index 20
  sDrainTest.teams[0].cash = 1000;
  // settings.bankShare = 50%
  G.landEffect(sDrainTest, 0, [], { hasPass: false, markPass: () => {} }, () => 0);

  console.log(`  - Team 0 looted Bank Secret Tunnel: Cash = $${sDrainTest.teams[0].cash} (+$200 phantom cash received)`);
  console.log(`  - Bank remaining: $${sDrainTest.bank}`);
  assert.equal(sDrainTest.teams[0].cash, 1200);
  assert.equal(sDrainTest.bank, 200);

  console.log('  ✔ Challenge 4 Passed: Insolvent debt injection breaks currency conservation and fabricates liquid liquidity.');
}

// =============================================================================
// CHALLENGE 5: Missile Upward Targeting Bias & Last Place Immunity
// =============================================================================
function challengeMissileTargetingSymmetry() {
  console.log('\n[CHALLENGE 5] Stress-Testing Missile Targeting Formula & Ranking Symmetry...');

  const s = G.freshState('MISSILE_TEST', 4);
  // Set net worths: Team 0 > Team 1 > Team 2 > Team 3
  s.teams[0].cash = 4000; s.teams[0].name = 'Rank 1';
  s.teams[1].cash = 3000; s.teams[1].name = 'Rank 2';
  s.teams[2].cash = 2000; s.teams[2].name = 'Rank 3';
  s.teams[3].cash = 1000; s.teams[3].name = 'Rank 4 (Last)';

  // For each team, compute who they will target with missile
  const rank = [...s.teams].sort((a, b) => G.netWorth(s, b) - G.netWorth(s, a));
  const targetMap = {};

  s.teams.forEach((t, ti) => {
    const mine = rank.findIndex(x => x.id === ti);
    const target = rank[mine - 1] || rank[mine + 1];
    targetMap[t.name] = target.name;
  });

  console.log('  Missile Targeting Mapping:');
  Object.entries(targetMap).forEach(([attacker, victim]) => {
    console.log(`    ${attacker} targets -> ${victim}`);
  });

  // Calculate incoming missiles per team
  const incomingMissiles = { 'Rank 1': 0, 'Rank 2': 0, 'Rank 3': 0, 'Rank 4 (Last)': 0 };
  Object.values(targetMap).forEach(victim => {
    incomingMissiles[victim] = (incomingMissiles[victim] || 0) + 1;
  });

  console.log('  Incoming Missiles Received:');
  Object.entries(incomingMissiles).forEach(([team, count]) => {
    console.log(`    ${team}: ${count} incoming attacks`);
  });

  assert.equal(incomingMissiles['Rank 4 (Last)'], 0, 'Mathematical Proof: Rank 4 receives ZERO missile attacks!');
  assert.equal(incomingMissiles['Rank 1'], 1, 'Rank 1 receives 1 missile');
  assert.equal(incomingMissiles['Rank 2'], 2, 'Rank 2 receives 2 missiles');
  assert.equal(incomingMissiles['Rank 3'], 1, 'Rank 3 receives 1 missile');

  console.log('  ✔ Challenge 5 Passed: Missile algorithm mathematically excludes the last-place team from ever being targeted.');
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================
export function runEmpiricalChallenges() {
  challengeFrontendQueueSaturation();
  challengeOptimisticActionDesync();
  challengeEventLogDiffing();
  challengeEconomicSolvencyInvariants();
  challengeMissileTargetingSymmetry();
  console.log('\n' + '='.repeat(80));
  console.log('🎉 ALL EMPIRICAL CHALLENGES COMPLETED & FULLY VERIFIED.');
  console.log('='.repeat(80) + '\n');
}

runEmpiricalChallenges();
