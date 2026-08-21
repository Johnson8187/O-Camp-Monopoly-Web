import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { GameRoom, normalizeGameState, teamActionError } from './src/worker.js';
import { G } from './src/game-core.js';

const appSource=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const stylesSource=await readFile(new URL('./public/styles.css',import.meta.url),'utf8');
assert.match(appSource,/viewer-dashboard/);
assert.match(appSource,/team-command-hud/);
assert.match(appSource,/host-console-nav/);
assert.match(appSource,/life-square/);
assert.match(appSource,/teamMomentFxHTML/);
assert.match(appSource,/isPresentationTaskRelevant/);
assert.match(appSource,/isPurchaseReceipt/);
assert.match(appSource,/teamLifeMoments\.forEach\(enqueueFx\)/);
assert.ok(appSource.indexOf("enqueueFx({type:'roll'")<appSource.indexOf('teamLifeMoments.forEach(enqueueFx)'));
assert.match(appSource,/nav\.hidden=inGame\|\|isDev\|\|lifeHome/);
assert.match(stylesSource,/life-festival-plaza-v1\.png/);
assert.match(appSource,/bSkipFx/);
assert.match(appSource,/teamPreview\?0\.28:0\.46/);
assert.match(appSource,/team-tab-\$\{App\.tab\}/);
assert.match(stylesSource,/\.team-persistent-layout \.game-primary\{position:sticky;z-index:34;top:4px;order:0/);
assert.match(stylesSource,/\.team-persistent-layout \.team-tab-panel\{order:1\}/);
assert.match(stylesSource,/\.life-title-banner/);
assert.match(stylesSource,/\.team-moment-card/);
assert.doesNotMatch(appSource,/bProjector/);

const state=(phase,paused=false)=>({phase,paused});

assert.equal(teamActionError(state('setup'),'roll'),'遊戲尚未開始');
assert.equal(teamActionError(state('ended'),'sell'),'活動已經結束');
assert.equal(teamActionError(state('shop',true),'gamble'),'活動目前已暫停');
assert.equal(teamActionError(state('shop'),'roll'),'目前階段不能執行這個操作');
assert.equal(teamActionError(state('settle'),'roll'),'目前階段不能執行這個操作');
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
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfigs',{entries:[{path:'diceCount',value:3},{path:'attacks.quake.repair',value:888},{path:'buffs.shield.cost',value:12}]}),undefined);
assert.equal(configurable.settings.diceCount,3);
assert.equal(configurable.settings.attacks.quake.repair,888);
assert.equal(configurable.settings.buffs.shield.cost,12);
configurable.phase='roll';
configurable.round=1;
configurable.teams[0].pts=100;
assert.equal(configRoom.applyAction(configurable,{role:'team',teamId:0},'attack',{kind:'quake'}),undefined);
const pointsAfterAttack=configurable.teams[0].pts;
assert.match(configRoom.applyAction(configurable,{role:'team',teamId:0},'attack',{kind:'quake'}).error,/本回合已使用過/);
assert.equal(configurable.teams[0].pts,pointsAfterAttack);
assert.equal(configurable.log.filter(message=>message.includes('發動「地震」')).length,1);

const legacyInventory=G.freshState('LEGACY-INVENTORY',2);
delete legacyInventory.teams[0].items;
legacyInventory.log.unshift(`${legacyInventory.teams[0].name} 買了「${legacyInventory.settings.gambles[0].name}」（扣 5 點，獎項由關主現場發放）`);
legacyInventory.log.unshift(`${legacyInventory.teams[0].name} 買了「${legacyInventory.settings.gambles[0].name}」（扣 5 點，獎項由關主現場發放）`);
normalizeGameState(legacyInventory);
assert.equal(legacyInventory.teams[0].items.g0,2);

const settleState = G.freshState('SETTLE', 2);
settleState.phase = 'roll';
settleState.teams[0].cash = 5000;
settleState.teams[1].cash = 8000;
const settleRoom = new GameRoom({storage:{}},{});
assert.equal(settleRoom.applyAction(settleState, {role:'host', teamId:null}, 'settleGame'), undefined);
assert.equal(settleState.phase, 'settle');
const ranked = G.rankTeams(settleState);
assert.equal(ranked[0].id, 1);
assert.equal(settleRoom.applyAction(settleState, {role:'host', teamId:null}, 'resumeGame'), undefined);
assert.equal(settleState.phase, 'roll');

const rollPermissionState = G.freshState('ROLL-PERMISSION', 2);
rollPermissionState.phase = 'roll';
rollPermissionState.settings.diceCount = 3;
assert.match(configRoom.applyAction(rollPermissionState,{role:'team',teamId:0},'roll',{}).error,/主持人允許/);
assert.equal(configRoom.applyAction(rollPermissionState,{role:'host',teamId:null},'allowRoll',{teamId:0}),undefined);
assert.equal(rollPermissionState.activeTeamId,0);
assert.equal(configRoom.applyAction(rollPermissionState,{role:'team',teamId:0},'roll',{}),undefined);
assert.equal(rollPermissionState.teams[0].lastDice.length,3);
assert.equal(rollPermissionState.teams[0].lastDice.reduce((sum,n)=>sum+n,0),rollPermissionState.teams[0].lastRoll);
assert.equal(rollPermissionState.activeTeamId,null);
rollPermissionState.teams[0].joined=true;
assert.equal(configRoom.applyAction(rollPermissionState,{role:'team',teamId:0},'leaveTeam',{}),undefined);
assert.equal(rollPermissionState.teams[0].joined,false);


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
room.state={phase:'setup',paused:false,teams:[{name:'紅隊',joined:true},{name:'藍隊',joined:false}],log:[]};

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

const hostSocket=pendingSocket();
hostSocket.serializeAttachment({role:'host',teamId:null});
room.commit=async (next)=>{ room.state=next; };
await room.webSocketMessage(hostSocket,JSON.stringify({type:'action',action:'settleGame',actionId:'test-settle-1'}));
assert.equal(hostSocket.sent.find(m=>m.type==='action_ok')?.actionId,'test-settle-1');
assert.equal(room.state.phase,'settle');

const receiptRoom=new GameRoom({blockConcurrencyWhile:fn=>fn(),storage:{}},{});
receiptRoom.loaded=true;
receiptRoom.lastActivityAt=Date.now();
receiptRoom.meta={id:'RECEIPT',name:'收據測試',teamCount:2,hostTokenHash:'unused'};
receiptRoom.state=G.freshState('RECEIPT',2);
receiptRoom.commit=async next=>{receiptRoom.state=next;};
const receiptSocket=pendingSocket();
receiptSocket.serializeAttachment({role:'host',teamId:null});
await receiptRoom.webSocketMessage(receiptSocket,JSON.stringify({type:'action',action:'adjustCash',payload:{teamId:0,amount:250},actionId:'receipt-1'}));
assert.equal(receiptRoom.state.receipts.length,1);
assert.equal(receiptRoom.state.receipts[0].cashDelta,250);
assert.equal(receiptRoom.state.receipts[0].afterCash,receiptRoom.state.teams[0].cash);

console.log('reliability phase-guard, team-picker and control-header tests passed');
