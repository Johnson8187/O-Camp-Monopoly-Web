import { G } from './game-core.js';

const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const now = () => new Date().toISOString();
const text = (v, fallback='') => String(v ?? fallback).trim();
const APP_BUILD_VERSION = '2026.08.21.13';




function randomHex(bytes=18){ const a=new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function hashSecret(value){ const data=new TextEncoder().encode(String(value)); const digest=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function verifySecret(value, hashed){ return Boolean(value && hashed && (await hashSecret(value))===hashed); }
function statusOf(state){ return state.phase==='ended'?'ended':state.paused?'paused':state.phase==='setup'?'lobby':'running'; }
function getRoom(env,id){ return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(id)); }
const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
function idleTimeoutMs(env){ const value=Number(env.IDLE_TIMEOUT_MS); return Number.isFinite(value)&&value>0?value:DEFAULT_IDLE_TIMEOUT_MS; }

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    try{
      if(url.pathname==='/api/auth' && request.method==='POST') return authenticate(request,env);
      if(url.pathname==='/api/lobby' && request.method==='GET'){
        const rows=await env.DB.prepare("SELECT id,name,status,team_count,updated_at,state_json FROM games WHERE status IN ('lobby','running','paused') ORDER BY updated_at DESC LIMIT 1").all();
        return json({games:(rows.results||[]).map(r=>{let s={};try{s=JSON.parse(r.state_json||'{}');}catch{}const teams=(s.teams||[]).map((t,i)=>({id:i,name:t.name||`第 ${i+1} 組`,color:t.color||'#8a8676',joined:Boolean(t.joined)}));return {id:r.id,name:r.name,status:r.status,teamCount:r.team_count,joinedCount:teams.filter(t=>t.joined).length,teams,updatedAt:r.updated_at};})});
      }
      if(url.pathname==='/api/games' && request.method==='POST') return createGame(request,env);
      const historyMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/history$/);
      if(historyMatch && request.method==='GET') return getHistory(historyMatch[1],request,env);
      const closeMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/close$/);
      if(closeMatch && request.method==='POST') return closeGame(closeMatch[1],request,env);
      const wsMatch=url.pathname.match(/^\/ws\/([^/]+)$/);
      if(wsMatch){ const id=decodeURIComponent(wsMatch[1]); const headers=new Headers(request.headers); headers.delete('x-control-action');headers.set('x-game-id',id); return getRoom(env,id).fetch(new Request(request,{headers})); }
      if(env.ASSETS){
        const requestHeaders=new Headers(request.headers);
        requestHeaders.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
        const asset=await env.ASSETS.fetch(new Request(request,{headers:requestHeaders}));
        const responseHeaders=new Headers(asset.headers);
        responseHeaders.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
        responseHeaders.set('pragma','no-cache');
        responseHeaders.set('x-build-version',APP_BUILD_VERSION);
        return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers:responseHeaders});
      }
      return new Response('Not found',{status:404});
    }catch(e){ return json({error:e?.message||'Server error'},500); }
  }
};

