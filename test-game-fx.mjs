import assert from 'node:assert/strict';
import { PHASE_FX, ATTACK_FX, SoundFX, isSoundEnabled, toggleSound, classifyEvent, movementPath, presentationTier, isPresentationTaskRelevant, isPurchaseReceipt, PAWN_ARCHETYPES, pawnSpriteSVG, renderPawnSprite, renderTileGarrison, pawnFacingForStep, battlePresentationTransition } from './public/game-fx.js';

assert.equal(typeof SoundFX, 'object');
assert.equal(typeof SoundFX.isSoundEnabled, 'function');
assert.equal(typeof SoundFX.toggleSound, 'function');
assert.equal(typeof SoundFX.playStepHop, 'function');
assert.equal(typeof SoundFX.playLanding, 'function');
assert.equal(typeof SoundFX.playDiceTumble, 'function');
assert.equal(typeof SoundFX.playDiceResult, 'function');
assert.equal(typeof SoundFX.playAttackAlert, 'function');
assert.equal(typeof SoundFX.playPhaseChange, 'function');
assert.equal(typeof SoundFX.playAttackHit, 'function');
assert.equal(typeof SoundFX.playCoinReward, 'function');
assert.equal(typeof SoundFX.playUpgrade, 'function');
assert.equal(typeof SoundFX.playSell, 'function');
assert.equal(typeof SoundFX.unlockAudio, 'function');
assert.equal(typeof SoundFX.playFestivalIntro, 'function');
assert.equal(typeof SoundFX.playPayment, 'function');
assert.equal(typeof SoundFX.playShield, 'function');
assert.equal(typeof SoundFX.playRankUp, 'function');
assert.equal(typeof isSoundEnabled, 'function');

assert.equal(typeof toggleSound, 'function');

assert.equal(PHASE_FX.roll.title,'踏上人生道路');
assert.equal(ATTACK_FX.typhoon.title,'超級颱風');
assert.equal(ATTACK_FX.quake.title,'地裂震央');
assert.equal(classifyEvent('紅隊 發動「飛彈」'),'danger');
assert.equal(classifyEvent('藍隊 停在稅收格，扣 $200'),'loss');
assert.equal(classifyEvent('黃隊 基地升級為「商店」'),'reward');
assert.equal(classifyEvent('股市公布：熱絡'),'phase');
assert.equal(presentationTier({role:'viewer',width:1920,hardwareConcurrency:8,deviceMemory:8}),'cinematic');
assert.equal(presentationTier({role:'team',width:800,hardwareConcurrency:8,deviceMemory:8}),'party');
assert.equal(presentationTier({role:'team',width:390,hardwareConcurrency:2,deviceMemory:2}),'lite');
assert.equal(presentationTier({role:'viewer',width:1920,reducedMotion:true}),'reduced');
const audienceState={teams:[{id:0,pos:5},{id:1,pos:9}]};
assert.equal(isPresentationTaskRelevant({type:'roll',teamId:0},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'roll',teamId:1},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'attack',attack:{team:1,hit:[5]}},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'attack',attack:{team:1,hit:[9]}},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'teamMoment',teamId:0},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'teamMoment',teamId:1},{role:'team',teamId:0,state:audienceState}),false);
assert.equal(isPresentationTaskRelevant({type:'battlePrompt',battle:{attackerId:0}},{role:'team',teamId:0,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'battlePrompt',battle:{attackerId:1}},{role:'team',teamId:0,state:audienceState}),false);
assert.equal(isPresentationTaskRelevant({type:'battleDuel',battle:{attackerId:0,defenderId:1}},{role:'team',teamId:9,state:audienceState}),true);
assert.equal(isPresentationTaskRelevant({type:'battleResult',battle:{attackerId:0,defenderId:1}},{role:'team',teamId:9,state:audienceState}),true);
assert.equal(isPurchaseReceipt({teamId:0,action:'buff',ptsDelta:-5},{team:0,cost:5}),true);
assert.equal(isPurchaseReceipt({teamId:0,action:'gamble',ptsDelta:-3},{team:0,cost:3}),true);
assert.equal(isPurchaseReceipt({teamId:0,action:'roll',ptsDelta:-5},{team:0,cost:5}),false);
assert.equal(isPurchaseReceipt({teamId:1,action:'buff',ptsDelta:-5},{team:0,cost:5}),false);
assert.deepEqual(movementPath(42,4,2,44),[43,0,1,2]);
assert.deepEqual(movementPath(5,2,20,44),[6,7,20]);
assert.deepEqual(movementPath(5,0,5,44),[]);
assert.equal(pawnFacingForStep(['base',1,1],['base',2,1]),'right');
assert.equal(pawnFacingForStep(['base',2,1],['base',1,1]),'left');
assert.equal(pawnFacingForStep(['base',1,1],['base',1,0]),'back');
assert.equal(pawnFacingForStep(['base',1,0],['base',1,1]),'front');
assert.equal(pawnFacingForStep(null,null,'left'),'left');

