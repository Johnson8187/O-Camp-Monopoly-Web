import { G } from './game-core.js';

const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const now = () => new Date().toISOString();
const text = (v, fallback='') => String(v ?? fallback).trim();
const APP_BUILD_VERSION = '2026.08.22.52';

















function randomHex(bytes=18){ const a=new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function hashSecret(value){ const data=new TextEncoder().encode(String(value)); const digest=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function verifySecret(value, hashed){ return Boolean(value && hashed && (await hashSecret(value))===hashed); }
function statusOf(state){ return state.phase==='ended'?'ended':state.phase==='settle'?'settle':state.paused?'paused':state.phase==='setup'?'lobby':'running'; }

function getRoom(env,id){ return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(id)); }
const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export async function getIdleTimeoutMs(env){
  try{
    await ensureSystemSettingsTable(env);
    const row=await env.DB.prepare("SELECT value FROM system_settings WHERE key='idle_timeout_ms'").first();
    if(row && Number(row.value)>0) return Number(row.value);
  }catch{}
  const value=Number(env?.IDLE_TIMEOUT_MS);
  return Number.isFinite(value)&&value>0?value:DEFAULT_IDLE_TIMEOUT_MS;
}

export async function setIdleTimeoutMs(env, ms){
  await ensureSystemSettingsTable(env);
  const val=String(Math.max(60000, Number(ms)||DEFAULT_IDLE_TIMEOUT_MS));
  const timestamp=now();
  await env.DB.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES ('idle_timeout_ms', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(val, timestamp).run();
  return Number(val);
}

const DEFAULT_DEV_PASSWORD_HASH = 'da5d26410ae112bfd2513b4d4eb0497ccf8eeb095cd613fee834e521705d8f20';

let _settingsTableReady = false;
async function ensureSystemSettingsTable(env){
  if (_settingsTableReady) return;
  try{
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
    _settingsTableReady = true;
  }catch{}
}

export async function isDoEnabled(env){
  try{
    await ensureSystemSettingsTable(env);
    const row=await env.DB.prepare("SELECT value FROM system_settings WHERE key='do_enabled'").first();
    if(!row) return true;
    return row.value !== '0' && row.value !== 'false';
  }catch{
    return true;
  }
}

export async function setDoEnabled(env, enabled){
  await ensureSystemSettingsTable(env);
  const val = enabled ? '1' : '0';
  const timestamp = now();
  await env.DB.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES ('do_enabled', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(val, timestamp).run();
  return enabled;
}

export async function verifyDevSecret(password, env={}){
  if(!password) return false;
  if(env.DEV_PASSWORD && password === env.DEV_PASSWORD) return true;
  if(env.DEV_PASSWORD_HASH && (await verifySecret(password, env.DEV_PASSWORD_HASH))) return true;
  if(env.DEV_SECRET && (password === env.DEV_SECRET || (await verifySecret(password, env.DEV_SECRET)))) return true;
  return (await hashSecret(password)) === DEFAULT_DEV_PASSWORD_HASH;
}

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

      // Developer Dashboard APIs
      if(url.pathname.startsWith('/api/dev')){
        return handleDevApi(url, request, env);
      }

      const wsMatch=url.pathname.match(/^\/ws\/([^/]+)$/);
      if(wsMatch){
        if(!(await isDoEnabled(env))) return json({error:'伺服器維護中，DO 服務目前已停用'}, 503);
        const id=decodeURIComponent(wsMatch[1]); const headers=new Headers(request.headers); headers.delete('x-control-action');headers.set('x-game-id',id); return getRoom(env,id).fetch(new Request(request,{headers}));
      }
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
  if(role==='dev'){
    if(!(await verifyDevSecret(password, env))) return json({error:'密碼錯誤'},401);
    return json({ok:true,role:'dev',token:password});
  }
  const hash=role==='host'?env.ADMIN_PASSWORD_HASH:role==='team'?env.TEAM_PASSWORD_HASH:null;
  if(!hash || !(await verifySecret(password,hash))) return json({error:'密碼錯誤'},401);
  return json({ok:true,role});
}
function bearer(request){ return (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''); }
async function isAdmin(request,env){ const token=bearer(request); return Boolean(token && env.ADMIN_PASSWORD_HASH && await verifySecret(token,env.ADMIN_PASSWORD_HASH)); }
async function isDevUser(request,env){ const token=bearer(request); return verifyDevSecret(token, env); }

async function handleDevApi(url, request, env){
  const pathname = url.pathname;
  if(pathname==='/api/dev/auth' && request.method==='POST'){
    const body=await request.json().catch(()=>({}));
    const password=text(body.password);
    if(!(await verifyDevSecret(password, env))) return json({error:'開發者密碼錯誤'}, 401);
    return json({ok:true, role:'dev', token:password});
  }

  // All other /api/dev/* require valid dev token
  if(!(await isDevUser(request, env))){
    return json({error:'需要開發者授權'}, 401);
  }

  if(pathname==='/api/dev/overview' && request.method==='GET'){
    return devOverview(request, env);
  }
  if(pathname==='/api/dev/settings'){
    if(request.method==='GET'){
      const doEnabled = await isDoEnabled(env);
      const idleTimeoutMs = await getIdleTimeoutMs(env);
      return json({ok:true, doEnabled, idleTimeoutMs, idleTimeoutHours: Math.round(idleTimeoutMs / 3600000 * 100) / 100});
    }
    if(request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      let doEnabled = undefined;
      let idleTimeoutMs = undefined;
      if('doEnabled' in body){
        doEnabled = Boolean(body.doEnabled);
        await setDoEnabled(env, doEnabled);
      } else {
        doEnabled = await isDoEnabled(env);
      }
      if('idleTimeoutHours' in body || 'idleTimeoutMs' in body){
        const ms = body.idleTimeoutMs ? Number(body.idleTimeoutMs) : Number(body.idleTimeoutHours) * 3600000;
        idleTimeoutMs = await setIdleTimeoutMs(env, ms);
      } else {
        idleTimeoutMs = await getIdleTimeoutMs(env);
      }
      return json({ok:true, doEnabled, idleTimeoutMs, idleTimeoutHours: Math.round(idleTimeoutMs / 3600000 * 100) / 100});
    }
  }
  if(pathname==='/api/dev/games' && request.method==='GET'){
    return devListGames(url, request, env);
  }
  const gameDetailMatch=pathname.match(/^\/api\/dev\/games\/([^/]+)$/);
  if(gameDetailMatch){
    const id=decodeURIComponent(gameDetailMatch[1]);
    if(request.method==='GET') return devGetGame(id, request, env);
    if(request.method==='DELETE') return devDeleteGame(id, request, env);
  }
  const gameForceEndMatch=pathname.match(/^\/api\/dev\/games\/([^/]+)\/force-end$/);
  if(gameForceEndMatch && request.method==='POST'){
    const id=decodeURIComponent(gameForceEndMatch[1]);
    return devForceEndGame(id, request, env);
  }
  const exportMatch=pathname.match(/^\/api\/dev\/export\/([^/]+)$/);
  if(exportMatch && request.method==='GET'){
    const id=decodeURIComponent(exportMatch[1]);
    return devExportGame(id, request, env);
  }
  if(pathname==='/api/dev/events' && request.method==='GET'){
    return devListEvents(url, request, env);
  }
  if(pathname==='/api/dev/sql' && request.method==='POST'){
    return devExecuteSql(request, env);
  }
  if(pathname==='/api/dev/cleanup' && request.method==='POST'){
    return devCleanup(request, env);
  }
  return json({error:'未知的開發者端點'}, 404);
}

async function devOverview(request, env){
  await ensureSystemSettingsTable(env);
  const [totalGamesRes, activeGamesRes, endedGamesRes, totalEventsRes, latestEventRes, activeGameRes] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM games").first().catch(()=>({cnt:0})),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM games WHERE status IN ('lobby','running','paused')").first().catch(()=>({cnt:0})),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM games WHERE status='ended'").first().catch(()=>({cnt:0})),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM game_events").first().catch(()=>({cnt:0})),
    env.DB.prepare("SELECT created_at, event_type, message, game_id FROM game_events ORDER BY id DESC LIMIT 1").first().catch(()=>null),
    env.DB.prepare("SELECT id, name, status, team_count, updated_at, state_json FROM games WHERE status IN ('lobby','running','paused') ORDER BY updated_at DESC LIMIT 1").first().catch(()=>null)
  ]);

  let activeGame = null;
  if(activeGameRes){
    let s={};try{s=JSON.parse(activeGameRes.state_json||'{}');}catch{}
    activeGame = {
      id: activeGameRes.id,
      name: activeGameRes.name,
      status: activeGameRes.status,
      teamCount: activeGameRes.team_count,
      phase: s.phase || activeGameRes.status,
      round: s.round || 0,
      paused: Boolean(s.paused),
      updatedAt: activeGameRes.updated_at,
      joinedTeams: (s.teams||[]).filter(t=>t.joined).length
    };
  }

  const doEnabled = await isDoEnabled(env);
  const idleTimeoutMs = await getIdleTimeoutMs(env);
  const idleTimeoutHours = Math.round(idleTimeoutMs / 3600000 * 100) / 100;

  return json({
    ok: true,
    version: APP_BUILD_VERSION,
    doEnabled,
    idleTimeoutMs,
    idleTimeoutHours,
    stats: {
      totalGames: Number(totalGamesRes?.cnt || 0),
      activeGames: Number(activeGamesRes?.cnt || 0),
      endedGames: Number(endedGamesRes?.cnt || 0),
      totalEvents: Number(totalEventsRes?.cnt || 0),
      latestEvent: latestEventRes
    },
    activeGame,
    envStatus: {
      hasDb: Boolean(env.DB),
      hasDo: Boolean(env.GAME_ROOMS),
      hasAssets: Boolean(env.ASSETS),
      hasDevSecret: Boolean(env.DEV_PASSWORD || env.DEV_PASSWORD_HASH || env.DEV_SECRET)
    }
  });
}