async function authenticate(request,env){
  const body=await request.json().catch(()=>({})); const role=text(body.role); const password=text(body.password);
  const hash=role==='host'?env.ADMIN_PASSWORD_HASH:role==='team'?env.TEAM_PASSWORD_HASH:null;
  if(!hash || !(await verifySecret(password,hash))) return json({error:'密碼錯誤'},401);
  return json({ok:true,role});
}
function bearer(request){ return (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''); }
async function isAdmin(request,env){ const token=bearer(request); return Boolean(token && env.ADMIN_PASSWORD_HASH && await verifySecret(token,env.ADMIN_PASSWORD_HASH)); }
async function createGame(request,env){
  if(!(await isAdmin(request,env))) return json({error:'需要主持人授權'},401);
  const active=await env.DB.prepare("SELECT id FROM games WHERE status IN ('lobby','running','paused') LIMIT 1").first();
  if(active) return json({error:'目前已有一場活動，請先由主持人結束後再建立新活動'},409);
  const body=await request.json().catch(()=>({}));
  const name=text(body.name,'未命名活動').slice(0,80);
  const max=G.BASE_IDX.length; const teamCount=Math.max(2,Math.min(max,Number(body.teamCount)||10));
  const id=randomHex(6).toUpperCase(); const hostToken=randomHex(24);
  const hostHash=await hashSecret(hostToken);
  const state=G.freshState(id,teamCount); const timestamp=now();
  await env.DB.prepare('INSERT INTO games (id,name,status,team_count,host_token_hash,team_pin_hashes_json,state_json,created_at,updated_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)')
    .bind(id,name,'lobby',teamCount,hostHash,'[]',JSON.stringify(state),timestamp,timestamp).run();
  try{
    const headers=new Headers({'x-game-id':id,'x-control-action':'armIdle'});
    await getRoom(env,id).fetch(new Request('https://do.internal/arm-idle',{method:'POST',headers,body:'{}'}));
  }catch(e){
    await env.DB.prepare('DELETE FROM games WHERE id=?').bind(id).run();
    return json({error:'活動生命週期初始化失敗，請重新建立'},500);
  }
  return json({id,name,status:'lobby',teamCount,createdAt:timestamp,hostToken,state});
}
async function getHistory(id,request,env){
  const token=bearer(request);
  const row=await env.DB.prepare('SELECT host_token_hash FROM games WHERE id=?').bind(id).first();
  if(!row || !((await verifySecret(token,row.host_token_hash)) || (env.ADMIN_PASSWORD_HASH && await verifySecret(token,env.ADMIN_PASSWORD_HASH)))) return json({error:'需要主持人授權'},401);
  const rows=await env.DB.prepare('SELECT event_type,actor_role,actor_team,message,state_rev,created_at FROM game_events WHERE game_id=? ORDER BY id DESC LIMIT 500').bind(id).all();
  return json({events:(rows.results||[]).map(r=>({eventType:r.event_type,actorRole:r.actor_role,actorTeam:r.actor_team,message:r.message,stateRev:r.state_rev,createdAt:r.created_at}))});
}
async function closeGame(id,request,env){
  if(!(await isAdmin(request,env))) return json({error:'需要主持人授權'},401);
  const row=await env.DB.prepare("SELECT id,status FROM games WHERE id=?").bind(id).first();
  if(!row) return json({error:'找不到活動'},404);
  if(row.status==='ended') return json({ok:true,status:'ended'});
  const headers=new Headers({'x-game-id':id,'x-control-action':'endGame'});
  return getRoom(env,id).fetch(new Request('https://do.internal/control',{method:'POST',headers,body:'{}'}));
}
const HOST_ACTIONS=new Set(['assignBases','startGame','pauseGame','resumeGame','nextPhase','endGame','setMarket','unlock','adjustCash','adjustPts','renameTeams','setConfig','setConfigs']);
const TEAM_ACTIONS=new Set(['roll','reroll','battle','attack','gamble','buff','upgrade','sell','buyBack']);
const TEAM_ACTION_PHASES=new Map([['roll','roll'],['reroll','roll'],['battle','roll'],['attack','roll'],['gamble','shop'],['buff','shop'],['upgrade','sell'],['sell','sell'],['buyBack','sell']]);
const CONFIG_RANGES={lapBonus:[0,1000000],taxAmount:[0,1000000],casinoCost:[0,1000000],blackDiscount:[1,100],bankShare:[0,100],diceSides:[2,20],passRatio:[0,100]};
function configRange(path){ if(CONFIG_RANGES[path])return CONFIG_RANGES[path];return /^(levels\.\d+\.(stay|up|sell)|attacks\.(quake|missile|typhoon|wildfire)\.cost)$/.test(path)?[0,1000000]:null; }
function updateConfig(settings,path,rawValue){
  const range=configRange(path),value=Number(rawValue);
  if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])return '設定值超出允許範圍';
  const parts=path.split('.');let target=settings;
  for(let i=0;i<parts.length-1;i++){target=target?.[parts[i]];if(!target)return '設定路徑錯誤';}
  const key=parts.at(-1);if(!(key in target))return '設定路徑錯誤';target[key]=value;return null;
}
export function teamActionError(state,action){
  if(state.phase==='setup')return '遊戲尚未開始';
  if(state.phase==='ended')return '活動已經結束';
  if(state.paused)return '活動目前已暫停';
  const required=TEAM_ACTION_PHASES.get(action);
  return required&&state.phase!==required?'目前階段不能執行這個操作':null;
}

