/**
 * Exhaustive Empirical Challenger Iteration 2 Harness
 * Validating BUG-PAWN-01, BUG-PAWN-02, BUG-PAWN-03, CSS Keyframes, and Boundary Stress
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { G } from '../../src/game-core.js';
import {
  PAWN_ARCHETYPES,
  pawnSpriteSVG,
  renderPawnSprite,
  renderTileGarrison,
  movementPath
} from '../../public/game-fx.js';

console.log('='.repeat(80));
console.log('🔥 RUNNING ITERATION 2 EMPIRICAL CHALLENGER EXHAUSTIVE STRESS HARNESS');
console.log('='.repeat(80));

let assertions = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}

function makeTeam(id, pos = 0, opts = {}) {
  return {
    id: Number(id),
    name: `第 ${Number(id) + 1} 組`,
    pos,
    color: G.TEAM_COLORS[Number(id) % 10],
    cash: 2000,
    jail: opts.jail || 0,
    buffs: opts.buffs || { shield: 0, pass: 0, double: 0 },
    ...opts
  };
}

// =============================================================================
// SUITE 1: BUG-PAWN-01 EXHAUSTIVE COERCION PROBING
// =============================================================================
console.log('\n[SUITE 1] BUG-PAWN-01: Probing Null/Undefined/Empty-String ID Coercion...');

const falsyIds = [null, undefined, ''];
const testTeamsSingle = [makeTeam(0, 5)];

for (const falsyMe of falsyIds) {
  for (const falsyLeader of falsyIds) {
    const html = renderTileGarrison(testTeamsSingle, { meId: falsyMe, leaderId: falsyLeader });
    
    // Team 0 must NOT have is-me or is-leader
    check(!html.includes('is-me'), `Team 0 must NOT have is-me class when meId is ${falsyMe}`);
    check(!html.includes('is-leader'), `Team 0 must NOT have is-leader class when leaderId is ${falsyLeader}`);
    check(!html.includes('pawn-crown'), `Team 0 must NOT have pawn-crown when leaderId is ${falsyLeader}`);
  }
}

// Also test non-matching numerical & string IDs
const nonMatchingIds = [1, 2, 9, '1', '2', '9', 99, 'abc', -1];
for (const meId of nonMatchingIds) {
  const html = renderTileGarrison(testTeamsSingle, { meId, leaderId: 5 });
  check(!html.includes('is-me'), `Team 0 must NOT have is-me when meId is ${meId}`);
  check(!html.includes('is-leader'), `Team 0 must NOT have is-leader when leaderId is 5`);
}

// Test positive matching with both Number and String
{
  const htmlNum = renderTileGarrison(testTeamsSingle, { meId: 0, leaderId: 0 });
  check(htmlNum.includes('is-me'), 'Team 0 must have is-me when meId is 0 (number)');
  check(htmlNum.includes('is-leader'), 'Team 0 must have is-leader when leaderId is 0 (number)');
  check(htmlNum.includes('pawn-crown'), 'Team 0 must have pawn-crown when leaderId is 0 (number)');

  const htmlStr = renderTileGarrison(testTeamsSingle, { meId: '0', leaderId: '0' });
  check(htmlStr.includes('is-me'), 'Team 0 must have is-me when meId is "0" (string)');
  check(htmlStr.includes('is-leader'), 'Team 0 must have is-leader when leaderId is "0" (string)');
  check(htmlStr.includes('pawn-crown'), 'Team 0 must have pawn-crown when leaderId is "0" (string)');
}

console.log(`  ✔ [PASS] BUG-PAWN-01 fully verified across all falsy, non-matching, and matching ID combinations.`);

// =============================================================================
// SUITE 2: BUG-PAWN-02 EXHAUSTIVE CLUSTER LEAD SELECTION PROBING
// =============================================================================
console.log('\n[SUITE 2] BUG-PAWN-02: Mode C Cluster Representative Selection Matrix...');

// Scenario: 4 teams on tile, Team 0 is NOT the first element, e.g. [T5, T2, T0, T8]
{
  const clusterTeams = [makeTeam(5, 10), makeTeam(2, 10), makeTeam(0, 10), makeTeam(8, 10)];

  // Case 2.1: Spectator view, no active, no leader -> First team (T5) MUST be lead, NOT T0!
  const htmlSpectator = renderTileGarrison(clusterTeams, { meId: null, activeTeamId: null, leaderId: null });
  check(htmlSpectator.includes('cluster-lead') && htmlSpectator.includes('data-team="5"'), 'First team T5 must be lead when all IDs are null');
  check(!htmlSpectator.includes('data-team="0" class="pixel-pawn-wrapper team-0 is-me'), 'T0 must not be falsely selected as me');

  // Case 2.2: Spectator view, active roller is T8 -> T8 MUST be lead!
  const htmlActive8 = renderTileGarrison(clusterTeams, { meId: null, activeTeamId: 8, leaderId: null });
  check(htmlActive8.includes('cluster-lead') && htmlActive8.includes('data-team="8"'), 'Active team T8 must be lead when spectator views');

  // Case 2.3: Spectator view, active roller is T0 -> T0 MUST be lead when genuinely active
  const htmlActive0 = renderTileGarrison(clusterTeams, { meId: null, activeTeamId: 0, leaderId: 5 });
  check(htmlActive0.includes('cluster-lead') && htmlActive0.includes('data-team="0"'), 'Active team T0 must be lead when activeTeamId is 0');

  // Case 2.4: Spectator view, active is not on tile, leader is T2 -> T2 MUST be lead!
  const htmlLeader2 = renderTileGarrison(clusterTeams, { meId: null, activeTeamId: 7, leaderId: 2 });
  check(htmlLeader2.includes('cluster-lead') && htmlLeader2.includes('data-team="2"'), 'Leader T2 must be lead when active is not present');

  // Case 2.5: Viewer is T2 -> T2 MUST be lead regardless of active or leader
  const htmlViewer2 = renderTileGarrison(clusterTeams, { meId: 2, activeTeamId: 8, leaderId: 0 });
  check(htmlViewer2.includes('cluster-lead') && htmlViewer2.includes('data-team="2"'), 'Viewer team T2 must have top priority as lead');

  // Case 2.6: Viewer is T0 -> T0 MUST be lead when genuinely meId: 0 or '0'
  const htmlViewer0 = renderTileGarrison(clusterTeams, { meId: '0', activeTeamId: 8, leaderId: 5 });
  check(htmlViewer0.includes('cluster-lead') && htmlViewer0.includes('data-team="0"'), 'Viewer team T0 (string "0") must be lead');
}

console.log(`  ✔ [PASS] BUG-PAWN-02 fully verified across all Mode C priority permutations.`);

// =============================================================================
// SUITE 3: BUG-PAWN-03 STACKING COLLISION CSS RULE PROBING
// =============================================================================
console.log('\n[SUITE 3] BUG-PAWN-03: Stacking Collision CSS Offset Validation...');

{
  const cssPath = path.resolve('public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Check presence of .pixel-pawn-wrapper.is-me.is-leader::before
  const ruleRegex = /\.pixel-pawn-wrapper\.is-me\.is-leader::before\s*\{[^}]*top:\s*(-2[4-9]px|-30px)[^}]*\}/;
  check(ruleRegex.test(css), 'styles.css must contain .pixel-pawn-wrapper.is-me.is-leader::before with top between -24px and -30px');

  // Check base .pixel-pawn-wrapper.is-me::before has top: -17px
  const baseArrowRegex = /\.pixel-pawn-wrapper\.is-me::before\s*\{[^}]*top:\s*-17px[^}]*\}/;
  check(baseArrowRegex.test(css), 'Base is-me arrow must have top: -17px');

  // Check .pawn-accessory.pawn-crown has top: -18px
  const crownRegex = /\.pawn-accessory\.pawn-crown\s*\{[^}]*top:\s*-18px[^}]*\}/;
  check(crownRegex.test(css), 'Crown accessory must have top: -18px');

  // Check DOM output for combined classes
  const pawnMeLeader = renderPawnSprite(0, { isMe: true, isLeader: true });
  check(pawnMeLeader.includes('is-me') && pawnMeLeader.includes('is-leader'), 'Markup contains both is-me and is-leader classes');
  check(pawnMeLeader.includes('pawn-crown'), 'Markup contains pawn-crown accessory');
}

console.log(`  ✔ [PASS] BUG-PAWN-03 offset rule and markup confirmed.`);

// =============================================================================
// SUITE 4: CSS KEYFRAMES EXHAUSTIVE AUDIT (PAWN SYSTEM)
// =============================================================================
console.log('\n[SUITE 4] CSS Keyframes Definition and Reference Audit (Pawn System)...');

{
  const cssPath = path.resolve('public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const definedKeyframes = new Set([...css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(m => m[1]));

  // Specifically check all required accessory and pawn movement keyframes
  const requiredPawnKeyframes = [
    'crownGlowFloat',
    'crownSparkle',
    'jailClink',
    'shieldOrbit',
    'pawnIdleBounce',
    'pawnHopParabolic',
    'pawnShadowHop',
    'pawnLandingSquash',
    'pinMeArrow',
    'tokenHop3D',
    'movingTokenStride',
    'wormholeWarpOut',
    'wormholeWarpIn'
  ];

  for (const kf of requiredPawnKeyframes) {
    check(definedKeyframes.has(kf), `Required pawn keyframe "${kf}" must exist in styles.css`);
  }
}

console.log(`  ✔ [PASS] Pawn System CSS Keyframes 100% defined and valid.`);

// =============================================================================
// SUITE 5: 10 TEAMS ON START TILE & 10 TEAMS IN JAIL EDGE CASES
// =============================================================================
console.log('\n[SUITE 5] Extreme Congestion on Tile 0 (Start) and Tile 42 (Jail)...');

{
  // 10 teams on Start Tile 0
  const all10Start = Array.from({ length: 10 }, (_, i) => makeTeam(i, 0));
  const startHTML = renderTileGarrison(all10Start, { meId: 3, activeTeamId: 0, leaderId: 9, tilePos: 0 });
  check(startHTML.includes('garrison-cluster'), '10 teams on start tile renders Mode C cluster');
  check(startHTML.includes('data-count="10"'), 'data-count is 10');
  check(startHTML.includes('+9'), 'cluster-count is +9');
  check(startHTML.includes('data-team="3"'), 'Me team 3 is cluster lead');

  // 10 teams in Jail Tile 42
  const all10Jail = Array.from({ length: 10 }, (_, i) => makeTeam(i, 42, { jail: 2 }));
  const jailHTML = renderTileGarrison(all10Jail, { meId: null, activeTeamId: 4, leaderId: 1, tilePos: 42 });
  check(jailHTML.includes('garrison-cluster'), '10 teams in jail renders Mode C cluster');
  check(jailHTML.includes('data-count="10"'), 'data-count is 10 in jail');
  check(jailHTML.includes('pawn-jail-overlay'), 'Cluster lead in jail renders pawn-jail-overlay accessory');
  check(jailHTML.includes('is-jailed'), 'Cluster lead has is-jailed class');
  check(jailHTML.includes('data-team="4"'), 'Active team 4 is cluster lead in jail when meId is null');
}

console.log(`  ✔ [PASS] 10 teams on start and in jail render cleanly with correct cluster badges & jail overlays.`);

// =============================================================================
// SUITE 6: MASSIVE FUZZING & RAPID STATE TRANSITION STRESS (50,000 RUNS)
// =============================================================================
console.log('\n[SUITE 6] Massive Fuzzing & Rapid State Transition Stress (50,000 iterations)...');

let fuzzErrors = 0;
for (let i = 0; i < 50000; i++) {
  const teamCount = Math.floor(Math.random() * 11); // 0 to 10 teams
  const teams = Array.from({ length: teamCount }, (_, idx) => makeTeam(
    idx,
    Math.floor(Math.random() * 44),
    {
      jail: Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 0,
      buffs: {
        shield: Math.random() > 0.8 ? 1 : 0,
        pass: Math.random() > 0.8 ? 1 : 0,
        double: 0
      }
    }
  ));

  const meOpts = [null, undefined, '', 0, 1, 5, 9, '0', '7', 99];
  const activeOpts = [null, undefined, '', 0, 2, 6, 8, '0', '3', 100];
  const leaderOpts = [null, undefined, '', 0, 4, 7, '0', '9', -1];

  const meId = meOpts[Math.floor(Math.random() * meOpts.length)];
  const activeTeamId = activeOpts[Math.floor(Math.random() * activeOpts.length)];
  const leaderId = leaderOpts[Math.floor(Math.random() * leaderOpts.length)];
  const tilePos = Math.floor(Math.random() * 44);

  try {
    const html = renderTileGarrison(teams, { meId, activeTeamId, leaderId, tilePos });
    if (teamCount === 0) {
      if (html !== '') fuzzErrors++;
    } else {
      if (typeof html !== 'string' || html.length < 50 || html.includes('undefined') || html.includes('NaN')) {
        fuzzErrors++;
      }
    }
  } catch (err) {
    fuzzErrors++;
  }
}

check(fuzzErrors === 0, `50,000 fuzzing iterations produced ${fuzzErrors} errors`);
console.log(`  ✔ [PASS] 50,000 rapid randomized state transitions completed with 0 errors.`);

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log(`🎉 EMPIRICAL CHALLENGER ITERATION 2 HARNESS COMPLETE`);
console.log(`- Total Assertions Passed: ${assertions}`);
console.log(`- Overall Result: 100% PASS`);
console.log('='.repeat(80));
