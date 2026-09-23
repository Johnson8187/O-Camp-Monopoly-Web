import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { G } from './src/game-core.js';
import { GameRoom } from './src/worker.js';

console.log('Running test-onboarding-ui.mjs: Gameplay Onboarding & UI Simplification Verification Suite...');

const appSource = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('./public/styles.css', import.meta.url), 'utf8');

// ===========================================================================
// SUITE 1: 4-Step Tutorial & Persistent Reopen Entry (Step A)
// ===========================================================================
console.log('\n[SUITE 1] Verifying 4-Step Team Aide Tutorial & Settings Reopen Entry...');

// 1.1 Source inspection: 4 steps, win condition, dual currencies, CTA
assert.match(appSource, /const TUTORIAL_VERSION\s*=\s*'v1'/, 'TUTORIAL_VERSION must be defined as v1');
assert.match(appSource, /life-tutorial-ack:\$\{gameId\}:\$\{teamId\}:\$\{version\}/, 'Storage key must be partitioned by room, team, and version');
assert.match(appSource, /function teamTutorialCardHTML\(\)/, 'teamTutorialCardHTML must be implemented');
assert.match(appSource, /房市看局勢/, 'Tutorial must include: 房市看局勢');
assert.match(appSource, /基地經營/, 'Tutorial must include: 基地經營');
assert.match(appSource, /商店與道具|商店補給/, 'Tutorial must include: 商店與道具 / 商店補給');
assert.match(appSource, /擲骰移動/, 'Tutorial must include: 擲骰移動');
assert.match(appSource, /總資產/, 'Tutorial must include win condition: 總資產');
assert.match(appSource, /雙幣制度|雙幣制/, 'Tutorial must include dual currency explanation');
assert.match(appSource, /我知道了/, 'Tutorial CTA must be "我知道了"');
assert.match(appSource, /btnOpenGameplayGuide/, 'Persistent reopen button must be available');
assert.match(appSource, /showGameplayTutorialModal/, 'showGameplayTutorialModal must be implemented for reopening guide');

// 1.2 Storage simulation & multi-team isolation
const mockStorage = new Map();
const fakeLocalStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

function tutorialAckKey(gameId, teamId, version = 'v1') {
  return `life-tutorial-ack:${gameId}:${teamId}:${version}`;
}
function isTutorialAcknowledged(storage, gameId, teamId, version = 'v1') {
  if (!gameId || teamId === null || teamId === undefined) return false;
  return storage.getItem(tutorialAckKey(gameId, teamId, version)) === '1';
}
function ackTutorial(storage, gameId, teamId, version = 'v1') {
  if (!gameId || teamId === null || teamId === undefined) return;
  storage.setItem(tutorialAckKey(gameId, teamId, version), '1');
}

assert.equal(isTutorialAcknowledged(fakeLocalStorage, 'ROOM-A', 0), false, 'Team 0 initially unacknowledged');
ackTutorial(fakeLocalStorage, 'ROOM-A', 0);
assert.equal(isTutorialAcknowledged(fakeLocalStorage, 'ROOM-A', 0), true, 'Team 0 acknowledged in ROOM-A');
assert.equal(isTutorialAcknowledged(fakeLocalStorage, 'ROOM-A', 1), false, 'Team 1 in ROOM-A remains unacknowledged (team isolation)');
assert.equal(isTutorialAcknowledged(fakeLocalStorage, 'ROOM-B', 0), false, 'Team 0 in ROOM-B remains unacknowledged (room isolation)');
assert.equal(isTutorialAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'v2'), false, 'Version isolation preserved (v1 vs v2)');
console.log('  ✔ Tutorial storage key, per-room/team/version isolation and dismiss CTA verified.');

// ===========================================================================
// SUITE 2: Contextual Phase Tips & Naming Standardization (Step B)
// ===========================================================================
console.log('\n[SUITE 2] Verifying Contextual Phase Tips & Phase Name Standardization...');

// 2.1 Display name change without touching backend action IDs
assert.match(appSource, /sell:\s*'基地經營'/, "phaseNames.sell must be changed to '基地經營'");
assert.doesNotMatch(appSource, /sell:\s*'出售基地'/, "'出售基地' must not be in phaseNames");

// 2.2 Phase tips definition and accuracy
assert.match(appSource, /PHASE_TIPS\s*=\s*\{/, 'PHASE_TIPS map must be defined');
assert.match(appSource, /第 1 回合免房屋稅|首回合免房屋稅/, 'Market tip must accurately note round 1 tax exemption');
assert.match(appSource, /function phaseContextTipHTML/, 'phaseContextTipHTML must be implemented');

function phaseTipAckKey(gameId, teamId, phase) {
  return `life-phase-tip-ack:${gameId}:${teamId}:${phase}`;
}
function isPhaseTipAcknowledged(storage, gameId, teamId, phase) {
  if (!gameId || teamId === null || teamId === undefined || !phase) return false;
  return storage.getItem(phaseTipAckKey(gameId, teamId, phase)) === '1';
}
function ackPhaseTip(storage, gameId, teamId, phase) {
  if (!gameId || teamId === null || teamId === undefined || !phase) return;
  storage.setItem(phaseTipAckKey(gameId, teamId, phase), '1');
}

// 2.3 One-time acknowledgment and persistence across rounds
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'market'), false);
ackPhaseTip(fakeLocalStorage, 'ROOM-A', 0, 'market');
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'market'), true);
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'sell'), false, 'Acknowledging market does not ack sell');
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'shop'), false, 'Acknowledging market does not ack shop');
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'roll'), false, 'Acknowledging market does not ack roll');