const battleWaiting={pendingBattle:{attackerId:0,defenderId:1,amount:800,tileIndex:5,round:2,status:'awaiting_choice'},log:[]};
const battleFighting={pendingBattle:{...battleWaiting.pendingBattle,status:'awaiting_host'},log:['紅隊 發動 BATTLE 挑戰 藍隊，等待主持人裁決']};
assert.deepEqual(battlePresentationTransition(battleWaiting,battleFighting),{type:'battleDuel',battle:battleFighting.pendingBattle});
const attackerWin={pendingBattle:null,log:['BATTLE 裁決：紅隊 獲勝，免付 $800 過夜費']};
const defenderWin={pendingBattle:null,log:['BATTLE 裁決：藍隊 守住基地，紅隊 支付 $800']};
assert.deepEqual(battlePresentationTransition(battleFighting,attackerWin),{type:'battleResult',battle:battleFighting.pendingBattle,outcome:'attacker',message:attackerWin.log[0]});
assert.deepEqual(battlePresentationTransition(battleFighting,defenderWin),{type:'battleResult',battle:battleFighting.pendingBattle,outcome:'defender',message:defenderWin.log[0]});

// 2.5D Pixel Pawn Archetypes & SVG Sprites Verification (R1, R2, R3)
assert.equal(PAWN_ARCHETYPES.length, 10);
assert.equal(PAWN_ARCHETYPES[0].name, 'Warrior');
assert.equal(PAWN_ARCHETYPES[1].name, 'Mage');
assert.equal(PAWN_ARCHETYPES[2].name, 'Ranger');
assert.equal(PAWN_ARCHETYPES[3].name, 'Bard');
assert.equal(PAWN_ARCHETYPES[4].name, 'Warlock');
assert.equal(PAWN_ARCHETYPES[5].name, 'Engineer');
assert.equal(PAWN_ARCHETYPES[6].name, 'Ninja');
assert.equal(PAWN_ARCHETYPES[7].name, 'Priestess');
assert.equal(PAWN_ARCHETYPES[8].name, 'Paladin');
assert.equal(PAWN_ARCHETYPES[9].name, 'Explorer');

// Pure vector SVGs without external image files
for (let tid = 0; tid < 10; tid++) {
  const svg = pawnSpriteSVG(tid);
  assert.ok(svg.includes('<svg'), `Team ${tid} sprite must be valid inline SVG`);
  assert.ok(svg.includes('shape-rendering="crispEdges"'), `Team ${tid} sprite must use crispEdges pixel rendering`);
  assert.ok(!svg.includes('<image'), `Team ${tid} sprite must not use external raster image tags`);
}

// Status accessories rendering
const normalPawn = renderPawnSprite(0, {});
assert.ok(normalPawn.includes('pixel-pawn-wrapper team-0'));
assert.ok(normalPawn.includes('pawn-badge'));
assert.ok(!normalPawn.includes('pawn-crown'));
assert.ok(!normalPawn.includes('pawn-jail-overlay'));
assert.ok(!normalPawn.includes('pawn-shield-orbit'));

