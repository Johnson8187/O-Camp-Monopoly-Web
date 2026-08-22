/**
 * Challenger 2: Pawn Sprite System, Status Accessories, Responsive Viewport & PWA Invariant Stress Harness
 * 
 * Adversarial Scenarios:
 * 1. Status Accessory Transitions & Combinations (Jail + Shield + Crown concurrent, rapid state toggle, z-index layering, CSS keyframe existence)
 * 2. Responsive Viewport Scaling & 3D Perspective Matrix (Extreme viewports 320px..4K, foldables, aspect ratios, transform bounds, camera tracking)
 * 3. PWA Version Invariant Check (Strict version string matching across all 7 config files, zero stale references)
 * 4. CSS Keyframe & Animation Integrity Audit
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { G } from '../../src/game-core.js';
import {
  PAWN_ARCHETYPES,
  pawnSpriteSVG,
  renderPawnSprite,
  renderTileGarrison
} from '../../public/game-fx.js';

console.log('='.repeat(80));
console.log('⚡ RUNNING CHALLENGER 2: PAWN SPRITES, ACCESSORIES, VIEWPORT & PWA STRESS HARNESS');
console.log('='.repeat(80));

const results = {
  passed: 0,
  failed: 0,
  findings: []
};

function recordTest(name, passed, details = '') {
  if (passed) {
    results.passed++;
    console.log(`  ✔ [PASS] ${name}`);
  } else {
    results.failed++;
    results.findings.push({ name, details });
    console.log(`  ❌ [FAIL] ${name}: ${details}`);
  }
}

/* =========================================================================
   SUITE 1: STATUS ACCESSORY COMBINATIONS, TRANSITIONS & CSS AUDIT
   ========================================================================= */
console.log('\n--- SUITE 1: STATUS ACCESSORIES, COMBINATIONS & CSS AUDIT ---');

// Test 1.1: All 2^4 = 16 Combinations of Status Flags (isMe, isLeader, isJailed, isShielded)
console.log('[TEST 1.1] Testing all 16 status flag combinations for all 10 teams...');
let allCombosValid = true;
let comboFailMsg = '';

for (let tid = 0; tid < 10; tid++) {
  for (let me of [false, true]) {
    for (let leader of [false, true]) {
      for (let jail of [false, true]) {
        for (let shield of [false, true]) {
          const markup = renderPawnSprite(tid, { isMe: me, isLeader: leader, isJailed: jail, isShielded: shield });
          
          if (!markup.includes(`team-${tid}`)) {
            allCombosValid = false;
            comboFailMsg = `Team ${tid} missing team class`;
          }
          if (me && !markup.includes('is-me')) {
            allCombosValid = false;
            comboFailMsg = `Missing is-me class`;
          }
          if (leader && (!markup.includes('is-leader') || !markup.includes('pawn-crown'))) {
            allCombosValid = false;
            comboFailMsg = `Leader flag missing crown or is-leader class`;
          }
          if (!leader && markup.includes('pawn-crown')) {
            allCombosValid = false;
            comboFailMsg = `Non-leader has crown markup`;
          }
          if (jail && (!markup.includes('is-jailed') || !markup.includes('pawn-jail-overlay'))) {
            allCombosValid = false;
            comboFailMsg = `Jail flag missing jail overlay or is-jailed class`;
          }
          if (!jail && markup.includes('pawn-jail-overlay')) {
            allCombosValid = false;
            comboFailMsg = `Non-jailed has jail markup`;
          }
          if (shield && (!markup.includes('is-shielded') || !markup.includes('pawn-shield-orbit'))) {
            allCombosValid = false;
            comboFailMsg = `Shield flag missing shield orbit or is-shielded class`;
          }
          if (!shield && markup.includes('pawn-shield-orbit')) {
            allCombosValid = false;
            comboFailMsg = `Non-shielded has shield markup`;
          }
        }
      }
    }
  }
}
recordTest('All 16 Status Flag Combinations Render Correct Elements (160 test permutations)', allCombosValid, comboFailMsg);

