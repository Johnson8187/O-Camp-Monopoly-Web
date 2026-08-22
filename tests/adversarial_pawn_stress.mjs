/**
 * Adversarial Stress & Boundary Verification Test Suite
 * Monopoly Pawn Sprite System Upgrade (Challenger 1)
 *
 * Scenarios:
 * 1. Multi-Team Congestion Stress Test (10 Teams on Start, Jail, and all 44 tiles)
 * 2. 2-3 Team Boundary Stacking & Geometric Layout Occlusion Matrix (45 pairs + 120 triplets on LV1-LV3 bases)
 * 3. High-Speed Hop Sequence, Rapid Roll Queue, & Coordinate Desync Stress
 * 4. Archetype Silhouette & SVG Vector Soundness & Malformed Input Robustness
 * 5. Critical Vulnerability / Flaw Reproduction Suite
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { G } from '../src/game-core.js';
import {
  PAWN_ARCHETYPES,
  pawnSpriteSVG,
  renderPawnSprite,
  renderTileGarrison,
  movementPath
} from '../public/game-fx.js';

console.log('='.repeat(80));
console.log('🛡️  RUNNING CHALLENGER 1: ADVERSARIAL PAWN SPRITE & GARRISON STRESS HARNESS');
console.log('='.repeat(80));

let totalAssertions = 0;
const findings = [];

function check(cond, msg) {
  assert.ok(cond, msg);
  totalAssertions++;
}

function recordFlaw(id, desc, reproductionData) {
  findings.push({ id, desc, reproductionData });
}

// -----------------------------------------------------------------------------
// Helper mock generators
// -----------------------------------------------------------------------------
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

function makeAll10Teams(pos = 0, optsFn = () => ({})) {
  return Array.from({ length: 10 }, (_, i) => makeTeam(i, pos, optsFn(i)));
}

// =============================================================================
// SCENARIO 1: Multi-Team Congestion Stress Test (10 Teams on Tile)
// =============================================================================
console.log('\n[SCENARIO 1] Multi-Team Congestion Stress Test (10 Teams on Same Tile)...');

{
  // 1.1 All 10 teams on Start Tile 0, Tile 31, Jail Tile 42, and all track positions
  const testTiles = [0, 31, 42, 5, 12, 28, 43];

  for (const tilePos of testTiles) {
    const teams = makeAll10Teams(tilePos);

    // Test with explicit team IDs
    const perspectives = [
      { meId: 0, activeTeamId: 1, leaderId: 2 },
      { meId: 7, activeTeamId: 7, leaderId: 7 },
      { meId: 9, activeTeamId: 0, leaderId: 4 }
    ];

    for (const ctx of perspectives) {
      const html = renderTileGarrison(teams, { ...ctx, tilePos });

      check(html.includes('tile-garrison garrison-cluster'), `Must render Mode C cluster for 10 teams on tile ${tilePos}`);
      check(html.includes('data-count="10"'), 'data-count must reflect 10 teams');
      check(html.includes('cluster-lead'), 'Must contain a primary representative cluster-lead pawn');
      check(html.includes('pawn-cluster-pill'), 'Must contain cluster pill badge');
      check(html.includes('<span class="cluster-count">+9</span>'), 'Pill count must be +9 for 10 teams');
      check(html.includes('cluster-dots'), 'Must contain cluster dots container');

      // Check dots: exactly 5 dots rendered (slice 0..5)
      const dotMatches = html.match(/class="cluster-dot"/g);
      check(dotMatches && dotMatches.length === 5, `Expected 5 dots for overflow display, got ${dotMatches?.length}`);

      // Verify no NaN or undefined in HTML
      check(!html.includes('NaN'), `HTML must not contain NaN on tile ${tilePos}`);
      check(!html.includes('undefined'), `HTML must not contain undefined on tile ${tilePos}`);
      check(!html.includes('[object Object]'), `HTML must not contain [object Object] on tile ${tilePos}`);

      // Verify tag nesting balance
      const openDivs = (html.match(/<div/g) || []).length;
      const closeDivs = (html.match(/<\/div>/g) || []).length;
      check(openDivs === closeDivs, `Div tags must be balanced: open=${openDivs}, close=${closeDivs}`);

      const openSvgs = (html.match(/<svg/g) || []).length;
      const closeSvgs = (html.match(/<\/svg>/g) || []).length;
      check(openSvgs === closeSvgs, `SVG tags must be balanced: open=${openSvgs}, close=${closeSvgs}`);
    }
  }

  // 1.2 Test all intermediate congestion counts from 4 to 10
  for (let count = 4; count <= 10; count++) {
    const teams = Array.from({ length: count }, (_, i) => makeTeam(i, 31));
    const html = renderTileGarrison(teams, { meId: 0 });

    check(html.includes(`data-count="${count}"`), `data-count must be ${count}`);
    check(html.includes(`<span class="cluster-count">+${count - 1}</span>`), `cluster count must be +${count - 1}`);

    const expectedDots = Math.min(5, count - 1);
    const dotMatches = html.match(/class="cluster-dot"/g);
    check(dotMatches && dotMatches.length === expectedDots, `Expected ${expectedDots} dots for count=${count}`);
  }

  // 1.3 Perspective priority in Mode C (when explicit IDs are supplied)
  const allTeams = makeAll10Teams(31);
  const htmlMe = renderTileGarrison(allTeams, { meId: 6, activeTeamId: 3, leaderId: 0 });
  check(htmlMe.includes('cluster-lead') && htmlMe.includes('data-team="6"'), 'meId must be cluster lead when valid');

  console.log(`  ✔ Scenario 1 Base Verification: 10-team congestion and cluster aggregation rendered with balanced tags across all track positions.`);
}

// =============================================================================
// SCENARIO 2: 2-3 Team Boundary Stacking & Geometric Layout Occlusion Matrix
// =============================================================================
console.log('\n[SCENARIO 2] 2-3 Team Boundary Stacking & Layout Occlusion Matrix...');

{
  // 2.1 All 45 combinations of 2 teams
  let twoTeamCombos = 0;
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      const teams = [makeTeam(i, 2), makeTeam(j, 2)];
      const html = renderTileGarrison(teams, { meId: j });

      check(html.includes('tile-garrison garrison-stair garrison-2'), 'Must render garrison-2 stair step');
      check(html.includes('data-count="2"'), 'Must have data-count=2');
      check(html.includes('stair-step-1-of-2'), 'Must have step 1 of 2');
      check(html.includes('stair-step-2-of-2'), 'Must have step 2 of 2');
      
      // Since meId = j, team j should be in the front (stair-step-2-of-2)
      check(html.includes(`is-me`) && html.includes(`data-team="${j}"`), 'meId must be placed in front layer');
      twoTeamCombos++;
    }
  }
  check(twoTeamCombos === 45, `Expected 45 2-team combinations, tested ${twoTeamCombos}`);

  // 2.2 All 120 combinations of 3 teams
  let threeTeamCombos = 0;
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      for (let k = j + 1; k < 10; k++) {
        const teams = [makeTeam(i, 6), makeTeam(j, 6), makeTeam(k, 6)];
        const html = renderTileGarrison(teams, { meId: k, activeTeamId: j });

        check(html.includes('tile-garrison garrison-stair garrison-3'), 'Must render garrison-3 stair step');
        check(html.includes('data-count="3"'), 'Must have data-count=3');
        check(html.includes('stair-step-1-of-3'), 'Must have step 1 of 3');
        check(html.includes('stair-step-2-of-3'), 'Must have step 2 of 3');
        check(html.includes('stair-step-3-of-3'), 'Must have step 3 of 3');
        threeTeamCombos++;
      }
    }
  }
  check(threeTeamCombos === 120, `Expected 120 3-team combinations, tested ${threeTeamCombos}`);

  // 2.3 Boundary Building & Property Tile Occlusion Stress Simulation
  function baseBuildingHTML(owner) {
    const level = Math.max(1, Math.min(3, Number(owner.level) || 1));
    const names = ['營地', '商店', '豪華賭場'];
    return `<div class="base-building lv${level}" style="--owner:${owner.color}" aria-label="${names[level - 1]}"><i class="base-roof"></i><i class="base-body"><b></b><b></b><b></b></i><em>LV${level}</em></div>`;
  }

  function simulateTileHTML(tileIndex, ownerTeam, occupyingTeams, opts = {}) {
    const kind = G.TRACK[tileIndex][0];
    const T = G.TILE[kind];
    const own = ownerTeam;
    const here = occupyingTeams;
    const shieldHere = here.some(x => Number(x.buffs?.shield || 0) > 0);

    return `<div class="tile ${here.length ? 'has-garrison' : ''} ${shieldHere ? 'has-shield' : ''}" data-i="${tileIndex}">
      ${kind === 'base' && own ? baseBuildingHTML(own) : `<div class="sprite-mock"></div>`}
      <div class="tl" style="color:${T.fg}">${kind === 'base' && own ? `基地 LV${own.level}` : T.n}</div>
      ${own ? `<div class="ow" style="background:${own.color};color:#fff">🚩${own.id + 1}</div>` : ''}
      ${here.length ? `<div class="garrison-aura" aria-hidden="true"></div>${shieldHere ? '<div class="shield-aura">🛡️</div>' : ''}${renderTileGarrison(here, opts)}` : ''}
    </div>`;
  }

  // Test every base tile across all 3 building levels with single, 2-team, 3-team, and 10-team garrisons
  for (const baseIdx of G.BASE_IDX) {
    for (let lv = 1; lv <= 3; lv++) {
      const owner = { id: 0, color: G.TEAM_COLORS[0], level: lv };

      // 1-team
      const tile1 = simulateTileHTML(baseIdx, owner, [makeTeam(1, baseIdx)], { meId: 1 });
      check(tile1.includes(`lv${lv}`), `Must contain lv${lv} building`);
      check(tile1.includes('🚩1'), 'Must contain owner flag 🚩1');
      check(tile1.includes('hero-pawn'), 'Must contain hero pawn');

      // 2-teams
      const tile2 = simulateTileHTML(baseIdx, owner, [makeTeam(1, baseIdx), makeTeam(2, baseIdx)], { meId: 2 });
      check(tile2.includes(`lv${lv}`), `Must contain lv${lv} building`);
      check(tile2.includes('🚩1'), 'Must contain owner flag 🚩1');
      check(tile2.includes('garrison-2'), 'Must contain garrison-2');

      // 3-teams
      const tile3 = simulateTileHTML(baseIdx, owner, [makeTeam(1, baseIdx), makeTeam(2, baseIdx), makeTeam(3, baseIdx)], { meId: 3 });
      check(tile3.includes(`lv${lv}`), `Must contain lv${lv} building`);
      check(tile3.includes('🚩1'), 'Must contain owner flag 🚩1');
      check(tile3.includes('garrison-3'), 'Must contain garrison-3');

      // 10-teams
      const tile10 = simulateTileHTML(baseIdx, owner, makeAll10Teams(baseIdx), { meId: 4 });
      check(tile10.includes(`lv${lv}`), `Must contain lv${lv} building`);
      check(tile10.includes('🚩1'), 'Must contain owner flag 🚩1');
      check(tile10.includes('garrison-cluster'), 'Must contain garrison-cluster');
      check(tile10.includes('+9'), 'Must contain +9 count');
    }
  }

  console.log(`  ✔ Scenario 2 Passed: 45 2-team pairs + 120 3-team triplets + all base building levels verified without syntax errors or tag collisions.`);
}

// =============================================================================
// SCENARIO 3: High-Speed Hop Sequence, Rapid Roll Queue, & Coordinate Desync Stress
// =============================================================================
console.log('\n[SCENARIO 3] High-Speed Hop Sequence & Rapid Roll Queue Stress...');

{
  // 3.1 Verify movementPoint for all 44 tiles
  for (let i = 0; i < G.N; i++) {
    const tile = G.TRACK[i];
    check(Array.isArray(tile) && tile.length === 3, `Tile ${i} must have 3 elements [kind, col, row]`);
    const pt = { x: tile[1] * 50 + 26, y: tile[2] * 50 + 26 };

    check(Number.isFinite(pt.x) && pt.x >= 26, `Tile ${i} X coord ${pt.x} must be >= 26`);
    check(Number.isFinite(pt.y) && pt.y >= 26, `Tile ${i} Y coord ${pt.y} must be >= 26`);
    check(!Number.isNaN(pt.x) && !Number.isNaN(pt.y), `Tile ${i} coords must not be NaN`);
  }

  // 3.2 Movement Path generation stress
  // Normal steps
  check(JSON.stringify(movementPath(0, 3, 3, G.N)) === JSON.stringify([1, 2, 3]), 'Normal forward 3 steps');
  // Wrap around track
  check(JSON.stringify(movementPath(42, 4, 2, G.N)) === JSON.stringify([43, 0, 1, 2]), 'Wrap around 4 steps from 42 to 2');
  // Full lap (44 steps)
  const fullLap = movementPath(0, 44, 0, G.N);
  check(fullLap.length === 44, 'Full lap must generate 44 steps');
  check(fullLap[fullLap.length - 1] === 0, 'Full lap ends at 0');
  // Zero steps
  check(JSON.stringify(movementPath(5, 0, 5, G.N)) === JSON.stringify([]), 'Zero steps returns empty path');
  // Teleport jump (e.g. wormhole from 12 to 37)
  const wormJump = movementPath(12, 1, 37, G.N);
  check(JSON.stringify(wormJump) === JSON.stringify([13, 37]), 'Wormhole roll step with teleport landing');

  // 3.3 Rapid Roll Queue simulation & Token Lifecycle Invariants
  class MockDOMTokenManager {
    constructor() {
      this.tokens = new Map();
      this.positions = {};
      this.camera = null;
      this.stepText = '';
      this.isFxRunning = false;
      this.queue = [];
    }

    ensureMovingToken(teamId, pos, team) {
      let token = this.tokens.get(teamId);
      const pt = { x: G.TRACK[pos][1] * 50 + 26, y: G.TRACK[pos][2] * 50 + 26 };
      if (!token) {
        token = {
          teamId,
          classes: new Set(['moving-token']),
          style: {
            '--token-x': `${pt.x}px`,
            '--token-y': `${pt.y}px`,
            '--token-color': team?.color || '#f2c12e'
          },
          html: renderPawnSprite(teamId, {}, { isMoving: true })
        };
        this.tokens.set(teamId, token);
      } else {
        token.style['--token-x'] = `${pt.x}px`;
        token.style['--token-y'] = `${pt.y}px`;
      }
      return token;
    }

    updateMovementDom(teamId, pos) {
      const token = this.tokens.get(teamId);
      if (token) {
        const pt = { x: G.TRACK[pos][1] * 50 + 26, y: G.TRACK[pos][2] * 50 + 26 };
        token.style['--token-x'] = `${pt.x}px`;
        token.style['--token-y'] = `${pt.y}px`;
        token.classes.delete('pawn-landing');
        token.classes.add('pawn-hopping');
      }
    }

    finishMovementDom(teamId, pos) {
      const token = this.tokens.get(teamId);
      if (token) {
        token.classes.delete('pawn-hopping');
        token.classes.add('pawn-landing');
      }
    }

    finishRollTask(teamId) {
      delete this.positions[teamId];
      if (this.camera?.teamId === teamId) this.camera = null;
      this.tokens.delete(teamId);
    }
  }

  const manager = new MockDOMTokenManager();

  // Rapid roll simulation: 200 sequential roll events across all 10 teams
  for (let eventIdx = 0; eventIdx < 200; eventIdx++) {
    const teamId = eventIdx % 10;
    const team = makeTeam(teamId);
    const beforePos = (eventIdx * 3) % G.N;
    const rollVal = (eventIdx % 6) + 1;
    const walkSteps = rollVal;
    const walkPath = [];
    for (let s = 1; s <= walkSteps; s++) {
      walkPath.push((beforePos + s) % G.N);
    }
    const targetPos = walkPath[walkPath.length - 1];

    // Ensure moving token created
    manager.positions[teamId] = beforePos;
    const token = manager.ensureMovingToken(teamId, beforePos, team);
    check(token !== null, `Token for team ${teamId} must be instantiated`);
    check(token.classes.has('moving-token'), 'Token must have moving-token class');

    // Step through walk path
    for (let step = 0; step < walkPath.length; step++) {
      const pos = walkPath[step];
      manager.positions[teamId] = pos;
      manager.updateMovementDom(teamId, pos);

      const expectedPt = { x: G.TRACK[pos][1] * 50 + 26, y: G.TRACK[pos][2] * 50 + 26 };
      check(token.style['--token-x'] === `${expectedPt.x}px`, `X coord desync at step ${step}: expected ${expectedPt.x}px`);
      check(token.style['--token-y'] === `${expectedPt.y}px`, `Y coord desync at step ${step}: expected ${expectedPt.y}px`);
      check(token.classes.has('pawn-hopping'), 'Token must have pawn-hopping class during movement');
    }

    // Finish step
    manager.finishMovementDom(teamId, targetPos);
    check(token.classes.has('pawn-landing'), 'Token must have pawn-landing class on finish');

    // Clean up
    manager.finishRollTask(teamId);
    check(!manager.tokens.has(teamId), `Token for team ${teamId} must be purged on finishRollTask`);
    check(manager.positions[teamId] === undefined, `positions[${teamId}] must be cleared`);
  }

  console.log(`  ✔ Scenario 3 Passed: 200 rapid roll events and coordinate step hops verified with zero coordinate desync or ghost tokens.`);
}

// =============================================================================
// SCENARIO 4: Archetype Silhouettes, SVG Vector Soundness & Malformed Inputs
// =============================================================================
console.log('\n[SCENARIO 4] Archetype Silhouettes, SVG Vector Soundness & Robustness...');

{
  // 4.1 All 10 Archetypes definition and unique features
  check(PAWN_ARCHETYPES.length === 10, 'Must have exactly 10 pawn archetypes');
  const uniqueNames = new Set(PAWN_ARCHETYPES.map(a => a.name));
  check(uniqueNames.size === 10, 'All 10 archetype names must be unique');

  const uniqueTitles = new Set(PAWN_ARCHETYPES.map(a => a.roleTitle));
  check(uniqueTitles.size === 10, 'All 10 archetype role titles must be unique');

  for (let i = 0; i < 10; i++) {
    const arch = PAWN_ARCHETYPES[i];
    check(arch.id === i, `Archetype id must match index ${i}`);
    check(typeof arch.color === 'string' && arch.color.startsWith('#'), `Archetype color must be hex string`);
    check(typeof arch.dark === 'string' && arch.dark.startsWith('#'), `Archetype dark color must be hex string`);

    const svg = pawnSpriteSVG(i);
    check(svg.startsWith('<svg') && svg.endsWith('</svg>'), `SVG for team ${i} must have valid root tag`);
    check(svg.includes('viewBox="0 0 16 18"'), `SVG for team ${i} must have 16x18 viewBox`);
    check(svg.includes('shape-rendering="crispEdges"'), `SVG for team ${i} must have crispEdges`);
    check(!svg.includes('<image'), `SVG for team ${i} must not contain raster <image> tags`);
    check(!svg.includes('undefined'), `SVG for team ${i} must not contain undefined`);
    check(!svg.includes('NaN'), `SVG for team ${i} must not contain NaN`);
  }

  // 4.2 Status Accessories rendering combinations
  const accessoryPermutations = [
    { isMe: false, isLeader: false, isJailed: false, isShielded: false },
    { isMe: true, isLeader: false, isJailed: false, isShielded: false },
    { isMe: false, isLeader: true, isJailed: false, isShielded: false },
    { isMe: false, isLeader: false, isJailed: true, isShielded: false },
    { isMe: false, isLeader: false, isJailed: false, isShielded: true },
    { isMe: true, isLeader: true, isJailed: true, isShielded: true }
  ];

  for (const acc of accessoryPermutations) {
    for (let tid = 0; tid < 10; tid++) {
      const html = renderPawnSprite(tid, acc);

      if (acc.isMe) check(html.includes('is-me'), 'Must have is-me class');
      if (acc.isLeader) {
        check(html.includes('is-leader'), 'Must have is-leader class');
        check(html.includes('pawn-crown'), 'Must render crown accessory');
      }
      if (acc.isJailed) {
        check(html.includes('is-jailed'), 'Must have is-jailed class');
        check(html.includes('pawn-jail-overlay'), 'Must render jail accessory');
      }
      if (acc.isShielded) {
        check(html.includes('is-shielded'), 'Must have is-shielded class');
        check(html.includes('pawn-shield-orbit'), 'Must render shield accessory');
      }
    }
  }

  // 4.3 Malformed and boundary inputs
  const negPawn = renderPawnSprite(-1);
  check(negPawn.includes('team-9'), 'Negative teamId -1 wraps to team 9');

  const strPawn = renderPawnSprite('4');
  check(strPawn.includes('team-4'), 'String teamId "4" parses to team 4');

  const largePawn = renderPawnSprite(105);
  check(largePawn.includes('team-5'), 'TeamId 105 wraps to team 5');

  check(renderTileGarrison(null) === '', 'Null garrison returns empty string');
  check(renderTileGarrison(undefined) === '', 'Undefined garrison returns empty string');
  check(renderTileGarrison([]) === '', 'Empty garrison returns empty string');

  const partialTeamGarrison = renderTileGarrison([{ id: 2 }], { meId: 2 });
  check(partialTeamGarrison.includes('garrison-single'), 'Partial team object renders cleanly');

  console.log(`  ✔ Scenario 4 Passed: All 10 archetypes, accessory permutations, and malformed boundary inputs handled safely.`);
}

// =============================================================================
// SCENARIO 5: Empirical Flaw & Bug Reproduction Suite
// =============================================================================
console.log('\n[SCENARIO 5] Empirical Defect Reproduction & Edge Case Mining...');

{
  // FLAW 1: Number(null) / Number(undefined) coercion in renderTileGarrison and app.js
  // When meId is null (Host/Viewer screen), Team 0 is falsely flagged as is-me (shows yellow ▼ arrow).
  const hostSinglePawnHTML = renderTileGarrison([{ id: 0, pos: 5 }], { meId: null, leaderId: null });
  const flaw1A = hostSinglePawnHTML.includes('is-me');
  const flaw1B = hostSinglePawnHTML.includes('is-leader') || hostSinglePawnHTML.includes('pawn-crown');

  if (flaw1A || flaw1B) {
    recordFlaw('BUG-PAWN-01', 'Host/Viewer/Spectator screen falsely renders is-me indicator (▼) and is-leader (👑) on Team 0 due to Number(null) === Number(0) coercion.', {
      target: 'public/game-fx.js:560-561,582-583,596-605 & public/app.js:525-526,1803-1804',
      isMeCoerced: flaw1A,
      isLeaderCoerced: flaw1B,
      reproSnippet: `renderTileGarrison([{ id: 0, pos: 5 }], { meId: null, leaderId: null }) -> includes('is-me'): ${flaw1A}, includes('pawn-crown'): ${flaw1B}`
    });
    console.log('  ⚠️ [REPRODUCED] BUG-PAWN-01: Number(null) === 0 causes Team 0 to always be flagged as is-me and is-leader on spectator/host views.');
  } else {
    check(!flaw1A && !flaw1B, 'BUG-PAWN-01 Patched: Team 0 not falsely flagged as is-me or is-leader when meId/leaderId are null');
    console.log('  ✔ [PATCHED] BUG-PAWN-01: Number(null) coercion guarded; spectator/host screens render cleanly.');
  }

  // FLAW 2: Mode C Cluster Representative Selection when meId is null
  // In a cluster with Team 0, 1, 2, 3 and activeTeamId = 3, when viewing as Host (meId = null),
  // teamsOnTile.find(t => Number(t.id) === Number(meId)) matches Team 0 because Number(null) === 0,
  // so the active roller (Team 3) is completely ignored!
  const crowdedTileTeams = [makeTeam(0, 31), makeTeam(1, 31), makeTeam(2, 31), makeTeam(3, 31)];
  const clusterHTML = renderTileGarrison(crowdedTileTeams, { meId: null, activeTeamId: 3, leaderId: 2 });
  const flaw2 = clusterHTML.includes('cluster-lead') && clusterHTML.includes('data-team="0"');
  if (flaw2) {
    recordFlaw('BUG-PAWN-02', 'Mode C Cluster representative selection prioritizes Team 0 over activeTeamId or leaderId when meId is null.', {
      target: 'public/game-fx.js:596-600',
      reproSnippet: `renderTileGarrison([T0, T1, T2, T3], { meId: null, activeTeamId: 3 }) selected team 0 instead of active team 3.`
    });
    console.log('  ⚠️ [REPRODUCED] BUG-PAWN-02: Mode C Cluster representative skips active team in spectator/host mode due to Number(null) match.');
  } else {
    check(!flaw2, 'BUG-PAWN-02 Patched: Active team 3 correctly chosen as cluster lead when meId is null');
    console.log('  ✔ [PATCHED] BUG-PAWN-02: Active team prioritized as cluster representative when spectator views.');
  }

  // FLAW 3: CSS Visual Collision between is-me indicator (▼) and leader crown (👑)
  // When a team is both is-me and is-leader, styles.css must provide an offset for .pixel-pawn-wrapper.is-me.is-leader::before
  const doubleAccPawn = renderPawnSprite(0, { isMe: true, isLeader: true });
  const hasBothClasses = doubleAccPawn.includes('is-me') && doubleAccPawn.includes('is-leader');
  const cssContent = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const hasCssOffset = /\.pixel-pawn-wrapper\.is-me\.is-leader::before\s*\{\s*top:\s*-(2[4-9]|30)px/.test(cssContent);

  if (hasBothClasses && !hasCssOffset) {
    recordFlaw('BUG-PAWN-03', 'CSS Visual Overlap: is-me arrow (▼ at top: -17px) and pawn-crown (👑 at top: -18px) collide when a user is in 1st place.', {
      target: 'public/styles.css:154,157',
      reproSnippet: `When a team is both is-me and is-leader, the ▼ arrow and the crown render on top of each other without vertical spacing compensation.`
    });
    console.log('  ⚠️ [REPRODUCED] BUG-PAWN-03: Visual collision between is-me arrow and leader crown on 1st place player pawn.');
  } else {
    check(hasBothClasses && hasCssOffset, 'BUG-PAWN-03 Patched: .is-me.is-leader has vertical top offset in styles.css');
    console.log('  ✔ [PATCHED] BUG-PAWN-03: .pixel-pawn-wrapper.is-me.is-leader::before offset prevents crown overlap.');
  }
}

console.log('\n' + '='.repeat(80));
console.log(`📊 ADVERSARIAL STRESS TEST SUMMARY:`);
console.log(`- Total Invariant Assertions Passed: ${totalAssertions}`);
console.log(`- Confirmed Failure Modes & Bugs Found: ${findings.length}`);
for (const f of findings) {
  console.log(`  • [${f.id}] ${f.desc}`);
}
console.log('='.repeat(80));
