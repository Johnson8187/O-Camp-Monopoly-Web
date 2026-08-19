import assert from 'node:assert/strict';
import worker, { teamActionError } from './src/worker.js';

const state=(phase,paused=false)=>({phase,paused});

assert.equal(teamActionError(state('setup'),'roll'),'遊戲尚未開始');
assert.equal(teamActionError(state('ended'),'sell'),'活動已經結束');
assert.equal(teamActionError(state('shop',true),'gamble'),'活動目前已暫停');
assert.equal(teamActionError(state('shop'),'roll'),'目前階段不能執行這個操作');
assert.equal(teamActionError(state('roll'),'sell'),'目前階段不能執行這個操作');
assert.equal(teamActionError(state('sell'),'buyBack'),null);
assert.equal(teamActionError(state('shop'),'buff'),null);
assert.equal(teamActionError(state('roll'),'attack'),null);

let proxiedRequest;
const response=await worker.fetch(new Request('https://example.test/ws/ROOM123',{headers:{'x-control-action':'endGame'}}),{
  GAME_ROOMS:{
    idFromName:name=>name,
    get:()=>({fetch:request=>{proxiedRequest=request;return new Response(null,{status:426});}}),
  },
});
assert.equal(response.status,426);
assert.equal(proxiedRequest.headers.get('x-control-action'),null);
assert.equal(proxiedRequest.headers.get('x-game-id'),'ROOM123');

console.log('reliability phase-guard and control-header tests passed');