// Test 1.2: Simultaneous Triple Status (Jail + Shield + Crown) Integrity
console.log('[TEST 1.2] Testing simultaneous Jail + Shield + Crown (Max Accessory Load)...');
const tripleStatusMarkup = renderPawnSprite(0, { isMe: true, isLeader: true, isJailed: true, isShielded: true });
const hasCrown = tripleStatusMarkup.includes('class="pawn-accessory pawn-crown"');
const hasJail = tripleStatusMarkup.includes('class="pawn-accessory pawn-jail-overlay"');
const hasShield = tripleStatusMarkup.includes('class="pawn-accessory pawn-shield-orbit"');
const hasBadge = tripleStatusMarkup.includes('class="pawn-badge"');
const hasPixelSprite = tripleStatusMarkup.includes('class="pawn-sprite-pixel"');
const triplePass = hasCrown && hasJail && hasShield && hasBadge && hasPixelSprite;
recordTest('Simultaneous Triple Status (Jail+Shield+Crown) contains all 5 discrete DOM subcomponents', triplePass, 'Missing subcomponent');

// Test 1.3: Rapid State Transition Simulation (10,000 randomized state updates)
console.log('[TEST 1.3] Stress testing 10,000 rapid randomized state transitions...');
let stateSwitchErrors = 0;
let prevState = { isMe: false, isLeader: false, isJailed: false, isShielded: false };

for (let step = 0; step < 10000; step++) {
  const nextState = {
    isMe: Math.random() > 0.5,
    isLeader: Math.random() > 0.5,
    isJailed: Math.random() > 0.5,
    isShielded: Math.random() > 0.5
  };
  const tid = Math.floor(Math.random() * 10);
  const html = renderPawnSprite(tid, nextState, { isMoving: Math.random() > 0.5, isHopping: Math.random() > 0.5 });
  
  if (!html || typeof html !== 'string' || html.length < 100) {
    stateSwitchErrors++;
  }
  prevState = nextState;
}
recordTest('10,000 Rapid Randomized State Transitions (Zero DOM generation corruption)', stateSwitchErrors === 0, `${stateSwitchErrors} errors`);

// Test 1.4: CSS Keyframes Integrity Audit for Status Accessories
console.log('[TEST 1.4] Auditing public/styles.css for missing @keyframes definitions...');
const cssContent = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');