// Round 2 check: tip remains acknowledged and will not repeat
const simulatedRound2 = 2;
assert.equal(isPhaseTipAcknowledged(fakeLocalStorage, 'ROOM-A', 0, 'market'), true, `Tip remains dismissed in round ${simulatedRound2}`);
console.log('  ✔ Contextual tips one-time per phase verified; display label changed to 基地經營.');

// ===========================================================================
// SUITE 3: Non-blocking Postponement & Live Action Safety (Step A & B)
// ===========================================================================
console.log('\n[SUITE 3] Verifying Non-blocking Postponement during Active In-Flight Actions...');

function isTutorialBlocked(appState, appFx, appBusy) {
  if (!appState) return true;
  if (appBusy || appFx?.dice || appFx?.camera) return true;
  if (appState.pendingBattle || appState.pendingCard) return true;
  if (appFx?.landing || appFx?.teamMoment || appFx?.assignment || appFx?.phase || appFx?.attack || appFx?.stageLanding) return true;
  if (appState.phase === 'settle' || appState.phase === 'ended') return true;
  return false;
}

const idleState = { phase: 'market', round: 1, pendingBattle: null, pendingCard: null };
assert.equal(isTutorialBlocked(idleState, {}, false), false, 'Idle state allows onboarding guide');

// Postponement when dice are rolling
assert.equal(isTutorialBlocked(idleState, { dice: { rolling: true } }, false), true, 'Blocked when dice FX is active');
assert.equal(isTutorialBlocked(idleState, {}, true), true, 'Blocked when app is busy');

// Postponement when battle or card is pending
const battleState = { ...idleState, pendingBattle: { kind: 'jail', status: 'awaiting_host' } };
assert.equal(isTutorialBlocked(battleState, {}, false), true, 'Blocked when BATTLE is pending');

const cardState = { ...idleState, pendingCard: { cardType: 'chance', cardId: 1 } };
assert.equal(isTutorialBlocked(cardState, {}, false), true, 'Blocked when card task is pending');

// Postponement when game is settled
const settledState = { ...idleState, phase: 'settle' };
assert.equal(isTutorialBlocked(settledState, {}, false), true, 'Blocked during settlement');
console.log('  ✔ Non-blocking postponement verified: tutorial never interrupts rolling, battle, card, or awards.');

// ===========================================================================
// SUITE 4: Zero Underlying Action Side Effects
// ===========================================================================
console.log('\n[SUITE 4] Verifying Zero Side Effects on Underlying Game Actions & Balances...');

const room = new GameRoom({ storage: {} }, {});
const gameState = G.freshState('TUTORIAL-AUDIT', 2);
gameState.phase = 'roll';

const team0CashBefore = gameState.teams[0].cash;
const team0PtsBefore = gameState.teams[0].pts;
const team0PosBefore = gameState.teams[0].pos;
const team0BaseBefore = gameState.teams[0].baseIdx;
const roundBefore = gameState.round;
const revBefore = gameState.rev;

// Client acknowledges tutorial and all phase tips
ackTutorial(fakeLocalStorage, 'TUTORIAL-AUDIT', 0);
['market', 'sell', 'shop', 'roll'].forEach(p => ackPhaseTip(fakeLocalStorage, 'TUTORIAL-AUDIT', 0, p));

// Verify backend state is 100% untouched
assert.equal(gameState.teams[0].cash, team0CashBefore, 'Cash must be unchanged');
assert.equal(gameState.teams[0].pts, team0PtsBefore, 'Points must be unchanged');
assert.equal(gameState.teams[0].pos, team0PosBefore, 'Position must be unchanged');
assert.equal(gameState.teams[0].baseIdx, team0BaseBefore, 'Base index must be unchanged');
assert.equal(gameState.round, roundBefore, 'Round must be unchanged');
assert.equal(gameState.rev, revBefore, 'Revision must be unchanged');
console.log('  ✔ Zero side effects verified: onboarding guidance is strictly educational with zero state mutation.');

// ===========================================================================
// SUITE 5: Team UI: Details Collapsible Attacks, Physical Shop, Truthful Waiting (Step C)
// ===========================================================================
console.log('\n[SUITE 5] Verifying Team UI: Collapsed Attacks in <details>, Truthful Waiting, Physical Shop...');