async function devListGames(url, request, env){
  const status = url.searchParams.get('status') || 'all';
  const search = text(url.searchParams.get('search'));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  let whereClauses = [];
  let params = [];

  if(status === 'active'){
    whereClauses.push("status IN ('lobby','running','paused')");
  } else if(status === 'ended'){
    whereClauses.push("status = 'ended'");
  }

  if(search){
    whereClauses.push("(id LIKE ? OR name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const countRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM games ${whereSql}`).bind(...params).first().catch(()=>({cnt:0}));
  const rows = await env.DB.prepare(`SELECT id, name, status, team_count, created_at, updated_at, ended_at FROM games ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset).all().catch(()=>({results:[]}));

  return json({
    ok: true,
    total: Number(countRow?.cnt || 0),
    limit,
    offset,
    games: rows.results || []
  });
}

async function devGetGame(id, request, env){
  const row = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(id).first();
  if(!row) return json({error:'找不到指定活動'}, 404);
  const eventCountRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM game_events WHERE game_id=?").bind(id).first().catch(()=>({cnt:0}));
  let state = {};
  try{ state = JSON.parse(row.state_json || '{}'); }catch{}
  return json({
    ok: true,
    game: {
      id: row.id,
      name: row.name,
      status: row.status,
      teamCount: row.team_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      endedAt: row.ended_at,
      eventCount: Number(eventCountRow?.cnt || 0)
    },
    state
  });
}

async function devForceEndGame(id, request, env){
  const row = await env.DB.prepare("SELECT id, status FROM games WHERE id=?").bind(id).first();
  if(!row) return json({error:'找不到活動'}, 404);
  const timestamp = now();
  try{
    const headers = new Headers({'x-game-id':id, 'x-control-action':'endGame'});
    await getRoom(env,id).fetch(new Request('https://do.internal/control',{method:'POST',headers,body:'{}'}));
  }catch{}
  await env.DB.batch([
    env.DB.prepare("UPDATE games SET status='ended', ended_at=?, updated_at=? WHERE id=?").bind(timestamp, timestamp, id),
    env.DB.prepare("INSERT INTO game_events (game_id, event_type, actor_role, actor_team, message, payload_json, state_rev, created_at) VALUES (?, 'forceEnd', 'dev', NULL, '開發者強制結束活動', '{}', 9999, ?)").bind(id, timestamp)
  ]);
  return json({ok:true, id, status:'ended'});
}

async function devDeleteGame(id, request, env){
  await env.DB.batch([
    env.DB.prepare("DELETE FROM game_events WHERE game_id=?").bind(id),
    env.DB.prepare("DELETE FROM games WHERE id=?").bind(id)
  ]);
  return json({ok:true, id});
}

async function devListEvents(url, request, env){
  const gameId = url.searchParams.get('gameId');
  const eventType = url.searchParams.get('eventType');
  const actorRole = url.searchParams.get('actorRole');
  const search = text(url.searchParams.get('search'));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  let whereClauses = [];
  let params = [];

  if(gameId){
    whereClauses.push("game_id = ?");
    params.push(gameId);
  }
  if(eventType){
    whereClauses.push("event_type = ?");
    params.push(eventType);
  }
  if(actorRole){
    whereClauses.push("actor_role = ?");
    params.push(actorRole);
  }
  if(search){
    whereClauses.push("(message LIKE ? OR payload_json LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const countRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_events ${whereSql}`).bind(...params).first().catch(()=>({cnt:0}));
  const rows = await env.DB.prepare(`SELECT id, game_id, event_type, actor_role, actor_team, message, payload_json, state_rev, created_at FROM game_events ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset).all().catch(()=>({results:[]}));

  return json({
    ok: true,
    total: Number(countRow?.cnt || 0),
    limit,
    offset,
    events: (rows.results || []).map(r=>{
      let payload = {};
      try{ payload = JSON.parse(r.payload_json || '{}'); }catch{}
      return {
        id: r.id,
        gameId: r.game_id,
        eventType: r.event_type,
        actorRole: r.actor_role,
        actorTeam: r.actor_team,
        message: r.message,
        payload,
        stateRev: r.state_rev,
        createdAt: r.created_at
      };
    })
  });
}

async function devExecuteSql(request, env){
  const body = await request.json().catch(()=>({}));
  const sql = text(body.sql);
  if(!sql) return json({error:'請提供 SQL 語法'}, 400);

  try{
    const res = await env.DB.prepare(sql).all();
    return json({
      ok: true,
      results: res.results || [],
      meta: res.meta || {},
      changes: res.meta?.changes ?? (res.results ? res.results.length : 0)
    });
  }catch(e){
    return json({error: e?.message || 'SQL 執行失敗'}, 400);
  }
}

async function devCleanup(request, env){
  const body = await request.json().catch(()=>({}));
  const rawRetain = body.retainDays;
  const wipeAll = Boolean(body.wipeAll) || rawRetain === 'wipe_all' || rawRetain === -1;
  const retainDays = rawRetain !== undefined && rawRetain !== null && rawRetain !== 'wipe_all' ? Number(rawRetain) : 0;

  let ids = [];
  let cutoff = null;

  if (wipeAll) {
    const allGames = await env.DB.prepare("SELECT id FROM games").all().catch(()=>({results:[]}));
    ids = (allGames.results || []).map(r => r.id);
  } else if (retainDays === 0 || isNaN(retainDays)) {
    const endedGames = await env.DB.prepare("SELECT id FROM games WHERE status='ended'").all().catch(()=>({results:[]}));
    ids = (endedGames.results || []).map(r => r.id);
  } else {
    cutoff = new Date(Date.now() - retainDays * 86400000).toISOString();
    const oldGames = await env.DB.prepare("SELECT id FROM games WHERE status='ended' AND updated_at < ?").bind(cutoff).all().catch(()=>({results:[]}));
    ids = (oldGames.results || []).map(r => r.id);
  }

  if(ids.length > 0){
    for(let i = 0; i < ids.length; i += 50){
      const chunk = ids.slice(i, i + 50);
      const placeholders = chunk.map(()=>'?').join(',');
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM game_events WHERE game_id IN (${placeholders})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM games WHERE id IN (${placeholders})`).bind(...chunk)
      ]);
    }
  }

  // Also clean up any orphaned events whose game_id is no longer in games table
  await env.DB.prepare("DELETE FROM game_events WHERE game_id NOT IN (SELECT id FROM games)").run().catch(()=>{});

  return json({ok:true, deletedGamesCount: ids.length, cutoff, wipeAll});
}