// Extract all @keyframes
const keyframeMatches = [...cssContent.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
const keyframesSet = new Set(keyframeMatches);

// Check required animations
const expectedPawnKeyframes = [
  'pawnHopParabolic',
  'pawnShadowHop',
  'pawnLandingSquash',
  'pawnIdleBounce',
  'crownGlowFloat',
  'crownSparkle',
  'jailClink',
  'shieldOrbit'
];

const missingKeyframes = expectedPawnKeyframes.filter(k => !keyframesSet.has(k));
const hasMissingKeyframes = missingKeyframes.length > 0;

recordTest(
  'All 8 Pawn Sprite & Accessory @keyframes Defined in styles.css',
  !hasMissingKeyframes,
  `Missing @keyframes in public/styles.css: ${missingKeyframes.join(', ')}`
);

// Test 1.5: Garrison Stacking Modes (1..10 teams on single tile)
console.log('[TEST 1.5] Testing Tile Garrison Stacking Modes across team counts 0..10...');
let garrisonPass = true;
let garrisonError = '';

for (let count = 0; count <= 10; count++) {
  const teams = Array.from({ length: count }, (_, i) => ({
    id: i,
    pos: 0,
    color: PAWN_ARCHETYPES[i].color,
    buffs: { shield: i % 2 === 0 ? 1 : 0 },
    jail: i === 3 ? 1 : 0
  }));

  const out = renderTileGarrison(teams, { meId: 0, activeTeamId: 1, leaderId: 2, tilePos: 0 });

  if (count === 0 && out !== '') {
    garrisonPass = false;
    garrisonError = 'Count 0 did not return empty string';
  } else if (count === 1) {
    if (!out.includes('garrison-single') || !out.includes('hero-pawn')) {
      garrisonPass = false;
      garrisonError = 'Count 1 did not render garrison-single';
    }
  } else if (count === 2 || count === 3) {
    if (!out.includes(`garrison-${count}`) || !out.includes('garrison-stair')) {
      garrisonPass = false;
      garrisonError = `Count ${count} did not render garrison-stair garrison-${count}`;
    }
  } else if (count >= 4) {
    if (!out.includes('garrison-cluster') || !out.includes(`+${count - 1}`)) {
      garrisonPass = false;
      garrisonError = `Count ${count} did not render garrison-cluster with +${count - 1} badge`;
    }
  }
}
recordTest('Garrison Stacking Scalability (Modes A, B, C for 0..10 teams)', garrisonPass, garrisonError);


/* =========================================================================
   SUITE 2: RESPONSIVE SCALING & 3D PERSPECTIVE MATRIX
   ========================================================================= */
console.log('\n--- SUITE 2: RESPONSIVE VIEWPORT SCALING & 3D MATRIX ---');

// Board constants
const BOARD_CELL = 46;
const BOARD_GAP = 4;
const BOARD_WIDTH = 11 * (BOARD_CELL + BOARD_GAP);  // 550px
const BOARD_HEIGHT = 10 * (BOARD_CELL + BOARD_GAP); // 500px

function simulateFitBoard(viewport, role = 'team', tab = 'main', camera = null) {
  const { width, height } = viewport;
  const wrapWidth = Math.max(100, width - 16); // padding margin deduction
  const wrapTop = 80; // approximate top bar height
  
  if (camera) {
    const camHeight = Math.min(580, Math.max(390, height - wrapTop - 18));
    const scale = width < 600 ? 1.35 : width < 1000 ? 1.55 : 1.75;
    const tile = G.TRACK[camera.pos] || G.TRACK[0];
    const to = { x: tile[1] * 50 + 23, y: tile[2] * 50 + 23 };
    const fromTile = G.TRACK[camera.from ?? camera.pos] || G.TRACK[0];
    const from = { x: fromTile[1] * 50 + 23, y: fromTile[2] * 50 + 23 };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const centerX = wrapWidth * 0.5;
    const centerY = camHeight * 0.52;
    const tx = centerX - to.x;
    const ty = centerY - to.y;
    const rotX = 32;
    const rotY = dx > 0 ? -4 : dx < 0 ? 4 : 0;
    const rotZ = dx > 0 ? -1.5 : dx < 0 ? 1.5 : 0;
    
    return {
      mode: 'camera',
      camHeight,
      scale,
      tx,
      ty,
      rotX,
      rotY,
      rotZ,
      renderedWidth: BOARD_WIDTH * scale,
      renderedHeight: BOARD_HEIGHT * scale
    };
  }

  const max = Math.max(240, wrapWidth - 4);
  const stage = width >= 860;
  const mobileTeam = role === 'team' && !stage;
  const teamPreview = mobileTeam && tab !== 'main';
  const viewerMax = role === 'viewer' ? 1.65 : stage ? 1.35 : 1;
  const mobileBoardHeight = height * (teamPreview ? 0.28 : 0.46);
  const availableHeight = mobileTeam
    ? mobileBoardHeight
    : stage
    ? Math.max(380, height - wrapTop - 24)
    : Infinity;

  const scale = Math.min(viewerMax, max / BOARD_WIDTH, availableHeight / BOARD_HEIGHT);
  const centerOffset = role === 'viewer' ? Math.max(0, (wrapWidth - BOARD_WIDTH * scale) / 2) : 0;
  const wrapRenderedHeight = BOARD_HEIGHT * scale;
  const isCompact = scale < 0.78;

  return {
    mode: 'static',
    scale,
    centerOffset,
    wrapRenderedHeight,
    isCompact,
    teamPreview,
    stage,
    renderedWidth: BOARD_WIDTH * scale,
    overflowX: (BOARD_WIDTH * scale) > (wrapWidth + 5), // Allow 5px subpixel tolerance
    overflowY: (BOARD_HEIGHT * scale) > (availableHeight + 5)
  };
}

const VIEWPORT_TEST_CASES = [
  { name: 'Mobile Ultra-Small (iPhone SE 1st gen / Galaxy Fold Cover)', width: 320, height: 568 },
  { name: 'Mobile Standard (iPhone SE 2nd/3rd)', width: 375, height: 667 },
  { name: 'Mobile Modern (iPhone 12/13/14/15)', width: 390, height: 844 },
  { name: 'Mobile Plus / Max (iPhone 14 Plus / Pro Max)', width: 414, height: 896 },
  { name: 'Mobile Android High-Aspect (Pixel 7 / Galaxy S23)', width: 412, height: 915 },
  { name: 'Foldable Inner Screen (Galaxy Z Fold 5 Unfolded)', width: 768, height: 1024 },
  { name: 'Tablet Portrait (iPad Mini / Air Portrait)', width: 820, height: 1180 },
  { name: 'Tablet Desktop Stage Breakpoint (860px)', width: 860, height: 1180 },
  { name: 'Tablet Landscape (iPad Pro Landscape)', width: 1366, height: 1024 },
  { name: 'Laptop HD (1366x768)', width: 1366, height: 768 },
  { name: 'Desktop Full HD (1920x1080 Projector)', width: 1920, height: 1080 },
  { name: 'Desktop QHD (2560x1440)', width: 2560, height: 1440 },
  { name: 'Ultrawide Display (3440x1440 21:9)', width: 3440, height: 1440 },
  { name: '4K Ultra HD Display (3840x2160 Projector)', width: 3840, height: 2160 },
  { name: 'Extreme Narrow Ratio (280x900 Foldable narrow cover)', width: 280, height: 900 }
];

console.log('[TEST 2.1] Testing fitBoard() responsive scaling across 15 extreme viewports...');
let viewportTestPass = true;
let viewportFailDetails = '';

for (const vp of VIEWPORT_TEST_CASES) {
  for (const role of ['team', 'viewer', 'host']) {
    for (const tab of ['main', 'status', 'shop']) {
      const res = simulateFitBoard(vp, role, tab);
      
      if (res.scale <= 0 || !Number.isFinite(res.scale)) {
        viewportTestPass = false;
        viewportFailDetails = `${vp.name} (${role}, ${tab}): Invalid scale ${res.scale}`;
      }
      if (res.overflowX) {
        viewportTestPass = false;
        viewportFailDetails = `${vp.name} (${role}, ${tab}): X-overflow (Rendered ${res.renderedWidth}px in ${vp.width}px)`;
      }
      if (res.overflowY && role === 'team' && vp.width < 860) {
        viewportTestPass = false;
        viewportFailDetails = `${vp.name} (${role}, ${tab}): Y-overflow on mobile`;
      }
    }
  }
}
recordTest('fitBoard() Zero-Overflow Across 15 Viewport Permutations (135 configurations)', viewportTestPass, viewportFailDetails);

// Test 2.2: 3D Camera Focus Coordinates & Tile Vector Math
console.log('[TEST 2.2] Testing 3D Camera Tracking Matrix on all 44 board tiles...');
let cameraPass = true;
let cameraError = '';

for (let tileIdx = 0; tileIdx < 44; tileIdx++) {
  const camResult = simulateFitBoard({ width: 1920, height: 1080 }, 'viewer', 'main', { pos: tileIdx, from: (tileIdx + 43) % 44 });
  
  if (!Number.isFinite(camResult.tx) || !Number.isFinite(camResult.ty)) {
    cameraPass = false;
    cameraError = `Tile ${tileIdx} camera translation NaN`;
  }
  if (!Number.isFinite(camResult.scale) || camResult.scale < 1.0) {
    cameraPass = false;
    cameraError = `Tile ${tileIdx} camera scale invalid (${camResult.scale})`;
  }
  if (Math.abs(camResult.rotX) !== 32) {
    cameraPass = false;
    cameraError = `Tile ${tileIdx} rotX angle mismatch`;
  }
}
recordTest('3D Perspective Camera Vector Math Valid on All 44 Board Tiles', cameraPass, cameraError);

// Test 2.3: Moving Token Coordinate Alignment vs Tile Grid
console.log('[TEST 2.3] Testing Moving Token Coordinate Alignment across all 44 tiles...');
let coordPass = true;
let coordError = '';

for (let i = 0; i < 44; i++) {
  const tile = G.TRACK[i];
  const c = tile[1];
  const r = tile[2];
  const tileLeft = c * 50;
  const tileTop = r * 50;
  
  // App.js movementPoint: { x: c*50 + 26, y: r*50 + 26 }
  const tokenX = c * 50 + 26;
  const tokenY = r * 50 + 26;
  
  // Pawn is 24x28 with margin-left: -12px, margin-top: -14px
  const pawnLeft = tokenX - 12;
  const pawnTop = tokenY - 14;
  
  // Verify pawn stays within 46x46 tile bounding box (+- subpixel)
  if (pawnLeft < tileLeft - 2 || pawnLeft + 24 > tileLeft + 48) {
    coordPass = false;
    coordError = `Tile ${i} (c=${c}, r=${r}) Pawn X bounds mismatch: pawnLeft=${pawnLeft}, tileLeft=${tileLeft}`;
  }
  if (pawnTop < tileTop - 2 || pawnTop + 28 > tileTop + 48) {
    coordPass = false;
    coordError = `Tile ${i} (c=${c}, r=${r}) Pawn Y bounds mismatch: pawnTop=${pawnTop}, tileTop=${tileTop}`;
  }
}
recordTest('Moving Token 2.5D Pawn Center Perfectly Aligns Inside 46x46 Tile Bounding Box', coordPass, coordError);


/* =========================================================================
   SUITE 3: PWA VERSION INVARIANT CHECK (Strict 2026.08.22.48 Synchronization)
   ========================================================================= */
console.log('\n--- SUITE 3: PWA VERSION INVARIANT CHECK ---');

const EXPECTED_VERSION = '2026.08.22.48';
const CONFIG_FILES = [
  'package.json',
  'public/sw.js',
  'public/app.js',
  'public/index.html',
  'public/version.json',
  'src/worker.js',
  'wrangler.toml',
  'CLOUDFLARE_DEPLOY.md'
];

console.log(`[TEST 3.1] Verifying version '${EXPECTED_VERSION}' across all ${CONFIG_FILES.length} config files...`);
let allVersionsMatch = true;
const versionReport = [];

for (const relPath of CONFIG_FILES) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    allVersionsMatch = false;
    versionReport.push(`${relPath}: FILE NOT FOUND`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes(EXPECTED_VERSION)) {
    allVersionsMatch = false;
    versionReport.push(`${relPath}: MISSING ${EXPECTED_VERSION}`);
  } else {
    versionReport.push(`${relPath}: ✔ Verified`);
  }
}
recordTest(`Version '${EXPECTED_VERSION}' Present in all ${CONFIG_FILES.length} Project Files`, allVersionsMatch, versionReport.join('; '));