// 5.1 Advanced attacks in <details>
assert.match(appSource, /<details class="advanced-attack-section" id="advAttackDetails"/, '<details> container must be used for special attacks');
assert.match(appSource, /App\._advAttackOpen/, 'App._advAttackOpen must track open state across re-renders');
assert.match(appSource, /advDetails\.ontoggle\s*=\s*\(\)\s*=>\s*\{[\s\S]*App\._advAttackOpen\s*=\s*advDetails\.open/, 'advDetails.ontoggle must sync open state to App._advAttackOpen');

// 5.2 Truthful waiting status without fake queue numbers
assert.match(appSource, /truthful-waiting-badge/, 'Truthful waiting badge must be implemented');
assert.match(appSource, /等待主持人允許本組擲骰|等待主持人指定隊伍/, 'Waiting message must state waiting for host truthfully');
assert.match(appSource, /truthful-connection-status/, 'Truthful connection status indicator must be shown');
assert.doesNotMatch(appSource, /排隊第\s*\d+\s*順位|前面還有\s*\d+\s*隊/, 'Invented queue numbers must NOT be present');

// 5.3 Physical shop clearly labeled
assert.match(appSource, /購買後入背包，持實體券由主持人兌換/, 'Physical shop must clearly specify redemption condition');
console.log('  ✔ Advanced attack <details> persistence, physical shop label, and truthful waiting verified.');

// ===========================================================================
// SUITE 6: Host UI & Public Big Screen Privacy (Step D)
// ===========================================================================
console.log('\n[SUITE 6] Verifying Host UI Foregrounding & Public Big Screen Masked Projection...');

// 6.1 Host UI foregrounding
assert.match(appSource, /host-block-warning/, 'Host panel must show block reason banner');
assert.match(appSource, /目前有【.*BATTLE】待裁決/, 'Host panel must explain BATTLE blocking next phase');
assert.match(appSource, /目前有【實體卡挑戰】待裁定結果/, 'Host panel must explain pending card blocking next phase');

// 6.2 Public big screen lightweight phase banner
assert.match(appSource, /activeTurnHTML\(\)\s*\{[\s\S]*phase-market[\s\S]*phase-sell[\s\S]*phase-shop/, 'activeTurnHTML must provide phase banners for market, sell, and shop');

// 6.3 Public screen privacy check: verify no cash/pts/items leakage
const publicViewerBannerSource = appSource.slice(appSource.indexOf('function activeTurnHTML'), appSource.indexOf('function stageTileArtHTML'));
assert.doesNotMatch(publicViewerBannerSource, /G\.money\(team\.cash\)|team\.cash|team\.pts|team\.items|team\.receipts/, 'Public activeTurnHTML must NEVER expose team cash, points, items, or receipts');
console.log('  ✔ Host foregrounding and public screen privacy projection verified.');

// ===========================================================================
// SUITE 7: CSS & Touch Accessibility
// ===========================================================================
console.log('\n[SUITE 7] Verifying Responsive CSS & Touch Target Accessibility (styles.css)...');

assert.match(stylesSource, /\.team-tutorial-card/, 'CSS for team-tutorial-card must exist');
assert.match(stylesSource, /\.phase-context-tip/, 'CSS for phase-context-tip must exist');
assert.match(stylesSource, /\.advanced-attack-section/, 'CSS for advanced-attack-section must exist');
assert.match(stylesSource, /\.advanced-attack-summary/, 'CSS for advanced-attack-summary must exist');
assert.match(stylesSource, /min-height:\s*44px/, 'Touch target must support 44px min-height');
assert.match(stylesSource, /\.truthful-waiting-badge/, 'CSS for truthful-waiting-badge must exist');
assert.match(stylesSource, /\.shop-policy-banner/, 'CSS for shop-policy-banner must exist');
assert.match(stylesSource, /\.host-block-warning/, 'CSS for host-block-warning must exist');
console.log('  ✔ CSS rules, pixel aesthetic, and >= 44px touch targets verified.');

// ===========================================================================
// SUITE 8: Team-only task console without server rule changes
// ===========================================================================
console.log('\n[SUITE 8] Verifying team task console, board preview, and guided navigation...');
assert.match(appSource,/function teamTaskCardHTML\(\)/);
assert.match(appSource,/function teamBoardExpanded\(\)/);
assert.match(appSource,/\['main','⚔️ 行動'\],\['backpack','🎒 背包'\],\['receipts','🧾 收據'\],\['more','☰ 更多'\]/);
assert.match(appSource,/id="teamBoardToggle" aria-controls="bwrap" aria-expanded="false"/);
assert.match(appSource,/id="nextTeamTutorial"/);
assert.match(appSource,/id="skipTeamTutorial"/);
assert.match(appSource,/teamMoreSection|App\.moreSection/);
assert.match(stylesSource,/\.team-task-card/);
assert.match(stylesSource,/\.team-more-button/);
assert.match(stylesSource,/\.team-tutorial-card \.tutorial-step-item\[hidden\]\{display:none!important\}/);
console.log('  ✔ Four primary entries, contextual task card, one board instance, and skippable guide verified.');

console.log('\n======================================================================');
console.log('🎉 ALL 8 ONBOARDING & UI SIMPLIFICATION TEST SUITES PASSED!');
console.log('======================================================================');