async function devExportGame(id, request, env){
  const game = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(id).first();
  if(!game) return json({error:'找不到活動'}, 404);
  const events = await env.DB.prepare("SELECT * FROM game_events WHERE game_id=? ORDER BY id ASC").bind(id).all().catch(()=>({results:[]}));

  let state = {};
  try{ state = JSON.parse(game.state_json || '{}'); }catch{}

  return json({
    ok: true,
    exportedAt: now(),
    game: {
      ...game,
      state
    },
    events: (events.results || []).map(e=>{
      let p = {};
      try{ p = JSON.parse(e.payload_json || '{}'); }catch{}
      return { ...e, payload: p };
    })
  });
}

async function createGame(request,env){
  if(!(await isDoEnabled(env))) return json({error:'伺服器目前已被開發者關閉（DO 服務停用中），無法建立新活動'}, 503);
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
  if(!row || !((await verifySecret(token,row.host_token_hash)) || (env.ADMIN_PASSWORD_HASH && await verifySecret(token,env.ADMIN_PASSWORD_HASH)) || (await verifyDevSecret(token, env)))) return json({error:'需要主持人授權'},401);
  const rows=await env.DB.prepare('SELECT event_type,actor_role,actor_team,message,state_rev,created_at FROM game_events WHERE game_id=? ORDER BY id DESC LIMIT 500').bind(id).all();
  return json({events:(rows.results||[]).map(r=>({eventType:r.event_type,actorRole:r.actor_role,actorTeam:r.actor_team,message:r.message,stateRev:r.state_rev,createdAt:r.created_at}))});
}
async function closeGame(id,request,env){
  if(!((await isAdmin(request,env)) || (await isDevUser(request,env)))) return json({error:'需要主持人授權'},401);
  const row=await env.DB.prepare("SELECT id,status FROM games WHERE id=?").bind(id).first();
  if(!row) return json({error:'找不到活動'},404);
  if(row.status==='ended') return json({ok:true,status:'ended'});
  const headers=new Headers({'x-game-id':id,'x-control-action':'endGame'});
  return getRoom(env,id).fetch(new Request('https://do.internal/control',{method:'POST',headers,body:'{}'}));
}
export function normalizeGameState(state){
  const s=state&&typeof state==='object'?state:{};
  s.receipts=Array.isArray(s.receipts)?s.receipts:[];
  s.receiptSeq=Number(s.receiptSeq)||0;
  if(!('activeTeamId' in s))s.activeTeamId=null;
  if(!('pendingBattle' in s))s.pendingBattle=null;
  if(!('lastPurchase' in s))s.lastPurchase=null;
  if(!('ceremonyStep' in s))s.ceremonyStep=['settle','ended'].includes(s.phase)?5:0;
  else s.ceremonyStep=Math.max(0,Math.min(5,Math.floor(Number(s.ceremonyStep)||0)));
  s.settings=s.settings||G.clone(G.DEFAULTS);
  if(!Number.isFinite(Number(s.settings.diceCount)))s.settings.diceCount=1;
  (s.teams||[]).forEach(t=>{
    t.buffs={pass:0,reroll:0,shield:0,...(t.buffs||{})};
    const hadInventory=t.items&&typeof t.items==='object';
    t.items=hadInventory?t.items:{};
    if(!hadInventory){
      (s.settings.gambles||[]).forEach((item,index)=>{
        const oldPurchase=`${t.name} 買了「${item.name}」`,newPurchase=`${t.name} 買了實體物品「${item.name}」`;
        const count=(s.log||[]).filter(message=>String(message).startsWith(oldPurchase)||String(message).startsWith(newPurchase)).length;
        if(count)t.items[`g${index}`]=count;
      });
    }
    if(!('lastDice' in t))t.lastDice=null;
  });
  return s;
}