export class GameRoom {
  constructor(ctx,env){ this.ctx=ctx;this.env=env;this.loaded=false;this.state=null;this.meta=null;this.gameId=null;this.lastActivityAt=0;this.kickedTeams=new Set(); }
  async load(){
    await this.ctx.blockConcurrencyWhile(async()=>{
      if(this.loaded)return;
      const cached=await this.ctx.storage.get('state');
      const storedGameId=await this.ctx.storage.get('gameId');
      const storedActivity=Number(await this.ctx.storage.get('lastActivityAt'))||0;
      this.gameId=this.gameId||storedGameId||this.ctx.id.toString();
      const row=await this.env.DB.prepare('SELECT id,name,status,team_count,host_token_hash,state_json,updated_at FROM games WHERE id=?').bind(this.gameId).first();
      if(!row) throw new Error('找不到活動');
      this.meta={id:row.id,name:row.name,status:row.status,teamCount:row.team_count,hostTokenHash:row.host_token_hash};
      this.state=cached||JSON.parse(row.state_json||'{}'); this.loaded=true;
      const dbActivity=Date.parse(row.updated_at)||Date.now();
      this.lastActivityAt=Math.max(storedActivity,dbActivity);
      if(!cached) await this.ctx.storage.put('state',this.state);
      await this.ctx.storage.put('gameId',this.gameId);
      await this.ctx.storage.put('lastActivityAt',this.lastActivityAt);
    });
    await this.armIdleAlarm();
  }
  async armIdleAlarm(){
    if(!this.lastActivityAt || this.state?.phase==='ended') return;
    await this.ctx.storage.setAlarm(this.lastActivityAt + idleTimeoutMs(this.env));
  }
  async alarm(){
    await this.load();
    if(this.state?.phase==='ended') return;
    const row=await this.env.DB.prepare('SELECT status,updated_at FROM games WHERE id=?').bind(this.meta.id).first();
    if(!row || row.status==='ended') return;
    const last=Date.parse(row.updated_at)||this.lastActivityAt||Date.now();
    const timeout=idleTimeoutMs(this.env); const elapsed=Date.now()-last;
    if(elapsed < timeout){
      this.lastActivityAt=last; await this.ctx.storage.put('lastActivityAt',last); await this.armIdleAlarm(); return;
    }
    const next=G.clone(this.state); next.paused=false; next.phase='ended'; next.log.unshift('活動閒置超過 3 小時，系統自動關閉活動'); next.rev=(this.state.rev||0)+1;
    await this.commit(next,{role:'system',teamId:null},'idleTimeout',{idleMs:elapsed,timeoutMs:timeout});
    for(const ws of this.ctx.getWebSockets()){ try{ ws.close(4004,'idle-timeout'); }catch{} }
  }
  async fetch(request){
    this.gameId=request.headers.get('x-game-id')||this.gameId||this.ctx.id.toString();
    await this.load();
    const control=request.headers.get('x-control-action');
    if(control){
      if(control==='armIdle') return json({ok:true,status:statusOf(this.state)});
      if(control!=='endGame') return json({error:'不支援的控制操作'},400);
      if(this.state.phase==='ended') return json({ok:true,status:'ended'});
      const next=G.clone(this.state); const result=this.applyAction(next,{role:'host',teamId:null},'endGame',{});
      if(result?.error) return json({error:result.error},400);
      next.rev=(this.state.rev||0)+1; await this.commit(next,{role:'host',teamId:null},'endGame',{});
      return json({ok:true,status:'ended'});
    }
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return json({error:'WebSocket required'},426);
    const pair=new WebSocketPair(); const client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server); server.serializeAttachment({role:'pending',teamId:null}); server.send(JSON.stringify({type:'hello_required'}));
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    await this.load();
    let m;try{m=JSON.parse(typeof message==='string'?message:new TextDecoder().decode(message));}catch{return ws.send(JSON.stringify({type:'error',error:'訊息格式錯誤'}));}
    let actor=ws.deserializeAttachment?.()||{role:'pending',teamId:null};
    if(actor.role==='pending'){
      if(m.type!=='hello') return ws.send(JSON.stringify({type:'error',error:'請先完成登入'}));
      const role=m.role;const teamId=Number.isInteger(m.teamId)?m.teamId:null;
      let ok=false;
      if(role==='viewer') ok=true;
      else if(role==='host') ok=(this.env.ADMIN_PASSWORD_HASH&&await verifySecret(m.accessToken,this.env.ADMIN_PASSWORD_HASH))||await verifySecret(m.token,this.meta.hostTokenHash);
      else if(role==='team'&&teamId!==null&&teamId>=0&&teamId<this.meta.teamCount) ok=Boolean(this.env.TEAM_PASSWORD_HASH&&await verifySecret(m.accessToken,this.env.TEAM_PASSWORD_HASH));
      if(!ok){ws.close(1008,'授權失敗');return;}
      actor={role,teamId};ws.serializeAttachment(actor);
      if(role==='team'&&this.state.teams[teamId]&&!this.state.teams[teamId].joined){ this.kickedTeams.delete(teamId); const next=G.clone(this.state);next.teams[teamId].joined=true;next.log.unshift(`${next.teams[teamId].name} 已加入活動`);await this.commit(next,actor,'teamJoin',{}); }
      ws.send(JSON.stringify({type:'hello_ok',state:this.state,meta:{id:this.meta.id,name:this.meta.name,status:statusOf(this.state),teamCount:this.meta.teamCount}}));
      return;
    }
    if(m.type==='ping') return ws.send(JSON.stringify({type:'pong'}));
    if(m.type!=='action') return;
    const actionId=text(m.actionId).slice(0,80);
    const fail=error=>ws.send(JSON.stringify({type:'error',error,actionId}));
    if(actor.role==='host'&&m.action==='kickTeam'){
      const teamId=Number(m.payload?.teamId);
      if(!Number.isInteger(teamId)||!this.state.teams[teamId]) return fail('隊伍編號錯誤');
      this.kickTeam(teamId);
      const next=G.clone(this.state); next.teams[teamId].joined=false; next.log.unshift(`${next.teams[teamId].name} 已被主持人踢出，即時連線已關閉`); next.rev=(this.state.rev||0)+1;
      await this.commit(next,actor,'kickTeam',{teamId});ws.send(JSON.stringify({type:'action_ok',actionId,rev:next.rev}));return;
    }
    if((actor.role==='host'&&!HOST_ACTIONS.has(m.action))||(actor.role==='team'&&!TEAM_ACTIONS.has(m.action))||actor.role==='viewer')return fail('你的角色不能執行這個操作');
    if(actor.role==='team'){
      const phaseError=teamActionError(this.state,m.action);if(phaseError)return fail(phaseError);
    }
    try{const next=G.clone(this.state);const result=this.applyAction(next,actor,m.action,m.payload||{});if(result?.error)return fail(result.error);next.rev=(this.state.rev||0)+1;await this.commit(next,actor,m.action,m.payload||{});ws.send(JSON.stringify({type:'action_ok',actionId,rev:next.rev}));}catch(e){fail(e?.message||'操作失敗');}
  }
  applyAction(s,actor,action,p){
    if(actor.role==='team'){const i=actor.teamId;if(i===null||!s.teams[i])return {error:'找不到隊伍'};if(action==='roll'){if(s.phase!=='roll'||s.teams[i].rolled)return {error:'目前不能擲骰'};G.applyMove(s,i,1+Math.floor(Math.random()*(s.settings.diceSides||6)));return;}if(action==='reroll'){const t=s.teams[i];if(t.buffs.reroll<=0||!t.rolled)return {error:'目前不能重骰'};t.buffs.reroll-=1;t.rolled=false;s.log.unshift(`${t.name} 使用重骰卡`);return;}if(action==='battle'){const t=s.teams[i];if(t.battles<=0)return {error:'BATTLE 次數已用完'};t.battles-=1;s.log.unshift(`${t.name} 使用 BATTLE（剩 ${t.battles} 次），由關主裁決`);return;}if(action==='attack'){const kind=String(p.kind||''),useKey=`${Number(s.round)}:${i}:${kind}`;if(s.attackUsage?.[useKey]||Number(s.teams[i].attackRounds?.[kind])===Number(s.round))return {error:`「${s.settings.attacks?.[kind]?.name||'特殊操作'}」本回合已使用過`};const r=G.playAttack(s,i,kind);if(!r.ok)return {error:r.msg};s.attackUsage={...(s.attackUsage||{}),[useKey]:true};return;}if(action==='gamble'){const r=G.buyGamble(s,i,Number(p.index));return r.ok?undefined:{error:r.msg};}if(action==='buff'){const r=G.buyBuff(s,i,p.kind);return r.ok?undefined:{error:r.msg};}if(action==='upgrade'){const r=G.upgradeBase(s,i);return r.ok?undefined:{error:r.msg};}if(action==='sell'){const r=G.sellBase(s,i);return r.ok?undefined:{error:r.msg};}if(action==='buyBack'){const r=G.buyBackBase(s,i);return r.ok?undefined:{error:r.msg};}}
    if(action==='assignBases'){if(s.phase!=='setup')return {error:'遊戲開始後不能重新抽籤'};G.assignBases(s);return;}if(action==='startGame'){if(s.phase!=='setup')return {error:'遊戲已開始或已結束'};if(s.teams.some(t=>t.baseIdx===null))return {error:'請先抽籤分配基地'};s.paused=false;s.phase='market';s.round=1;s.log.unshift('遊戲開始，第 1 回合');return;}if(action==='pauseGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=true;s.log.unshift('主持人暫停了活動');return;}if(action==='resumeGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;s.log.unshift('主持人恢復了活動');return;}if(action==='nextPhase'){if(s.phase==='ended')return {error:'活動已結束'};if(s.paused)return {error:'活動目前已暫停，請先恢復活動'};G.nextPhase(s);return;}if(action==='endGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;s.phase='ended';s.log.unshift('活動結束，歷史紀錄已保存');return;}if(action==='setMarket'){const k=p.kind;if(!s.settings.marketOrder.includes(k))return {error:'股市狀態錯誤'};s.market=k;s.log.unshift(`股市公布：${s.settings.marketNames[k]}`);return;}if(action==='unlock'){const i=Number(p.index);if(!G.STAGE_IDX.includes(i))return {error:'關卡格錯誤'};if(!s.unlocked.includes(i))s.unlocked.push(i);s.log.unshift(`關卡格解封（第 ${i+1} 格）`);return;}if(action==='adjustCash'||action==='adjustPts'){const i=Number(p.teamId),amount=Number(p.amount);if(!s.teams[i]||!Number.isFinite(amount)||Math.abs(amount)>1000000)return {error:'調整值錯誤'};if(action==='adjustCash')s.teams[i].cash+=amount;else s.teams[i].pts=Math.max(0,s.teams[i].pts+amount);s.log.unshift(`${s.teams[i].name} ${action==='adjustCash'?'現金':'點數'} ${amount>0?'+':''}${amount}`);return;}if(action==='renameTeams'){if(!Array.isArray(p.names))return {error:'隊伍名稱格式錯誤'};s.teams.forEach((t,i)=>{const n=text(p.names[i],t.name).slice(0,30);if(n)t.name=n;});s.log.unshift('主持人更新了隊伍名稱');return;}if(action==='setConfig'){const path=String(p.path||''),error=updateConfig(s.settings,path,p.value);if(error)return {error};s.log.unshift(`主持人調整設定：${path}`);return;}if(action==='setConfigs'){if(!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>50)return {error:'設定清單格式錯誤'};for(const entry of p.entries){const error=updateConfig(s.settings,String(entry?.path||''),entry?.value);if(error)return {error};}s.log.unshift(`主持人儲存遊戲設定（${p.entries.length} 項）`);return;}
    return {error:'未知操作'};
  }
  async commit(next,actor,eventType,payload){
    if(Array.isArray(next.log)&&next.log.length>120)next.log=next.log.slice(0,120);
    this.state=next;await this.ctx.storage.put('state',next);const status=statusOf(next);const timestamp=now();const activityAt=Date.parse(timestamp);const message=String(next.log?.[0]||eventType);
    await this.env.DB.batch([this.env.DB.prepare('UPDATE games SET status=?,state_json=?,updated_at=?,ended_at=? WHERE id=?').bind(status,JSON.stringify(next),timestamp,status==='ended'?timestamp:null,this.meta.id),this.env.DB.prepare('INSERT INTO game_events (game_id,event_type,actor_role,actor_team,message,payload_json,state_rev,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(this.meta.id,eventType,actor.role,actor.teamId,message,JSON.stringify(payload||{}),next.rev,timestamp)]);
    this.lastActivityAt=activityAt; await this.ctx.storage.put('lastActivityAt',activityAt);
    if(status==='ended') await this.ctx.storage.deleteAlarm(); else await this.armIdleAlarm();
    this.meta.status=status;this.broadcast({type:'state',state:next,status});
  }
  kickTeam(teamId){ this.kickedTeams.add(teamId); for(const ws of this.ctx.getWebSockets()){ const a=ws.deserializeAttachment?.(); if(a?.role==='team'&&a.teamId===teamId){ try{ws.send(JSON.stringify({type:'kicked',message:'主持人已將你踢出活動'}));ws.close(4003,'kicked');}catch{} } } }
  broadcast(message){const data=JSON.stringify(message);for(const ws of this.ctx.getWebSockets()){try{ws.send(data);}catch{}}}
  async webSocketClose(ws){
    const actor=ws.deserializeAttachment?.();
    if(!actor || actor.role!=='team' || this.kickedTeams.has(actor.teamId) || !this.loaded || this.state?.phase==='ended' || !this.state?.teams?.[actor.teamId]?.joined) return;
    const stillConnected=this.ctx.getWebSockets().some(other=>other!==ws&&other.deserializeAttachment?.()?.role==='team'&&other.deserializeAttachment?.()?.teamId===actor.teamId);
    if(stillConnected)return;
    const next=G.clone(this.state); next.teams[actor.teamId].joined=false; next.log.unshift(`${next.teams[actor.teamId].name} 已離線`); next.rev=(this.state.rev||0)+1;
    try{ await this.commit(next,{role:'system',teamId:actor.teamId},'teamLeave',{}); }catch{}
  }
  webSocketError(){}
}
