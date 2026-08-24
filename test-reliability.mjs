import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { GameRoom, ensureTeamAccessCodes, normalizeGameState, projectStateForActor, resolveAccessCode, teamActionError } from './src/worker.js';
import { G } from './src/game-core.js';

const appSource=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const stylesSource=await readFile(new URL('./public/styles.css',import.meta.url),'utf8');
const indexSource=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
assert.match(appSource,/viewer-dashboard/);
assert.match(appSource,/team-command-hud/);
assert.match(appSource,/host-console-nav/);
assert.match(appSource,/life-square/);
assert.match(appSource,/teamMomentFxHTML/);
assert.match(appSource,/isPresentationTaskRelevant/);
assert.match(appSource,/isPurchaseReceipt/);
assert.match(appSource,/teamLifeMoments\.filter\([\s\S]*?\.forEach\(enqueueFx\)/);
assert.ok(appSource.indexOf("enqueueFx({type:'roll'")<appSource.indexOf('teamLifeMoments.filter('));
assert.doesNotMatch(indexSource,/id="bottomNav"/);
assert.match(appSource,/entryBackHomeHTML/);
assert.match(appSource,/team-name-edit-button/);
assert.doesNotMatch(appSource,/id="teamNames"/);
assert.match(appSource,/battleEncounterHTML/);
assert.match(appSource,/type:'battlePrompt'/);
assert.ok(appSource.indexOf("enqueueFx({type:'roll'")<appSource.indexOf("enqueueFx({type:'battlePrompt'"));
assert.match(appSource,/battleDuelHTML/);
assert.match(appSource,/battleResultHTML/);
assert.match(appSource,/battlePresentationTransition/);
assert.match(appSource,/pawnFacingForStep/);
assert.match(stylesSource,/\.battle-duel-overlay/);
assert.match(stylesSource,/\.battle-result-overlay/);
assert.match(stylesSource,/\.pawn-pose-walk/);
assert.match(appSource,/landingReactionHTML/);
assert.match(appSource,/attackCharacterStageHTML/);
assert.match(appSource,/type:'landingReaction'/);
assert.match(stylesSource,/\.landing-reaction-overlay/);
assert.match(stylesSource,/\.attack-character-stage/);
assert.match(stylesSource,/\.pawn-signature-ninja/);
assert.ok(appSource.indexOf("enqueueFx({type:'roll'")<appSource.indexOf("enqueueFx({type:'landingReaction'"));
assert.ok(appSource.indexOf("enqueueFx({type:'landingReaction'")<appSource.indexOf("enqueueFx({type:'battlePrompt'"));
assert.match(appSource,/ceremony-control-dock/);
assert.match(appSource,/ceremony-podium-stage/);
assert.match(appSource,/setCeremonyStep/);
assert.match(stylesSource,/\.ceremony-podium-stage/);
assert.match(appSource,/showMissileTargetModal/);
assert.match(appSource,/stageNoticeHTML/);
assert.match(appSource,/stageLandingFxHTML/);
assert.match(appSource,/type:'stageLanding'/);
assert.match(appSource,/replayStageFanfare/);
assert.doesNotMatch(appSource,/id="playStageFanfare"/);
assert.match(appSource,/task\.receipt\?\.action==='roll'&&\/\^完成/);
assert.ok(appSource.indexOf("enqueueFx({type:'roll'")<appSource.indexOf("enqueueFx({type:'stageLanding'"));
assert.match(appSource,/hostAccessCodeGridHTML/);
assert.match(appSource,/viewerManagementHTML/);
assert.match(appSource,/viewer_request/);
assert.match(appSource,/sessionStorageKey\(App\.role\)/);
assert.match(appSource,/if\(!\['host','team','viewer'\]\.includes\(App\.role\)\)return/);
assert.doesNotMatch(appSource,/你要追蹤哪一隊/);
assert.doesNotMatch(appSource,/選擇你的隊伍/);
assert.doesNotMatch(appSource,/life-open-games/);
assert.match(stylesSource,/\.stage-notice-overlay/);
assert.match(stylesSource,/\.stage-landing-overlay/);
for(const asset of ['stage-night-v1.webp','stage-land-v1.webp','stage-water-v1.webp','stage-rpg-v1.webp','stage-bbq-v1.webp'])assert.match(stylesSource,new RegExp(asset.replace('.','\\.')));
for(const asset of ['stage-night-cast-v2.webp','stage-land-cast-v2.webp','stage-water-cast-v2.webp','stage-rpg-cast-v2.webp','stage-bbq-cast-v2.webp'])assert.match(stylesSource,new RegExp(asset.replace('.','\\.')));
assert.match(appSource,/STAGE_BEATS/);
assert.match(appSource,/stageBeatTrackHTML/);
assert.match(appSource,/stage-camera-flashes/);
assert.match(appSource,/stage-contract-stamp/);
assert.match(stylesSource,/max-aspect-ratio:29\/20/);
assert.match(stylesSource,/life-festival-plaza-v1\.png/);
for(const asset of ['fx-quake-v1.png','fx-missile-v1.png','fx-typhoon-v1.png','fx-wildfire-v1.png'])assert.match(stylesSource,new RegExp(asset.replace('.','\\.')));
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
const ceremony=G.freshState('CEREMONY',3);
ceremony.phase='settle';
assert.equal(configRoom.applyAction(ceremony,{role:'host',teamId:null},'setCeremonyStep',{step:3}),undefined);
assert.equal(ceremony.ceremonyStep,3);
assert.match(configRoom.applyAction(ceremony,{role:'host',teamId:null},'setCeremonyStep',{step:9}).error,/頒獎/);
assert.equal(ceremony.ceremonyStep,3);
assert.equal(normalizeGameState({phase:'ended',teams:[],log:[]}).ceremonyStep,5);
assert.equal(normalizeGameState({phase:'settle',teams:[],log:[],ceremonyStep:99}).ceremonyStep,5);
const enterCeremony=G.freshState('ENTER-CEREMONY',3);
enterCeremony.phase='roll';
enterCeremony.ceremonyStep=4;
assert.equal(configRoom.applyAction(enterCeremony,{role:'host',teamId:null},'settleGame',{}),undefined);
assert.equal(enterCeremony.phase,'settle');
assert.equal(enterCeremony.ceremonyStep,0);
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfig',{path:'attacks.unknown.cost',value:9}).error,'設定值超出允許範圍');
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfigs',{entries:[{path:'attacks.quake.cost',value:7},{path:'attacks.missile.cost',value:6}]}),undefined);
assert.equal(configurable.settings.attacks.quake.cost,7);
assert.equal(configurable.settings.attacks.missile.cost,6);
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfigs',{entries:[{path:'diceCount',value:3},{path:'attacks.quake.repair',value:888},{path:'buffs.shield.cost',value:12}]}),undefined);
assert.equal(configurable.settings.diceCount,3);
assert.equal(configurable.settings.attacks.quake.repair,888);
assert.equal(configurable.settings.buffs.shield.cost,12);
assert.equal(configRoom.applyAction(configurable,{role:'host',teamId:null},'setConfig',{path:'stages.1.cash',value:-750}),undefined);
assert.equal(configurable.settings.stages[1].cash,-750);
const legacyUnlocks=normalizeGameState({phase:'setup',teams:[],log:[],settings:G.clone(G.DEFAULTS)});
assert.deepEqual(legacyUnlocks.unlocked,[]);
const stageControl=G.freshState('STAGE-CONTROL',2);
assert.equal(configRoom.applyAction(stageControl,{role:'host',teamId:null},'unlock',{index:G.STAGE_IDX[0]}),undefined);
assert.equal(stageControl.stageNotices.length,1);
assert.equal(stageControl.stageNotices[0].stage.cash,500);
assert.equal(configRoom.applyAction(stageControl,{role:'host',teamId:null},'unlock',{index:G.STAGE_IDX[0]}),undefined);
assert.equal(stageControl.stageNotices.length,1);
ensureTeamAccessCodes(stageControl,stageControl.teams.length);
const formerTeamCode=stageControl.accessCodes[0].teamCode;
const formerViewerCode=stageControl.accessCodes[0].viewerCode;
assert.equal(configRoom.applyAction(stageControl,{role:'host',teamId:null},'regenerateAccessCode',{teamId:0,kind:'team'}),undefined);
assert.notEqual(stageControl.accessCodes[0].teamCode,formerTeamCode);
assert.equal(stageControl.accessCodes[0].viewerCode,formerViewerCode);
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



const roomSockets=[];
const room=new GameRoom({blockConcurrencyWhile:fn=>fn(),storage:{},getWebSockets:()=>roomSockets},{});
room.loaded=true;
room.lastActivityAt=0;
room.meta={id:'GAME1',name:'測試活動',teamCount:2,hostTokenHash:'unused'};
room.state=normalizeGameState(G.freshState('GAME1',2));room.state.teams[0].joined=true;

function pendingSocket(){

  let attachment={role:'pending',teamId:null};
  return {sent:[],closed:false,send(data){this.sent.push(JSON.parse(data));},close(){this.closed=true;},deserializeAttachment(){return attachment;},serializeAttachment(value){attachment=value;}};
}

const unloadedRoom=new GameRoom({storage:{},getWebSockets:()=>[]},{});
const earlyViewerClose=pendingSocket();
earlyViewerClose.serializeAttachment({role:'viewer',teamId:0,viewerId:'viewer-before-load'});
await assert.doesNotReject(()=>unloadedRoom.webSocketClose(earlyViewerClose));

const wrongSocket=pendingSocket();
roomSockets.push(wrongSocket);
await room.webSocketMessage(wrongSocket,JSON.stringify({type:'hello',role:'team',accessToken:'wrong',token:'not-needed'}));
assert.equal(wrongSocket.closed,true);
const teamSocket=pendingSocket();
roomSockets.push(teamSocket);
await room.webSocketMessage(teamSocket,JSON.stringify({type:'hello',role:'team',accessToken:room.state.accessCodes[0].teamCode}));
assert.equal(teamSocket.closed,false);
assert.equal(teamSocket.sent.at(-1).type,'hello_ok');
assert.equal(teamSocket.sent.at(-1).meta.teamId,0);
assert.equal(await resolveAccessCode(room.state,'team',room.state.accessCodes[1].teamCode),1);
const crossTeamSocket=pendingSocket();
roomSockets.push(crossTeamSocket);
await room.webSocketMessage(crossTeamSocket,JSON.stringify({type:'hello',role:'team',accessToken:room.state.accessCodes[0].viewerCode}));
assert.equal(crossTeamSocket.closed,true);
const privateViewerSocket=pendingSocket();
roomSockets.push(privateViewerSocket);
await room.webSocketMessage(privateViewerSocket,JSON.stringify({type:'hello',role:'viewer_request',accessToken:room.state.accessCodes[0].viewerCode,viewerName:'小明'}));
assert.equal(privateViewerSocket.closed,false);
assert.equal(privateViewerSocket.sent.at(-1).type,'viewer_pending');
assert.equal(privateViewerSocket.sent.some(message=>message.state?.teams?.[0]?.cash!==undefined),false);
const requestedViewerId=privateViewerSocket.sent.at(-1).viewerId;
await room.webSocketMessage(teamSocket,JSON.stringify({type:'action',action:'approveViewer',payload:{viewerId:requestedViewerId},actionId:'approve-viewer-1'}));
const approval=privateViewerSocket.sent.find(message=>message.type==='viewer_approved');
assert.ok(approval?.sessionToken);
const approvedViewerSocket=pendingSocket();roomSockets.push(approvedViewerSocket);
await room.webSocketMessage(approvedViewerSocket,JSON.stringify({type:'hello',role:'viewer',viewerId:requestedViewerId,sessionToken:approval.sessionToken}));
assert.equal(approvedViewerSocket.closed,false);
assert.equal(approvedViewerSocket.sent.at(-1).type,'hello_ok');
assert.equal(approvedViewerSocket.sent.at(-1).meta.teamId,0);
const otherTeamSocket=pendingSocket();roomSockets.push(otherTeamSocket);
await room.webSocketMessage(otherTeamSocket,JSON.stringify({type:'hello',role:'team',accessToken:room.state.accessCodes[1].teamCode}));
await room.webSocketMessage(otherTeamSocket,JSON.stringify({type:'action',action:'removeViewer',payload:{viewerId:requestedViewerId},actionId:'cross-team-remove'}));
assert.match(otherTeamSocket.sent.at(-1).error,/本隊觀眾/);
await room.webSocketMessage(teamSocket,JSON.stringify({type:'action',action:'removeViewer',payload:{viewerId:requestedViewerId},actionId:'remove-viewer-1'}));
assert.equal(approvedViewerSocket.closed,true);
const revokedViewerSocket=pendingSocket();roomSockets.push(revokedViewerSocket);
await room.webSocketMessage(revokedViewerSocket,JSON.stringify({type:'hello',role:'viewer',viewerId:requestedViewerId,sessionToken:approval.sessionToken}));
assert.equal(revokedViewerSocket.closed,true);

const duplicateCodes=G.freshState('DUPLICATE-CODES',2);
duplicateCodes.accessCodes=[{teamCode:'T-23456',viewerCode:'V-23456'},{teamCode:'T-23456',viewerCode:'V-23456'}];
ensureTeamAccessCodes(duplicateCodes,2);
assert.notEqual(duplicateCodes.accessCodes[0].teamCode,duplicateCodes.accessCodes[1].teamCode);
assert.notEqual(duplicateCodes.accessCodes[0].viewerCode,duplicateCodes.accessCodes[1].viewerCode);

const secrets=normalizeGameState(G.freshState('SECRETS',3));
secrets.teams[0].cash=1111;secrets.teams[0].pts=11;secrets.teams[1].cash=2222;secrets.teams[1].pts=22;secrets.teams[2].cash=3333;secrets.teams[2].pts=33;
secrets.receipts=[{id:1,teamId:0,cashDelta:111,afterCash:1111},{id:2,teamId:1,cashDelta:222,afterCash:2222}];
secrets.viewers=[{id:'viewer-secret',teamId:0,name:'測試觀眾',status:'approved',sessionTokenHash:'NEVER-EXPOSE',requestedAt:'2026-08-25T00:00:00.000Z',approvedAt:'2026-08-25T00:01:00.000Z',lastSeenAt:'',removedAt:''}];
secrets.log=['藍隊現金 +99999'];secrets.publicFeed=[{id:1,message:'藍隊完成移動'}];
const publicProjection=projectStateForActor(secrets,{role:'viewer',teamId:null});
assert.equal(publicProjection.teams[0].cash,null);assert.equal(publicProjection.teams[1].pts,null);assert.deepEqual(publicProjection.receipts,[]);assert.deepEqual(publicProjection.log,['藍隊完成移動']);assert.equal('accessCodes'in publicProjection,false);
const teamProjection=projectStateForActor(secrets,{role:'team',teamId:0});
assert.equal(teamProjection.teams[0].cash,1111);assert.equal(teamProjection.teams[1].cash,null);assert.equal(teamProjection.receipts.length,1);assert.equal(teamProjection.myViewerCode,secrets.accessCodes[0].viewerCode);assert.equal(teamProjection.viewerRoster[0].name,'測試觀眾');assert.equal('sessionTokenHash'in teamProjection.viewerRoster[0],false);assert.equal('accessCodes'in teamProjection,false);
const viewerProjection=projectStateForActor(secrets,{role:'viewer',teamId:1});
assert.equal(viewerProjection.teams[1].cash,null);assert.equal(viewerProjection.teams[0].cash,null);assert.equal(viewerProjection.myViewerCode,null);
const approvedProjection=projectStateForActor(secrets,{role:'viewer',teamId:0,viewerId:'viewer-secret'});assert.equal(approvedProjection.teams[0].cash,1111);
secrets.viewers[0].status='removed';const removedProjection=projectStateForActor(secrets,{role:'viewer',teamId:0,viewerId:'viewer-secret'});assert.equal(removedProjection.teams[0].cash,null);secrets.viewers[0].status='approved';
const hostProjection=projectStateForActor(secrets,{role:'host',teamId:null});assert.equal(hostProjection.teams[2].cash,3333);assert.equal(hostProjection.accessCodes.length,3);assert.equal('sessionTokenHash'in hostProjection.viewers[0],false);
secrets.phase='settle';secrets.ceremonyStep=3;const partialReveal=projectStateForActor(secrets,{role:'viewer',teamId:null});assert.equal(partialReveal.ceremonyReveal.podium.length,3);assert.equal(partialReveal.teams.every(team=>team.cash===null),true);
secrets.ceremonyStep=5;const fullReveal=projectStateForActor(secrets,{role:'viewer',teamId:null});assert.equal(fullReveal.teams[2].cash,3333);assert.equal(fullReveal.teams[2].items,null);

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

// Test Mode: testRoll and setPresetRoll verification
const testRollRoom=new GameRoom({blockConcurrencyWhile:fn=>fn(),storage:{}},{});
testRollRoom.loaded=true;
testRollRoom.lastActivityAt=Date.now();
testRollRoom.meta={id:'TEST-ROLL',name:'測試步數',teamCount:2,hostTokenHash:'unused'};
testRollRoom.state=G.freshState('TEST-ROLL',2);
G.assignBases(testRollRoom.state,()=>0);
testRollRoom.state.phase='roll';
testRollRoom.commit=async next=>{testRollRoom.state=next;};
const testHostSocket=pendingSocket();
testHostSocket.serializeAttachment({role:'host',teamId:null});
const team0StartPos=testRollRoom.state.teams[0].pos;
const team1StartPos=testRollRoom.state.teams[1].pos;

// 1. Host testRoll specifies exact 5 steps
await testRollRoom.webSocketMessage(testHostSocket,JSON.stringify({type:'action',action:'testRoll',payload:{teamId:0,steps:5},actionId:'test-roll-1'}));
assert.equal(testHostSocket.sent.find(m=>m.type==='action_ok')?.actionId,'test-roll-1');
assert.equal(testRollRoom.state.teams[0].pos,(team0StartPos+5)%G.N);
assert.equal(testRollRoom.state.teams[0].rolled,true);
assert.equal(testRollRoom.state.lastRoll.n,5);

// 2. Host setPresetRoll specifies team 1 to roll 8 steps on next turn
testRollRoom.state.teams[1].rolled=false;
await testRollRoom.webSocketMessage(testHostSocket,JSON.stringify({type:'action',action:'setPresetRoll',payload:{teamId:1,steps:8},actionId:'preset-1'}));
assert.equal(testRollRoom.state.presetRolls[1],8);

// 3. Team 1 rolls with preset value 8
const team1Socket=pendingSocket();
team1Socket.serializeAttachment({role:'team',teamId:1});
testRollRoom.state.activeTeamId=1;
await testRollRoom.webSocketMessage(team1Socket,JSON.stringify({type:'action',action:'roll',actionId:'team-roll-1'}));
assert.equal(testRollRoom.state.teams[1].pos,(team1StartPos+8)%G.N);
assert.equal(testRollRoom.state.teams[1].rolled,true);
assert.equal(testRollRoom.state.lastRoll.n,8);
assert.equal(testRollRoom.state.presetRolls[1],undefined);

// UI assertions for host test mode
assert.match(appSource,/host-test-mode-toggle/);
assert.match(appSource,/test-roll-btn/);
assert.match(appSource,/test-preset-btn/);
assert.match(stylesSource,/\.host-test-bar/);

console.log('reliability phase-guard, team-picker, test-roll and control-header tests passed');