function socketSend(ws,payload){
  try{ws.send(JSON.stringify(payload));return true;}catch{return false;}
}

function appendReceipts(previous,next,action){
  next.receipts=Array.isArray(next.receipts)?next.receipts:[];
  next.receiptSeq=Number(next.receiptSeq)||0;
  const reason=String(next.log?.[0]||action||'金流異動').slice(0,220),createdAt=now();
  (next.teams||[]).forEach((team,i)=>{
    const before=previous?.teams?.[i];if(!before)return;
    const cashDelta=Number(team.cash||0)-Number(before.cash||0),ptsDelta=Number(team.pts||0)-Number(before.pts||0);
    if(!cashDelta&&!ptsDelta)return;
    next.receipts.unshift({id:++next.receiptSeq,teamId:i,round:Number(next.round)||1,phase:next.phase,cashDelta,ptsDelta,beforeCash:Number(before.cash||0),afterCash:Number(team.cash||0),beforePts:Number(before.pts||0),afterPts:Number(team.pts||0),reason,action,createdAt});
  });
  if(next.receipts.length>240)next.receipts=next.receipts.slice(0,240);
}

const HOST_ACTIONS=new Set(['assignBases','startGame','pauseGame','resumeGame','nextPhase','settleGame','setCeremonyStep','endGame','setMarket','allowRoll','resolveBattle','unlock','adjustCash','adjustPts','renameTeams','setConfig','setConfigs']);

