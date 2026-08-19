import { G } from './public/game-core.js';

const state = G.freshState('smoke-test', 7);
if (state.teams.length !== 7) throw new Error('隊伍數量未正確建立');
if (state.teams.some(t => t.baseIdx !== null)) throw new Error('初始基地狀態錯誤');
G.assignBases(state);
if (state.teams.some(t => t.baseIdx === null)) throw new Error('基地分配失敗');
state.phase = 'market';
G.nextPhase(state);
if (!['sell','shop','roll'].includes(state.phase)) throw new Error(`階段切換結果錯誤：${state.phase}`);
console.log('game-core smoke test passed');