const leaderJailedShieldedPawn = renderPawnSprite(3, { isMe: true, isLeader: true, isJailed: true, isShielded: true });
assert.ok(leaderJailedShieldedPawn.includes('is-me'));
assert.ok(leaderJailedShieldedPawn.includes('is-leader'));
assert.ok(leaderJailedShieldedPawn.includes('pawn-crown'));
assert.ok(leaderJailedShieldedPawn.includes('pawn-jail-overlay'));
assert.ok(leaderJailedShieldedPawn.includes('pawn-shield-orbit'));

const walkingPawn = renderPawnSprite(6, {}, { isMoving: true, pose: 'walk', direction: 'left', frame: 1 });
assert.ok(walkingPawn.includes('pawn-facing-left'));
assert.ok(walkingPawn.includes('pawn-pose-walk'));
assert.ok(walkingPawn.includes('pawn-frame-1'));
assert.ok(walkingPawn.includes('pawn-motion-pixels'));
assert.ok(pawnSpriteSVG(6,{pose:'walk',direction:'left',frame:1}).includes('pawn-svg-left'));

// Garrison Stacking Verification (1 team, 2-3 teams, 4+ teams)
const emptyGarrison = renderTileGarrison([]);
assert.equal(emptyGarrison, '');

const singleGarrison = renderTileGarrison([{ id: 0, pos: 5, color: '#e23b3b' }], { meId: 0 });
assert.ok(singleGarrison.includes('garrison-single'));
assert.ok(singleGarrison.includes('hero-pawn'));

const trioGarrison = renderTileGarrison([
  { id: 0, pos: 5, color: '#e23b3b' },
  { id: 1, pos: 5, color: '#3f86e0' },
  { id: 2, pos: 5, color: '#3fbf5a' }
], { meId: 1 });
assert.ok(trioGarrison.includes('garrison-stair garrison-3'));
assert.ok(trioGarrison.includes('stair-step-3-of-3'));

const crowdedGarrison = renderTileGarrison([
  { id: 0, pos: 31, color: '#e23b3b' },
  { id: 1, pos: 31, color: '#3f86e0' },
  { id: 2, pos: 31, color: '#3fbf5a' },
  { id: 3, pos: 31, color: '#f2c12e' },
  { id: 4, pos: 31, color: '#9450d8' }
], { meId: 3 });
assert.ok(crowdedGarrison.includes('garrison-cluster'));
assert.ok(crowdedGarrison.includes('pawn-cluster-pill'));
assert.ok(crowdedGarrison.includes('+4'));
// Null/undefined guard unit tests (Spectator / Host perspective)
const spectatorSingleT0 = renderTileGarrison([{ id: 0, pos: 5, color: '#e23b3b' }], { meId: null, leaderId: null });
assert.ok(!spectatorSingleT0.includes('is-me'), 'Spectator single garrison team 0 must not have is-me');
assert.ok(!spectatorSingleT0.includes('is-leader') && !spectatorSingleT0.includes('pawn-crown'), 'Spectator single garrison team 0 must not have is-leader or crown');

const spectatorCluster = renderTileGarrison([
  { id: 0, pos: 31, color: '#e23b3b' },
  { id: 1, pos: 31, color: '#3f86e0' },
  { id: 2, pos: 31, color: '#3fbf5a' },
  { id: 3, pos: 31, color: '#f2c12e' }
], { meId: null, activeTeamId: 3, leaderId: null });
assert.ok(spectatorCluster.includes('cluster-lead'), 'Spectator cluster must have a cluster-lead');
assert.ok(spectatorCluster.includes('data-team="3"'), 'Spectator cluster must prioritize active team 3 as cluster lead');

console.log('game atmosphere helper, SoundFX, and 2.5D pixel pawn sprite tests passed');