const TEAM_ACTIONS=new Set(['roll','reroll','battle','resolveLanding','leaveTeam','attack','gamble','buff','upgrade','sell','buyBack']);
const TEAM_ACTION_PHASES=new Map([['roll','roll'],['reroll','roll'],['battle','roll'],['resolveLanding','roll'],['attack','roll'],['gamble','shop'],['buff','shop'],['upgrade','sell'],['sell','sell'],['buyBack','sell']]);
const CONFIG_RANGES={lapBonus:[0,1000000],taxAmount:[0,1000000],casinoCost:[0,1000000],blackDiscount:[1,100],bankShare:[0,100],diceSides:[2,20],diceCount:[1,5],passRatio:[0,100]};
function configRange(path){ if(CONFIG_RANGES[path])return CONFIG_RANGES[path];return /^(levels\.\d+\.(stay|up|sell|tax)|attacks\.(quake|missile|typhoon|wildfire)\.(cost|repair)|attacks\.typhoon\.eyeBonus|buffs\.(pass|reroll|shield)\.cost)$/.test(path)?[0,1000000]:null; }
function updateConfig(settings,path,rawValue){
  const range=configRange(path),value=Number(rawValue);
  if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])return '設定值超出允許範圍';
  const parts=path.split('.');let target=settings;
  for(let i=0;i<parts.length-1;i++){target=target?.[parts[i]];if(!target)return '設定路徑錯誤';}
  const key=parts.at(-1);if(!(key in target))return '設定路徑錯誤';target[key]=value;return null;
}
export function teamActionError(state,action){
  if(action==='leaveTeam')return null;
  if(state.phase==='setup')return '遊戲尚未開始';
  if(state.phase==='ended')return '活動已經結束';
  if(state.paused)return '活動目前已暫停';
  const required=TEAM_ACTION_PHASES.get(action);
  return required&&state.phase!==required?'目前階段不能執行這個操作':null;
}