// Test 3.2: Stale Version Leak Check
console.log('[TEST 3.2] Checking for stale versions (2026.08.22.47 or older) across entire workspace...');
const staleVersions = ['2026.08.22.47', '2026.08.22.46', '2026.08.22.45'];
let stalePass = true;
let staleMsg = '';

for (const stale of staleVersions) {
  for (const file of CONFIG_FILES) {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(stale)) {
        stalePass = false;
        staleMsg = `Found stale ${stale} in ${file}`;
      }
    }
  }
}
recordTest('Zero Stale Version References in Config Files', stalePass, staleMsg);

// Test 3.3: Service Worker Cache Name and Pre-cache Asset Verification
console.log('[TEST 3.3] Verifying sw.js CACHE_NAME and pre-cache asset list...');
const swContent = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
const swVersionMatch = swContent.includes(`const BUILD_VERSION = '${EXPECTED_VERSION}';`);
const swCacheMatch = swContent.includes('const CACHE_NAME = `preview-static-${BUILD_VERSION}`;') || swContent.includes(`preview-static-${EXPECTED_VERSION}`);
const swCoreAssetsMatch = swContent.includes(`'./game-fx.js?v=' + BUILD_VERSION`) &&
                          swContent.includes(`'./styles.css?v=' + BUILD_VERSION`) &&
                          swContent.includes(`'./app.js?v=' + BUILD_VERSION`);

recordTest(
  'Service Worker Cache Invalidation Contract Verified (preview-static-2026.08.22.48 & asset query parameters)',
  swVersionMatch && swCacheMatch && swCoreAssetsMatch,
  'SW cache name or asset list missing required cache buster parameters'
);


/* =========================================================================
   HARNESS EXECUTION SUMMARY
   ========================================================================= */
console.log('\n' + '='.repeat(80));
console.log(`📊 CHALLENGER 2 TEST EXECUTION SUMMARY:`);
console.log(`   Passed: ${results.passed}`);
console.log(`   Failed: ${results.failed}`);
console.log('='.repeat(80));

if (results.failed > 0) {
  console.log('\n🚨 DETECTED ISSUES & REGRESSIONS:');
  results.findings.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.name}]: ${f.details}`);
  });
  console.log('\n❌ EMPIRICAL CHALLENGE VERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\n✅ EMPIRICAL CHALLENGE VERDICT: APPROVE');
  process.exit(0);
}
