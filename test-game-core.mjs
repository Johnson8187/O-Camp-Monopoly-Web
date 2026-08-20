import { G } from './public/game-core.js';

const state = G.freshState('smoke-test', 7);
if (state.teams.length !== 7) throw new Error('隊伍數量未正確建立');
if (state.teams.some(t => t.baseIdx !== null)) throw new Error('初始基地狀態錯誤');
G.assignBases(state);
if (state.teams.some(t => t.baseIdx === null)) throw new Error('基地分配失敗');
state.phase = 'market';
G.nextPhase(state);
if (!['sell','shop','roll'].includes(state.phase)) throw new Error(`階段切換結果錯誤：${state.phase}`);

const assets = G.freshState('assets-test', 2);
G.assignBases(assets,()=>0);
const firstTeam = assets.teams[0];
if (G.propertyValue(assets,firstTeam) !== G.sellValue(assets,firstTeam)) throw new Error('房產價值拆分錯誤');
if (G.netWorth(assets,firstTeam) !== firstTeam.cash + G.propertyValue(assets,firstTeam)) throw new Error('總資產計算錯誤');

const attacks = G.freshState('attack-limit-test', 3);
G.assignBases(attacks,()=>0);
attacks.phase = 'roll';
attacks.teams[0].pts = 100;
const firstAttack = G.playAttack(attacks,0,'quake',()=>0);
if (!firstAttack.ok) throw new Error(`首次特殊操作失敗：${firstAttack.msg}`);
const pointsAfterFirst = attacks.teams[0].pts;
const repeatedAttack = G.playAttack(attacks,0,'quake',()=>0);
if (repeatedAttack.ok || !/本回合已使用過/.test(repeatedAttack.msg)) throw new Error('未限制同一回合重複使用同一特殊操作');
if (attacks.teams[0].pts !== pointsAfterFirst) throw new Error('被拒絕的重複特殊操作不應扣點');
if (!G.playAttack(attacks,0,'wildfire',()=>0).ok) throw new Error('同回合應允許使用不同特殊操作');
attacks.round += 1;
if (!G.playAttack(attacks,0,'quake',()=>0).ok) throw new Error('下一回合應重置特殊操作額度');
console.log('game-core smoke test passed');
