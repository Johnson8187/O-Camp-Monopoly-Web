import assert from 'node:assert/strict';
import worker, { GameRoom, teamActionError } from './src/worker.js';
import { G } from './src/game-core.js';

const state=(phase,paused=false)=>({phase,paused});

assert.equal(teamActionError(state('setup'),'roll'),'遊戲尚未開始');
assert.equal(teamActionError(state('ended'),'sell'),'活動已經結束');
assert.equal(teamActionError(state('shop',true),'gamble'),'活動目前已暫停');
assert.equal(teamActionError(state('shop'),'roll'),'目前階段不能執行這個操作');
assert.equal(teamActionError(state('roll'),'sell'),'目前階段不能執行這個操作');
assert.equal(teamActionError(state('sell'),'buyBack'),null);
assert.equal(teamActionError(state('shop'),'buff'),null);
assert.equal(teamActionError(state('roll'),'attack'),null);

const configurable=G.freshState('CONFIG',2);
const configRoom=new GameRoom({storage:{}},{});
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfig',{path:'attacks.quake.cost',value:9}),undefined);
assert.equal(configurable.settings.attacks.quake.cost,9);
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfig',{path:'attacks.unknown.cost',value:9}).error,'設定值超出允許範圍');
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfigs',{entries:[{path:'attacks.quake.cost',value:7},{path:'attacks.missile.cost',value:6}]}),undefined);
assert.equal(configurable.settings.attacks.quake.cost,7);
assert.equal(configurable.settings.attacks.missile.cost,6);

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

const lobbyState={teams:[{name:'紅隊',color:'#e23b3b',joined:true},{name:'藍隊',color:'#3f86e0',joined:false}]};
const lobbyResponse=await worker.fetch(new Request('https://example.test/api/lobby'),{
  DB:{prepare:()=>({all:async()=>({results:[{id:'GAME1',name:'測試活動',status:'lobby',team_count:2,updated_at:'2026-08-19T00:00:00.000Z',state_json:JSON.stringify(lobbyState)}]})})},
});
const lobby=await lobbyResponse.json();
assert.deepEqual(lobby.games[0].teams,[
  {id:0,name:'紅隊',color:'#e23b3b',joined:true},
  {id:1,name:'藍隊',color:'#3f86e0',joined:false},
]);
assert.equal(lobby.games[0].joinedCount,1);

const passwordHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('iii'))).toString('hex');
const room=new GameRoom({blockConcurrencyWhile:fn=>fn(),storage:{}},{TEAM_PASSWORD_HASH:passwordHash});
room.loaded=true;
room.lastActivityAt=0;
room.meta={id:'GAME1',name:'測試活動',teamCount:2,hostTokenHash:'unused'};
room.state={phase:'setup',paused:false,teams:[{name:'紅隊',joined:true},{name:'藍隊',joined:false}]};
function pendingSocket(){
  let attachment={role:'pending',teamId:null};
  return {sent:[],closed:false,send(data){this.sent.push(JSON.parse(data));},close(){this.closed=true;},deserializeAttachment(){return attachment;},serializeAttachment(value){attachment=value;}};
}
const wrongSocket=pendingSocket();
await room.webSocketMessage(wrongSocket,JSON.stringify({type:'hello',role:'team',teamId:0,accessToken:'wrong',token:'not-needed'}));
assert.equal(wrongSocket.closed,true);
const teamSocket=pendingSocket();
await room.webSocketMessage(teamSocket,JSON.stringify({type:'hello',role:'team',teamId:0,accessToken:'iii'}));
assert.equal(teamSocket.closed,false);
assert.equal(teamSocket.sent.at(-1).type,'hello_ok');

console.log('reliability phase-guard, team-picker and control-header tests passed');