export class GameRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.loaded=false;this.state=null;this.meta=null;this.gameId=null;this.lastActivityAt=0;this.kickedTeams=new Set();
    this.actionQueue = Promise.resolve();
    this.processedActions = new Map();
  }
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
      this.state=normalizeGameState(cached||JSON.parse(row.state_json||'{}')); this.loaded=true;
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
    const timeout = await getIdleTimeoutMs(this.env);
    if(this.ctx.storage?.setAlarm) await this.ctx.storage.setAlarm(this.lastActivityAt + timeout);
  }
  async alarm(){
    await this.load();
    if(this.state?.phase==='ended') return;
    const row=await this.env.DB.prepare('SELECT status,updated_at FROM games WHERE id=?').bind(this.meta.id).first();
    if(!row || row.status==='ended') return;
    const last=Date.parse(row.updated_at)||this.lastActivityAt||Date.now();
    const timeout=await getIdleTimeoutMs(this.env); const elapsed=Date.now()-last;
    if(elapsed < timeout){
      this.lastActivityAt=last; await this.ctx.storage.put('lastActivityAt',last); await this.armIdleAlarm(); return;
    }
    const hours = Math.round(timeout / 3600000 * 10) / 10;
    const timeoutLabel = hours >= 1 ? `${hours} 小時` : `${Math.round(timeout / 60000)} 分鐘`;
    const next=G.clone(this.state); next.paused=false; next.phase='ended'; next.log.unshift(`活動閒置超過 ${timeoutLabel}，系統自動關閉活動`); next.rev=(this.state.rev||0)+1;
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
    this.actionQueue = this.actionQueue.then(() => this._handleMessageSafe(ws, message)).catch(err => {
      console.error('GameRoom action error:', err);
    });
    return this.actionQueue;
  }
  async _handleMessageSafe(ws,message){
    await this.load();
    let m;try{m=JSON.parse(typeof message==='string'?message:new TextDecoder().decode(message));}catch{return socketSend(ws,{type:'error',error:'訊息格式錯誤'});}
    let actor=ws.deserializeAttachment?.()||{role:'pending',teamId:null};
    if(actor.role==='pending'){
      if(m.type!=='hello') return socketSend(ws,{type:'error',error:'請先完成登入'});
      const role=m.role;const teamId=Number.isInteger(m.teamId)?m.teamId:null;
      let ok=false;
      if(role==='viewer') ok=true;
      else if(role==='host') ok=(this.env.ADMIN_PASSWORD_HASH&&await verifySecret(m.accessToken,this.env.ADMIN_PASSWORD_HASH))||await verifySecret(m.token,this.meta.hostTokenHash);
      else if(role==='team'&&teamId!==null&&teamId>=0&&teamId<this.meta.teamCount) ok=Boolean(this.env.TEAM_PASSWORD_HASH&&await verifySecret(m.accessToken,this.env.TEAM_PASSWORD_HASH));
      if(!ok){ws.close(1008,'授權失敗');return;}
      actor={role,teamId};ws.serializeAttachment(actor);
      if(role==='team'&&this.state.teams[teamId]&&!this.state.teams[teamId].joined){ this.kickedTeams.delete(teamId); const next=G.clone(this.state);next.teams[teamId].joined=true;next.log.unshift(`${next.teams[teamId].name} 已加入活動`);await this.commit(next,actor,'teamJoin',{}); }
      socketSend(ws,{type:'hello_ok',state:this.state,meta:{id:this.meta.id,name:this.meta.name,status:statusOf(this.state),teamCount:this.meta.teamCount}});
      return;
    }
    if(m.type==='ping') return socketSend(ws,{type:'pong'});
    if(m.type!=='action') return;
    const actionId=text(m.actionId).slice(0,80);
    const fail=error=>socketSend(ws,{type:'error',error,actionId});

    if(actionId && this.processedActions.has(actionId)){
      const cached = this.processedActions.get(actionId);
      return socketSend(ws,{type:'action_ok',actionId,rev:cached.rev});
    }

    if(actor.role==='host'&&m.action==='kickTeam'){
      const teamId=Number(m.payload?.teamId);
      if(!Number.isInteger(teamId)||!this.state.teams[teamId]) return fail('隊伍編號錯誤');
      this.kickTeam(teamId);
      const next=G.clone(this.state); next.teams[teamId].joined=false; next.log.unshift(`${next.teams[teamId].name} 已被主持人踢出，即時連線已關閉`); next.rev=(this.state.rev||0)+1;
      await this.commit(next,actor,'kickTeam',{teamId,actionId});
      if(actionId){ this.processedActions.set(actionId, {rev:next.rev, time:Date.now()}); }
      socketSend(ws,{type:'action_ok',actionId,rev:next.rev});
      return;
    }
    if((actor.role==='host'&&!HOST_ACTIONS.has(m.action))||(actor.role==='team'&&!TEAM_ACTIONS.has(m.action))||actor.role==='viewer')return fail('你的角色不能執行這個操作');
    if(actor.role==='team'){
      const phaseError=teamActionError(this.state,m.action);if(phaseError)return fail(phaseError);
    }
    try{
      const next=G.clone(this.state);
      const result=this.applyAction(next,actor,m.action,m.payload||{});
      if(result?.error)return fail(result.error);
      appendReceipts(this.state,next,m.action);
      next.rev=(this.state.rev||0)+1;
      await this.commit(next,actor,m.action,{...(m.payload||{}),actionId});
      if(actionId){
        this.processedActions.set(actionId, {rev:next.rev, time:Date.now()});
        if(this.processedActions.size > 500){
          const firstKey = this.processedActions.keys().next().value;
          this.processedActions.delete(firstKey);
        }
      }
      socketSend(ws,{type:'action_ok',actionId,rev:next.rev});
    }catch(e){fail(e?.message||'操作失敗');}
  }
  applyAction(s,actor,action,p){
    if(actor.role==='team'){
      const i=actor.teamId;if(i===null||!s.teams[i])return {error:'找不到隊伍'};
      if(action==='leaveTeam'){s.teams[i].joined=false;s.log.unshift(`${s.teams[i].name} 已主動離開活動`);return;}
      if(action==='roll'){
        const t=s.teams[i];if(s.phase!=='roll'||t.rolled||t.jail>0||t.jailedThisTurn)return {error:'在監獄中或目前不能擲骰'};
        if(s.pendingBattle)return {error:'請先完成目前的基地付款或 BATTLE'};
        if(s.activeTeamId!==i)return {error:'請等待主持人允許你的隊伍擲骰'};
        const count=Math.max(1,Math.min(5,Number(s.settings.diceCount)||1)),sides=Math.max(2,Number(s.settings.diceSides)||6);
        const dice=Array.from({length:count},()=>1+Math.floor(Math.random()*sides)),total=dice.reduce((sum,n)=>sum+n,0);
        G.applyMove(s,i,total,Math.random,dice);s.activeTeamId=null;return;
      }
      if(action==='reroll'){const t=s.teams[i];if(s.pendingBattle)return {error:'請先處理基地付款或 BATTLE'};if(t.buffs.reroll<=0||!t.rolled||t.jail>0||t.jailedThisTurn)return {error:'在監獄中或目前不能重骰'};t.buffs.reroll-=1;t.rolled=false;t.lastRoll=null;t.lastDice=null;s.activeTeamId=i;s.log.unshift(`${t.name} 使用重骰卡，已重新取得擲骰權限`);return;}
      if(action==='battle'||action==='resolveLanding'){const choice=action==='battle'?'battle':String(p.choice||'');const r=G.resolvePendingBattle(s,i,choice);return r.ok?undefined:{error:r.msg};}
      if(action==='attack'){const kind=String(p.kind||''),useKey=`${Number(s.round)}:${i}:${kind}`;if(s.attackUsage?.[useKey]||Number(s.teams[i].attackRounds?.[kind])===Number(s.round))return {error:`「${s.settings.attacks?.[kind]?.name||'特殊操作'}」本回合已使用過`};const r=G.playAttack(s,i,kind);if(!r.ok)return {error:r.msg};s.attackUsage={...(s.attackUsage||{}),[useKey]:true};return;}
      if(action==='gamble'){const r=G.buyGamble(s,i,Number(p.index));return r.ok?undefined:{error:r.msg};}
      if(action==='buff'){const r=G.buyBuff(s,i,p.kind);return r.ok?undefined:{error:r.msg};}
      if(action==='upgrade'){const r=G.upgradeBase(s,i);return r.ok?undefined:{error:r.msg};}
      if(action==='sell'){const r=G.sellBase(s,i);return r.ok?undefined:{error:r.msg};}
      if(action==='buyBack'){const r=G.buyBackBase(s,i);return r.ok?undefined:{error:r.msg};}
    }
    if(action==='assignBases'){if(s.phase!=='setup')return {error:'遊戲開始後不能重新抽籤'};G.assignBases(s);return;}
    if(action==='startGame'){if(s.phase!=='setup')return {error:'遊戲已開始或已結束'};if(s.teams.some(t=>t.baseIdx===null))return {error:'請先抽籤分配基地'};s.paused=false;s.phase='market';s.round=1;s.activeTeamId=null;s.ceremonyStep=0;s.log.unshift('遊戲開始，第 1 回合');G.collectPropertyTaxes(s);return;}
    if(action==='pauseGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=true;s.log.unshift('主持人暫停了活動');return;}
    if(action==='resumeGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;if(s.phase==='settle'){s.phase='roll';s.ceremonyStep=0;}s.log.unshift('主持人恢復了活動');return;}
    if(action==='nextPhase'){if(s.phase==='ended')return {error:'活動已結束'};if(s.paused)return {error:'活動目前已暫停，請先恢復活動'};if(s.pendingBattle)return {error:'請先完成基地付款或 BATTLE 裁決'};G.nextPhase(s);return;}
    if(action==='settleGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;s.phase='settle';s.ceremonyStep=0;s.log.unshift('🏆 活動進入最終頒獎典禮，等待主持人揭曉');return;}
    if(action==='setCeremonyStep'){if(!['settle','ended'].includes(s.phase))return {error:'目前不是頒獎典禮階段'};const step=Number(p.step);if(!Number.isInteger(step)||step<0||step>5)return {error:'頒獎典禮進度錯誤'};s.ceremonyStep=step;s.log.unshift(`頒獎典禮進度：${step}/5`);return;}
    if(action==='endGame'){if(s.phase==='ended')return {error:'活動已結束'};const wasSettling=s.phase==='settle';s.paused=false;s.phase='ended';if(!wasSettling)s.ceremonyStep=5;s.log.unshift('活動結束，歷史紀錄已保存');return;}
    if(action==='setMarket'){const k=p.kind;if(!s.settings.marketOrder.includes(k))return {error:'房市狀態錯誤'};s.market=k;s.log.unshift(`房市公布：${s.settings.marketNames[k]}`);return;}
    if(action==='allowRoll'){
      if(s.phase!=='roll')return {error:'目前不是擲骰階段'};
      if(s.pendingBattle)return {error:'請先完成基地付款或 BATTLE 裁決'};
      const i=Number(p.teamId),t=s.teams[i];if(!Number.isInteger(i)||!t)return {error:'隊伍編號錯誤'};
      if(t.rolled||t.jail>0||t.jailedThisTurn)return {error:'這一隊本回合不能再擲骰'};
      s.activeTeamId=i;s.log.unshift(`主持人允許 ${t.name} 擲骰`);return;
    }
    if(action==='resolveBattle'){const r=G.adjudicateBattle(s,String(p.outcome||''));return r.ok?undefined:{error:r.msg};}
    if(action==='unlock'){const i=Number(p.index);if(!G.STAGE_IDX.includes(i))return {error:'關卡格錯誤'};if(!s.unlocked.includes(i))s.unlocked.push(i);s.log.unshift(`關卡格解封（第 ${i+1} 格）`);return;}
    if(action==='adjustCash'||action==='adjustPts'){const i=Number(p.teamId),amount=Number(p.amount);if(!s.teams[i]||!Number.isFinite(amount)||Math.abs(amount)>1000000)return {error:'調整值錯誤'};if(action==='adjustCash')s.teams[i].cash+=amount;else s.teams[i].pts=Math.max(0,s.teams[i].pts+amount);s.log.unshift(`${s.teams[i].name} ${action==='adjustCash'?'現金':'點數'} ${amount>0?'+':''}${amount}`);return;}
    if(action==='renameTeams'){if(!Array.isArray(p.names))return {error:'隊伍名稱格式錯誤'};s.teams.forEach((t,i)=>{const n=text(p.names[i],t.name).slice(0,30);if(n)t.name=n;});s.log.unshift('主持人更新了隊伍名稱');return;}
    if(action==='setConfig'){const path=String(p.path||''),error=updateConfig(s.settings,path,p.value);if(error)return {error};s.log.unshift(`主持人調整設定：${path}`);return;}
    if(action==='setConfigs'){if(!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>50)return {error:'設定清單格式錯誤'};for(const entry of p.entries){const error=updateConfig(s.settings,String(entry?.path||''),entry?.value);if(error)return {error};}s.log.unshift(`主持人儲存遊戲設定（${p.entries.length} 項）`);return;}
    return {error:'未知操作'};
  }
  async commit(next,actor,eventType,payload){
    if(Array.isArray(next.log)&&next.log.length>120)next.log=next.log.slice(0,120);
    const prevState=this.state;
    const prevStatus=this.meta?.status;
    const prevActivity=this.lastActivityAt;
    const status=statusOf(next);
    const timestamp=now();
    const activityAt=Date.parse(timestamp)||Date.now();
    const message=String(next.log?.[0]||eventType);

    if(this.env.DB && typeof this.env.DB.batch === 'function'){
      try{
        await this.env.DB.batch([
          this.env.DB.prepare('UPDATE games SET status=?,state_json=?,updated_at=?,ended_at=? WHERE id=?').bind(status,JSON.stringify(next),timestamp,status==='ended'?timestamp:null,this.meta.id),
          this.env.DB.prepare('INSERT INTO game_events (game_id,event_type,actor_role,actor_team,message,payload_json,state_rev,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(this.meta.id,eventType,actor.role,actor.teamId,message,JSON.stringify(payload||{}),next.rev,timestamp)
        ]);
      }catch(err){
        this.state=prevState;
        if(this.meta)this.meta.status=prevStatus;
        this.lastActivityAt=prevActivity;
        throw err;
      }
    }
    this.state=next;
    if(this.ctx.storage?.put) await this.ctx.storage.put('state',next);
    this.lastActivityAt=activityAt;
    if(this.ctx.storage?.put) await this.ctx.storage.put('lastActivityAt',activityAt);
    if(status==='ended'){ if(this.ctx.storage?.deleteAlarm) await this.ctx.storage.deleteAlarm(); }
    else { await this.armIdleAlarm(); }
    if(this.meta) this.meta.status=status;
    this.broadcast({type:'state',state:next,status,resolvedActionId:payload?.actionId});
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
