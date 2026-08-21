import assert from 'node:assert/strict';
import { PHASE_FX, ATTACK_FX, SoundFX, isSoundEnabled, toggleSound, classifyEvent, movementPath } from './public/game-fx.js';

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
assert.equal(typeof isSoundEnabled, 'function');

assert.equal(typeof toggleSound, 'function');

assert.equal(PHASE_FX.roll.title,'開始移動');
assert.equal(ATTACK_FX.typhoon.title,'超級颱風');
assert.equal(ATTACK_FX.quake.title,'地裂震央');
assert.equal(classifyEvent('紅隊 發動「飛彈」'),'danger');
assert.equal(classifyEvent('藍隊 停在稅收格，扣 $200'),'loss');
assert.equal(classifyEvent('黃隊 基地升級為「商店」'),'reward');
assert.equal(classifyEvent('股市公布：熱絡'),'phase');
assert.deepEqual(movementPath(42,4,2,44),[43,0,1,2]);
assert.deepEqual(movementPath(5,2,20,44),[6,7,20]);
assert.deepEqual(movementPath(5,0,5,44),[]);

console.log('game atmosphere helper and SoundFX tests passed');

