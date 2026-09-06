import { G } from './game-core.js';

const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const now = () => new Date().toISOString();
const text = (v, fallback='') => String(v ?? fallback).trim();
const APP_BUILD_VERSION = '2026.09.07.67';

















function randomHex(bytes=18){ const a=new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); }
const ACCESS_ALPHABET='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randomAccessCode(prefix){const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);return `${prefix}-${[...bytes].map(value=>ACCESS_ALPHABET[value%ACCESS_ALPHABET.length]).join('')}`;}
async function hashSecret(value){ const data=new TextEncoder().encode(String(value)); const digest=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function verifySecret(value, hashed){ return Boolean(value && hashed && (await hashSecret(value))===hashed); }
async function verifyAccessCode(value, expected){return Boolean(value&&expected&&await verifySecret(String(value).trim().toUpperCase(),await hashSecret(String(expected).toUpperCase())));}
function statusOf(state){ return state.phase==='ended'?'ended':state.phase==='settle'?'settle':state.paused?'paused':state.phase==='setup'?'lobby':'running'; }

function getRoom(env,id){ return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(id)); }
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_RECENT_ACTIONS = 300;
const PASSIVE_ACTIVITY_EVENTS = new Set(['teamJoin','teamLeave','viewerOnline','viewerRequest']);

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
  if(role==='team')return json({error:'請先選擇隊伍，再輸入該隊專屬隊輔代碼'},410);
  const hash=role==='host'?env.ADMIN_PASSWORD_HASH:null;
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
  const state=G.freshState(id,teamCount);ensureTeamAccessCodes(state,teamCount);const timestamp=now();
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
  delete s._transactions;
  s.receipts=Array.isArray(s.receipts)?s.receipts:[];
  s.receiptSeq=Number(s.receiptSeq)||0;
  s.gameplayActivityAt=Math.max(0,Number(s.gameplayActivityAt)||0);
  s.recentActions=Array.isArray(s.recentActions)?s.recentActions.filter(item=>item&&text(item.id)).slice(0,MAX_RECENT_ACTIONS).map(item=>({id:text(item.id).slice(0,80),rev:Math.max(0,Number(item.rev)||0),at:Math.max(0,Number(item.at)||0),actorRole:text(item.actorRole).slice(0,20),actorTeam:Number.isInteger(Number(item.actorTeam))?Number(item.actorTeam):null})):[];
  if(!('activeTeamId' in s))s.activeTeamId=null;
  if(!('pendingBattle' in s))s.pendingBattle=null;
  if(!('pendingCard' in s))s.pendingCard=null;
  if(!('lastCardResult' in s))s.lastCardResult=null;
  s.cardCursors={fate:0,chance:0,...(s.cardCursors&&typeof s.cardCursors==='object'?s.cardCursors:{})};
  Object.keys(s.cardCursors).forEach(kind=>{const length=G.CARD_DECKS?.[kind]?.length||1;s.cardCursors[kind]=Math.max(0,Math.floor(Number(s.cardCursors[kind])||0))%length;});
  s.cardSeq=Math.max(0,Math.floor(Number(s.cardSeq)||0));
  if(!('lastPurchase' in s))s.lastPurchase=null;
  if(!('lastRedemption' in s))s.lastRedemption=null;
  if(!('lastForeclosure' in s))s.lastForeclosure=null;
  if(!('lastJailBattle' in s))s.lastJailBattle=null;
  if(!('ceremonyStep' in s))s.ceremonyStep=['settle','ended'].includes(s.phase)?5:0;
  else s.ceremonyStep=Math.max(0,Math.min(5,Math.floor(Number(s.ceremonyStep)||0)));
  s.settings=s.settings||G.clone(G.DEFAULTS);
  if(Number(s.settings.economyVersion||0)<2){
    const replace=(path,legacy,value)=>{const parts=path.split('.');let target=s.settings;for(let i=0;i<parts.length-1;i++){target=target?.[parts[i]];if(!target)return;}const key=parts.at(-1);if(Number(target[key])===legacy)target[key]=value;};
    [['bankShare',50,25],['levels.1.up',6,20],['levels.2.up',12,35],['attacks.quake.cost',4,25],['attacks.quake.repair',300,350],['attacks.missile.cost',3,22],['attacks.missile.repair',400,450],['attacks.typhoon.cost',4,22],['attacks.typhoon.eyeBonus',200,0],['attacks.wildfire.cost',3,18],['gambles.0.cost',1,5],['gambles.1.cost',2,10],['gambles.2.cost',4,15],['gambles.3.cost',6,25],['buffs.pass.cost',3,12],['buffs.reroll.cost',2,10],['buffs.shield.cost',4,15]].forEach(args=>replace(...args));
    s.settings.economyVersion=2;
  }
  s.settings.stages=Array.isArray(s.settings.stages)?s.settings.stages:G.clone(G.DEFAULTS.stages);
  s.settings.stages=G.DEFAULTS.stages.map((fallback,index)=>({...fallback,...(s.settings.stages[index]||{})}));
  s.settings.gambles=G.DEFAULTS.gambles.map((fallback,index)=>({...fallback,...(s.settings.gambles?.[index]||{}),rewards:[...(fallback.rewards||[])],maxPerGame:Number(fallback.maxPerGame)||0}));
  s.settings.economyVersion=Math.max(3,Number(s.settings.economyVersion)||0);
  if(!Number.isFinite(Number(s.settings.battleLossMultiplier)))s.settings.battleLossMultiplier=G.DEFAULTS.battleLossMultiplier;
  s.unlocked=Array.isArray(s.unlocked)?s.unlocked.filter(index=>G.STAGE_IDX.includes(Number(index))).map(Number):[];
  s.publicFeed=Array.isArray(s.publicFeed)?s.publicFeed:[];
  s.stageNotices=Array.isArray(s.stageNotices)?s.stageNotices:[];
  s.stageNoticeSeq=Number(s.stageNoticeSeq)||0;
  s.viewers=Array.isArray(s.viewers)?s.viewers.filter(viewer=>viewer&&Number.isInteger(Number(viewer.teamId))&&s.teams?.[Number(viewer.teamId)]).map(viewer=>({
    id:text(viewer.id).slice(0,80),teamId:Number(viewer.teamId),name:text(viewer.name).slice(0,40),
    status:['pending','approved','rejected','removed'].includes(viewer.status)?viewer.status:'removed',
    sessionTokenHash:text(viewer.sessionTokenHash),requestedAt:text(viewer.requestedAt,now()),approvedAt:text(viewer.approvedAt),lastSeenAt:text(viewer.lastSeenAt),removedAt:text(viewer.removedAt),
  })).filter(viewer=>viewer.id&&viewer.name):[];
  s.presetRolls = s.presetRolls && typeof s.presetRolls === 'object' ? s.presetRolls : {};
  s.rollDiceCounts = s.rollDiceCounts && typeof s.rollDiceCounts === 'object' ? s.rollDiceCounts : {};
  ensureTeamAccessCodes(s,(s.teams||[]).length);
  if(!Number.isFinite(Number(s.settings.diceCount)))s.settings.diceCount=1;
  (s.teams||[]).forEach((t,teamIndex)=>{
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
    const physicalReceipts=(s.receipts||[]).filter(receipt=>Number(receipt.teamId)===teamIndex&&receipt.category==='physical_item');
    t.itemPurchases=t.itemPurchases&&typeof t.itemPurchases==='object'?t.itemPurchases:{};
    (s.settings.gambles||[]).forEach((item,index)=>{
      const itemKey=`g${index}`,receiptCount=physicalReceipts.filter(receipt=>String(receipt.reason||'').includes(`「${item.name}」`)).length;
      t.itemPurchases[itemKey]=Math.max(0,Number(t.itemPurchases[itemKey])||0,receiptCount,Number(t.items[itemKey])||0);
    });
    const latestPhysicalRound=physicalReceipts.reduce((latest,receipt)=>Math.max(latest,Number(receipt.round)||0),0);
    t.physicalPurchaseRound=Math.max(0,Number(t.physicalPurchaseRound)||0,latestPhysicalRound);
    if(!('lastDice' in t))t.lastDice=null;
    if(!('cardIntel' in t))t.cardIntel=null;
    t.jail=0;
    t.jailedThisTurn=false;
  });
  return s;
}

function validAccessEntry(entry){return Boolean(entry&&/^T-[2-9A-HJ-KM-NP-Z]{5}$/.test(entry.teamCode||'')&&/^V-[2-9A-HJ-KM-NP-Z]{5}$/.test(entry.viewerCode||''));}
export function ensureTeamAccessCodes(state,teamCount=(state.teams||[]).length){
  const current=Array.isArray(state.accessCodes)?state.accessCodes:[],usedTeam=new Set(),usedViewer=new Set();let changed=current.length!==teamCount;
  const uniqueCode=(prefix,used)=>{let code='';do{code=randomAccessCode(prefix);}while(used.has(code));used.add(code);return code;};
  state.accessCodes=Array.from({length:teamCount},(_,index)=>{
    const entry=current[index],teamCode=String(entry?.teamCode||'').toUpperCase(),viewerCode=String(entry?.viewerCode||'').toUpperCase();
    const validTeam=validAccessEntry({teamCode,viewerCode:entry?.viewerCode})&&!usedTeam.has(teamCode);
    const validViewer=validAccessEntry({teamCode:entry?.teamCode,viewerCode})&&!usedViewer.has(viewerCode);
    const finalTeam=validTeam?teamCode:uniqueCode('T',usedTeam);
    const finalViewer=validViewer?viewerCode:uniqueCode('V',usedViewer);
    if(!validTeam||!validViewer)changed=true;
    usedTeam.add(finalTeam);usedViewer.add(finalViewer);
    return {teamCode:finalTeam,viewerCode:finalViewer};
  });
  return changed;
}

function findTeamByAccessCode(state,code,kind='team'){
  const target=String(code||'').trim().toUpperCase(),key=kind==='team'?'teamCode':'viewerCode';
  const index=(state.accessCodes||[]).findIndex(entry=>entry[key]===target);
  return index>=0?index:null;
}

export async function resolveAccessCode(state,kind,value){
  const key=kind==='team'?'teamCode':kind==='viewer'?'viewerCode':null,code=text(value).toUpperCase();if(!key||!code)return null;
  for(let teamId=0;teamId<(state.accessCodes||[]).length;teamId++)if(await verifyAccessCode(code,state.accessCodes[teamId]?.[key]))return teamId;
  return null;
}

function publicViewerRecord(viewer,online=false){return {id:viewer.id,teamId:viewer.teamId,name:viewer.name,status:viewer.status,requestedAt:viewer.requestedAt,approvedAt:viewer.approvedAt,lastSeenAt:viewer.lastSeenAt,removedAt:viewer.removedAt,online:Boolean(online)};}
function revokeTeamViewers(state,teamId,status='removed'){
  const timestamp=now();(state.viewers||[]).forEach(viewer=>{if(Number(viewer.teamId)!==Number(teamId)||!['pending','approved'].includes(viewer.status))return;viewer.status=status;viewer.sessionTokenHash='';viewer.removedAt=timestamp;});
}

function publicCeremonyReveal(state){
  const step=Math.max(0,Math.min(5,Number(state.ceremonyStep)||0)),ranked=G.rankTeams(state),podium=[];
  if(step>=1&&ranked[2])podium.push({rank:3,teamId:ranked[2].id,worth:ranked[2].worth});
  if(step>=2&&ranked[1])podium.push({rank:2,teamId:ranked[1].id,worth:ranked[1].worth});
  if(step>=3&&ranked[0])podium.push({rank:1,teamId:ranked[0].id,worth:ranked[0].worth});
  const awards=step>=4&&ranked.length?{
    cash:[...ranked].sort((a,b)=>b.cash-a.cash||a.id-b.id)[0]?.id,
    property:[...ranked].sort((a,b)=>b.prop-a.prop||a.id-b.id)[0]?.id,
    points:[...ranked].sort((a,b)=>b.pts-a.pts||a.id-b.id)[0]?.id,
  }:null;
  return {step,podium,awards,full:step>=5};
}

function redactTeam(team){
  return {...team,cash:null,pts:null,buffs:null,items:null,itemPurchases:null,physicalPurchaseRound:null,battles:null,discount:null,attackRounds:null,lastDice:null,cardIntel:null};
}

export function projectStateForActor(fullState,actor={role:'viewer',teamId:null},onlineViewerIds=new Set()){
  const projected=G.clone(fullState),role=actor?.role||'viewer',teamId=Number.isInteger(actor?.teamId)?actor.teamId:null;
  if(role==='dev'||role==='system')return projected;
  delete projected.recentActions;
  delete projected.gameplayActivityAt;
  if(role==='host'){projected.viewers=(projected.viewers||[]).map(viewer=>publicViewerRecord(viewer,onlineViewerIds.has(viewer.id)));return projected;}
  const reveal=publicCeremonyReveal(fullState),resultsPublic=reveal.full;
  projected.ceremonyReveal=reveal;
  projected.myViewerCode=role==='team'&&teamId!==null?fullState.accessCodes?.[teamId]?.viewerCode||null:null;
  projected.viewerRoster=role==='team'&&teamId!==null?(fullState.viewers||[]).filter(viewer=>Number(viewer.teamId)===teamId).map(viewer=>publicViewerRecord(viewer,onlineViewerIds.has(viewer.id))):[];
  delete projected.viewers;
  delete projected.accessCodes;
  delete projected.cardCursors;
  const viewerApproved=role!=='viewer'||Boolean(actor?.viewerId&&(fullState.viewers||[]).some(viewer=>viewer.id===actor.viewerId&&viewer.status==='approved'&&Number(viewer.teamId)===teamId));
  const canSeeOwn=teamId!==null&&(role==='team'||(role==='viewer'&&viewerApproved));
  projected.receipts=(canSeeOwn?(fullState.receipts||[]).filter(receipt=>Number(receipt.teamId)===teamId):[]);
  projected.log=(fullState.publicFeed||[]).map(entry=>String(entry?.message||entry)).slice(0,80);
  projected.publicFeed=G.clone(fullState.publicFeed||[]);
  projected.teams=(fullState.teams||[]).map((team,index)=>{if(canSeeOwn&&index===teamId)return G.clone(team);const safe=redactTeam(G.clone(team));if(resultsPublic){safe.cash=team.cash;safe.pts=team.pts;}return safe;});
  if(projected.lastRoll&&Number(projected.lastRoll.team)!==teamId)projected.lastRoll={...projected.lastRoll,note:'完成移動'};
  if(projected.lastPurchase&&Number(projected.lastPurchase.team)!==teamId)projected.lastPurchase=null;
  if(projected.lastRedemption&&Number(projected.lastRedemption.team)!==teamId)projected.lastRedemption=null;
  return projected;
}

function socketSend(ws,payload){
  try{ws.send(JSON.stringify(payload));return true;}catch{return false;}
}

function rememberProcessedAction(state,actionId,rev,actor={}){
  if(!actionId)return;
  const id=text(actionId).slice(0,80);
  state.recentActions=[{id,rev:Number(rev)||0,at:Date.now(),actorRole:text(actor.role).slice(0,20),actorTeam:Number.isInteger(Number(actor.teamId))?Number(actor.teamId):null},...(state.recentActions||[]).filter(item=>item.id!==id)].slice(0,MAX_RECENT_ACTIONS);
}

function appendReceipts(previous,next,action,actionId=''){
  next.receipts=Array.isArray(next.receipts)?next.receipts:[];
  next.receiptSeq=Number(next.receiptSeq)||0;
  const transactions=Array.isArray(next._transactions)?next._transactions:[],createdAt=now();
  const expectedCash=(next.teams||[]).map((team,i)=>Number(team.cash||0)-Number(previous?.teams?.[i]?.cash||0));
  const expectedPts=(next.teams||[]).map((team,i)=>Number(team.pts||0)-Number(previous?.teams?.[i]?.pts||0));
  const ledgerCash=(next.teams||[]).map(()=>0),ledgerPts=(next.teams||[]).map(()=>0);
  let ledgerBank=0;
  transactions.forEach(tx=>{ledgerBank+=Number(tx.bankDelta)||0;(tx.entries||[]).forEach(entry=>{const i=Number(entry.teamId);if(!Number.isInteger(i)||!next.teams?.[i])return;ledgerCash[i]+=Number(entry.cashDelta)||0;ledgerPts[i]+=Number(entry.ptsDelta)||0;});});
  const expectedBank=Number(next.bank||0)-Number(previous?.bank||0);
  const mismatch=expectedCash.some((delta,i)=>delta!==ledgerCash[i]||expectedPts[i]!==ledgerPts[i])||expectedBank!==ledgerBank;
  if(mismatch)return `金流安全檢查未通過（${action}），本次操作已取消`;

  const runningCash=(previous?.teams||[]).map(team=>Number(team.cash)||0),runningPts=(previous?.teams||[]).map(team=>Number(team.pts)||0);
  const newReceipts=[];
  transactions.forEach((tx,txIndex)=>{
    const transactionId=`${actionId||`rev-${Number(next.rev||0)+1}`}-${txIndex+1}`;
    (tx.entries||[]).forEach(entry=>{
      const teamId=Number(entry.teamId),cashDelta=Number(entry.cashDelta)||0,ptsDelta=Number(entry.ptsDelta)||0;if(!next.teams?.[teamId]||((!cashDelta&&!ptsDelta)&&!tx.allowZero&&!entry.displayCash))return;
      const beforeCash=runningCash[teamId],beforePts=runningPts[teamId];runningCash[teamId]+=cashDelta;runningPts[teamId]+=ptsDelta;
      if(!cashDelta&&!ptsDelta&&!tx.allowZero&&!entry.displayCash)return;
      newReceipts.push({id:++next.receiptSeq,transactionId,teamId,actorTeam:tx.actorTeam!==null&&tx.actorTeam!==undefined&&Number.isInteger(Number(tx.actorTeam))?Number(tx.actorTeam):null,counterpartyTeamId:entry.counterpartyTeamId!==null&&entry.counterpartyTeamId!==undefined&&Number.isInteger(Number(entry.counterpartyTeamId))?Number(entry.counterpartyTeamId):null,round:Number(next.round)||1,phase:next.phase,cashDelta,ptsDelta,displayCash:Boolean(entry.displayCash),beforeCash,afterCash:runningCash[teamId],beforePts,afterPts:runningPts[teamId],reason:String(entry.reason||'資源異動').slice(0,220),category:String(tx.category||'other'),tileIndex:tx.tileIndex!==null&&tx.tileIndex!==undefined&&Number.isInteger(Number(tx.tileIndex))?Number(tx.tileIndex):null,attackKind:tx.attackKind||null,action,createdAt});
    });
  });
  next.receipts=[...newReceipts.reverse(),...next.receipts];
  if(next.receipts.length>240)next.receipts=next.receipts.slice(0,240);
  return null;
}

const HOST_ACTIONS=new Set(['assignBases','startGame','pauseGame','resumeGame','nextPhase','settleGame','setCeremonyStep','endGame','setMarket','allowRoll','testRoll','setPresetRoll','clearPresetRoll','resolveBattle','resolveCard','redeemPhysical','unlock','regenerateAccessCode','adjustCash','adjustPts','renameTeams','setConfig','setConfigs']);

const TEAM_ADMIN_ACTIONS=new Set(['approveViewer','rejectViewer','removeViewer','regenerateOwnViewerCode']);
const TEAM_ACTIONS=new Set(['roll','reroll','battle','resolveLanding','leaveTeam','attack','gamble','buff','upgrade','sell','buyBack',...TEAM_ADMIN_ACTIONS]);
const TEAM_ACTION_PHASES=new Map([['roll','roll'],['reroll','roll'],['battle','roll'],['resolveLanding','roll'],['attack','roll'],['gamble','shop'],['buff','shop'],['upgrade','sell'],['sell','sell'],['buyBack','sell']]);
const CONFIG_RANGES={lapBonus:[0,1000000],taxAmount:[0,1000000],casinoCost:[0,1000000],blackDiscount:[1,100],bankShare:[0,100],diceSides:[2,20],diceCount:[1,10],passRatio:[0,100],battleLossMultiplier:[100,300]};
function configRange(path){ if(CONFIG_RANGES[path])return CONFIG_RANGES[path];if(/^stages\.\d+\.(cash|pts)$/.test(path))return [-1000000,1000000];return /^(levels\.\d+\.(stay|up|sell|tax)|attacks\.(quake|missile|typhoon|wildfire)\.(cost|repair)|attacks\.typhoon\.eyeBonus|buffs\.(pass|reroll|shield)\.cost|gambles\.\d+\.cost)$/.test(path)?[0,1000000]:null; }
function updateConfig(settings,path,rawValue){
  const range=configRange(path),value=Number(rawValue);
  if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])return '設定值超出允許範圍';
  const parts=path.split('.');let target=settings;
  for(let i=0;i<parts.length-1;i++){target=target?.[parts[i]];if(!target)return '設定路徑錯誤';}
  const key=parts.at(-1);if(!(key in target))return '設定路徑錯誤';target[key]=value;return null;
}
export function teamActionError(state,action){
  if(action==='leaveTeam'||TEAM_ADMIN_ACTIONS.has(action))return null;
  if(state.phase==='setup')return '遊戲尚未開始';
  if(state.phase==='ended')return '活動已經結束';
  if(state.paused)return '活動目前已暫停';
  const required=TEAM_ACTION_PHASES.get(action);
  return required&&state.phase!==required?'目前階段不能執行這個操作':null;
}

function safePublicEvent(state,eventType,actor,payload={}){
  const actorTeam=Number.isInteger(actor?.teamId)?state.teams?.[actor.teamId]:null;
  if(eventType==='roll'||eventType==='testRoll'){
    const last=state.lastRoll,team=state.teams?.[last?.team],kind=G.TRACK[last?.targetPos??team?.pos]?.[0],stageIndex=kind==='stage'?G.STAGE_IDX.indexOf(last?.targetPos??team?.pos):-1;
    return stageIndex>=0&&state.unlocked.includes(last?.targetPos??team?.pos)?`${team?.name||'隊伍'} 完成「${state.settings.stages?.[stageIndex]?.name||'關卡'}」`:`${team?.name||'隊伍'} 完成移動，抵達第 ${Number(last?.targetPos??team?.pos)+1} 格`;
  }
  if(eventType==='attack'){const attack=state.lastAttack,team=state.teams?.[attack?.team];return `${team?.name||actorTeam?.name||'隊伍'} 發動「${attack?.name||'特殊操作'}」`;}
  if(eventType==='unlock'){const index=G.STAGE_IDX.indexOf(Number(payload.index));return `五大關「${state.settings.stages?.[index]?.name||'關卡'}」正式解鎖`;}
  if(eventType==='assignBases')return '人生起點抽籤完成，各隊基地已分配';
  if(eventType==='startGame')return '人生大富翁正式開始';
  if(eventType==='pauseGame')return '主持人暫停了活動';
  if(eventType==='resumeGame')return '主持人恢復了活動';
  if(eventType==='nextPhase')return `遊戲進入「${state.phase}」階段`;
  if(eventType==='setMarket')return `本回合房市公布：${state.settings.marketNames?.[state.market]||state.market}`;
  if(eventType==='allowRoll')return `主持人允許 ${state.teams?.[Number(payload.teamId)]?.name||'指定隊伍'} 使用 ${Number(payload.diceCount)||Number(state.rollDiceCounts?.[Number(payload.teamId)])||1} 顆骰子`;
  if(eventType==='resolveLanding'&&/逃漏稅|挑戰主持人/.test(String(state.log?.[0]||'')))return String(state.log[0]);
  if(eventType==='resolveBattle')return /挑戰主持人|逃漏稅法拍|逃過追查/.test(String(state.log?.[0]||''))?String(state.log[0]):'BATTLE 已完成裁決';
  if(eventType==='resolveCard'){const result=state.lastCardResult,card=G.cardById(result?.cardType,result?.cardId),team=state.teams?.[result?.teamId];return `${team?.name||'隊伍'} 完成${result?.cardType==='chance'?'機會':'命運'}卡「${card?.name||'挑戰'}」`;}
  if(eventType==='redeemPhysical'){const team=state.teams?.[Number(payload.teamId)],item=state.settings.gambles?.[Number(payload.itemIndex)];return `${team?.name||'隊伍'} 完成實體物品「${item?.name||'獎項'}」兌換`;}
  if(eventType==='settleGame')return '活動進入最終頒獎典禮';
  if(eventType==='setCeremonyStep')return '主持人推進了頒獎典禮';
  if(eventType==='endGame'||eventType==='forceEnd'||eventType==='idleTimeout')return '活動已正式結束';
  if(eventType==='teamJoin')return `${actorTeam?.name||'隊伍'} 已加入活動`;
  if(eventType==='teamLeave')return `${actorTeam?.name||'隊伍'} 已離線`;
  return null;
}

export class GameRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.loaded=false;this.state=null;this.meta=null;this.gameId=null;this.lastActivityAt=0;this.kickedTeams=new Set();
    this.actionQueue = Promise.resolve();
    this.processedActions = new Map();
    this.viewerRequestCooldown = new Map();
    try{
      if(this.ctx.setWebSocketAutoResponse&&globalThis.WebSocketRequestResponsePair){
        this.ctx.setWebSocketAutoResponse(new globalThis.WebSocketRequestResponsePair('ping','pong'));
      }
    }catch{}
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
      let dbState={};try{dbState=JSON.parse(row.state_json||'{}');}catch{}
      const cachedRev=Number(cached?.rev)||0,dbRev=Number(dbState?.rev)||0;
      const source=cached&&cachedRev>=dbRev?cached:dbState,hadCodes=Array.isArray(source.accessCodes)&&source.accessCodes.length===row.team_count&&source.accessCodes.every(validAccessEntry),hadViewers=Array.isArray(source.viewers);
      this.state=normalizeGameState(source); this.loaded=true;
      this.processedActions=new Map((this.state.recentActions||[]).map(item=>[item.id,{rev:item.rev,time:item.at}]));
      const dbActivity=Date.parse(row.updated_at)||Date.now(),stateActivity=Number(this.state.gameplayActivityAt)||0;
      this.lastActivityAt=Math.max(storedActivity,stateActivity)||(dbActivity);
      this.state.gameplayActivityAt=this.lastActivityAt;
      if(!cached||dbRev>cachedRev||!hadCodes||!hadViewers) await this.ctx.storage.put('state',this.state);
      if((!hadCodes||!hadViewers)&&this.env.DB?.prepare)await this.env.DB.prepare('UPDATE games SET state_json=? WHERE id=?').bind(JSON.stringify(this.state),this.gameId).run();
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
    const last=this.lastActivityAt||Date.parse(row.updated_at)||Date.now();
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
    const rawMessage=typeof message==='string'?message:new TextDecoder().decode(message);
    if(rawMessage==='ping'){try{ws.send('pong');}catch{}return;}
    let m;try{m=JSON.parse(rawMessage);}catch{return socketSend(ws,{type:'error',error:'訊息格式錯誤'});}
    let actor=ws.deserializeAttachment?.()||{role:'pending',teamId:null};
    if(actor.role==='pending'){
      if(m.type!=='hello') return socketSend(ws,{type:'error',error:'請先完成登入'});
      const role=String(m.role||'');let teamId=null,viewer=null;
      if(role==='viewer_request'){
        teamId=await resolveAccessCode(this.state,'viewer',m.accessToken);const viewerName=text(m.viewerName).replace(/\s+/g,' ').slice(0,40),nameLength=Array.from(viewerName).length;
        if(teamId===null||nameLength<1||nameLength>20){ws.close(1008,'代碼無效或已更新');return;}
        const cooldownKey=`${teamId}:${viewerName.toLocaleLowerCase()}`,lastRequest=this.viewerRequestCooldown.get(cooldownKey)||0,activeRequest=(this.state.viewers||[]).find(item=>Number(item.teamId)===teamId&&item.name.toLocaleLowerCase()===viewerName.toLocaleLowerCase()&&item.status==='pending');
        if(!activeRequest&&Date.now()-lastRequest<3000){socketSend(ws,{type:'error',error:'申請送出過於頻繁，請稍候再試'});return;}
        this.viewerRequestCooldown.set(cooldownKey,Date.now());
        const next=G.clone(this.state),existing=(next.viewers||[]).find(item=>Number(item.teamId)===teamId&&item.name.toLocaleLowerCase()===viewerName.toLocaleLowerCase()&&['pending','approved'].includes(item.status));
        if(existing?.status==='approved'){socketSend(ws,{type:'viewer_request_rejected',message:'這個署名已在批准名單；若要更換裝置，請先請隊輔移除舊資格'});ws.close(4007,'viewer-name-already-approved');return;}
        viewer=existing?.status==='pending'?existing:{id:randomHex(12),teamId,name:viewerName,status:'pending',sessionTokenHash:'',requestedAt:now(),approvedAt:'',lastSeenAt:'',removedAt:''};
        if(!existing||existing.status!=='pending')next.viewers.push(viewer);else{viewer.requestedAt=now();}
        const archived=next.viewers.filter(item=>Number(item.teamId)===teamId&&['rejected','removed'].includes(item.status)).sort((a,b)=>String(b.removedAt||b.requestedAt).localeCompare(String(a.removedAt||a.requestedAt)));
        if(archived.length>60){const removeIds=new Set(archived.slice(60).map(item=>item.id));next.viewers=next.viewers.filter(item=>!removeIds.has(item.id));}
        next.log.unshift(`${next.teams[teamId].name} 收到具名觀眾申請`);next.rev=(this.state.rev||0)+1;
        actor=this.withPresence({role:'viewer_pending',teamId,viewerId:viewer.id},m);ws.serializeAttachment(actor);await this.commit(next,actor,'viewerRequest',{viewerId:viewer.id});
        socketSend(ws,{type:'viewer_pending',viewerId:viewer.id,viewerName:viewer.name,teamId,teamName:this.state.teams[teamId]?.name,gameId:this.meta.id,gameName:this.meta.name});return;
      }
      if(role==='viewer'&&m.viewerId&&m.sessionToken){
        viewer=(this.state.viewers||[]).find(item=>item.id===text(m.viewerId)&&item.status==='approved');
        if(!viewer||!(await verifySecret(m.sessionToken,viewer.sessionTokenHash))){ws.close(1008,'觀眾資格已失效');return;}
        teamId=Number(viewer.teamId);actor=this.withPresence({role:'viewer',teamId,viewerId:viewer.id},m);ws.serializeAttachment(actor);
        const next=G.clone(this.state),saved=next.viewers.find(item=>item.id===viewer.id);if(saved)saved.lastSeenAt=now();next.rev=(this.state.rev||0)+1;await this.commit(next,actor,'viewerOnline',{viewerId:viewer.id});
      }else if(role==='viewer'&&!m.viewerId&&!m.sessionToken){actor=this.withPresence({role:'viewer',teamId:null},m);ws.serializeAttachment(actor);
      }else if(role==='host'){
        const ok=(this.env.ADMIN_PASSWORD_HASH&&await verifySecret(m.accessToken,this.env.ADMIN_PASSWORD_HASH))||await verifySecret(m.token,this.meta.hostTokenHash);if(!ok){ws.close(1008,'授權失敗');return;}actor=this.withPresence({role:'host',teamId:null},m);ws.serializeAttachment(actor);
      }else if(role==='team'){
        teamId=await resolveAccessCode(this.state,'team',m.accessToken);if(teamId===null){ws.close(1008,'代碼無效或已更新');return;}actor=this.withPresence({role:'team',teamId},m);ws.serializeAttachment(actor);
        if(this.state.teams[teamId]&&!this.state.teams[teamId].joined){this.kickedTeams.delete(teamId);const next=G.clone(this.state);next.teams[teamId].joined=true;next.log.unshift(`${next.teams[teamId].name} 已加入活動`);await this.commit(next,actor,'teamJoin',{});}
      }else{ws.close(1008,'授權失敗');return;}
      socketSend(ws,{type:'hello_ok',state:projectStateForActor(this.state,actor,this.onlineViewerIds()),meta:{id:this.meta.id,name:this.meta.name,status:statusOf(this.state),teamCount:this.meta.teamCount,teamId:actor.teamId,viewerId:actor.viewerId||null,viewerName:viewer?.name||null}});
      if(actor.role==='host')socketSend(ws,{type:'presence',teams:this.teamPresence(),serverTime:Date.now()});
      if(actor.role==='team')this.broadcastPresence();
      return;
    }
    if(m.type==='ping') return socketSend(ws,{type:'pong'});
    if(m.type==='presence'){
      actor={...actor,lastSeenAt:Date.now(),quality:['live','degraded','offline'].includes(m.quality)?m.quality:'live',lastRev:Math.max(0,Number(m.lastRev)||0)};
      ws.serializeAttachment(actor);
      if(actor.role==='team')this.broadcastPresence();
      return socketSend(ws,{type:'presence_ok',serverTime:Date.now()});
    }
    if(m.type!=='action') return;
    const actionId=text(m.actionId).slice(0,80);
    const fail=error=>socketSend(ws,{type:'error',error,actionId});

    const durableAction=actionId&&(this.processedActions.get(actionId)||(this.state.recentActions||[]).find(item=>item.id===actionId));
    if(durableAction){
      const cached = durableAction;
      return socketSend(ws,{type:'action_ok',actionId,rev:cached.rev});
    }

    if(actor.role==='host'&&m.action==='kickTeam'){
      const teamId=Number(m.payload?.teamId);
      if(!Number.isInteger(teamId)||!this.state.teams[teamId]) return fail('隊伍編號錯誤');
      this.kickTeam(teamId);
      const next=G.clone(this.state); next.teams[teamId].joined=false; next.log.unshift(`${next.teams[teamId].name} 已被主持人踢出，即時連線已關閉`); next.rev=(this.state.rev||0)+1;rememberProcessedAction(next,actionId,next.rev,actor);
      await this.commit(next,actor,'kickTeam',{teamId,actionId});
      if(actionId){ this.processedActions.set(actionId, {rev:next.rev, time:Date.now()}); }
      socketSend(ws,{type:'action_ok',actionId,rev:next.rev});
      return;
    }
    if((actor.role==='host'&&!HOST_ACTIONS.has(m.action))||(actor.role==='team'&&!TEAM_ACTIONS.has(m.action))||['viewer','viewer_pending'].includes(actor.role))return fail('你的角色不能執行這個操作');
    if(actor.role==='team'){
      const phaseError=teamActionError(this.state,m.action);if(phaseError)return fail(phaseError);
    }
    try{
      const next=G.clone(this.state);
      next._transactions=[];
      let viewerSessionToken='';const actionPayload={...(m.payload||{})};
      if(actor.role==='team'&&m.action==='approveViewer'){viewerSessionToken=randomHex(24);actionPayload.sessionTokenHash=await hashSecret(viewerSessionToken);}
      const result=this.applyAction(next,actor,m.action,actionPayload);
      if(result?.error)return fail(result.error);
      const transactionActorTeam=['roll','testRoll'].includes(m.action)?Number(next.lastRoll?.team):m.action==='attack'?Number(next.lastAttack?.team):actor.teamId!==null&&actor.teamId!==undefined?Number(actor.teamId):null;
      (next._transactions||[]).forEach(tx=>{tx.actorTeam=Number.isInteger(transactionActorTeam)?transactionActorTeam:null;});
      const receiptError=appendReceipts(this.state,next,m.action,actionId);delete next._transactions;
      if(receiptError)return fail(receiptError);
      next.rev=(this.state.rev||0)+1;
      rememberProcessedAction(next,actionId,next.rev,actor);
      await this.commit(next,actor,m.action,{...(m.payload||{}),actionId});
      if(m.action==='regenerateAccessCode')this.invalidateAccessCode(Number(m.payload?.teamId),String(m.payload?.kind||''));
      if(m.action==='regenerateOwnViewerCode')this.invalidateAccessCode(actor.teamId,'viewer');
      if(m.action==='approveViewer')this.approveViewerSession(text(m.payload?.viewerId),viewerSessionToken);
      if(['rejectViewer','removeViewer'].includes(m.action))this.invalidateViewer(text(m.payload?.viewerId),m.action==='rejectViewer'?'觀眾申請未獲批准':'隊輔已移除這位觀眾');
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
      if(action==='approveViewer'||action==='rejectViewer'||action==='removeViewer'){
        const viewer=(s.viewers||[]).find(item=>item.id===text(p.viewerId));if(!viewer||Number(viewer.teamId)!==i)return {error:'找不到本隊觀眾'};
        if(action==='approveViewer'){
          if(viewer.status!=='pending'||!text(p.sessionTokenHash))return {error:'這筆申請已經處理'};
          viewer.status='approved';viewer.sessionTokenHash=text(p.sessionTokenHash);viewer.approvedAt=now();viewer.removedAt='';s.log.unshift(`${s.teams[i].name} 批准一位具名觀眾`);return;
        }
        if(action==='rejectViewer'){
          if(viewer.status!=='pending')return {error:'這筆申請已經處理'};
          viewer.status='rejected';viewer.sessionTokenHash='';viewer.removedAt=now();s.log.unshift(`${s.teams[i].name} 拒絕一位觀眾申請`);return;
        }
        if(viewer.status!=='approved')return {error:'這位觀眾目前不在已批准名單'};
        viewer.status='removed';viewer.sessionTokenHash='';viewer.removedAt=now();s.log.unshift(`${s.teams[i].name} 移除一位具名觀眾`);return;
      }
      if(action==='regenerateOwnViewerCode'){
        ensureTeamAccessCodes(s,s.teams.length);const used=new Set(s.accessCodes.map(entry=>entry.viewerCode));let code='';do{code=randomAccessCode('V');}while(used.has(code));s.accessCodes[i].viewerCode=code;revokeTeamViewers(s,i);s.log.unshift(`${s.teams[i].name} 重新產生本隊觀眾代碼`);return;
      }
      if(action==='leaveTeam'){s.teams[i].joined=false;s.log.unshift(`${s.teams[i].name} 已主動離開活動`);return;}
      if(action==='roll'){
        const t=s.teams[i];if(s.phase!=='roll'||t.rolled)return {error:'目前不能擲骰'};
        if(s.pendingBattle||s.pendingCard)return {error:'請先完成目前的停留事件、BATTLE 或卡片結算'};
        if(s.activeTeamId!==i)return {error:'請等待主持人允許你的隊伍擲骰'};
        let total, dice;
        if(s.presetRolls && typeof s.presetRolls[i] === 'number' && Number.isInteger(s.presetRolls[i]) && s.presetRolls[i] >= 1){
          total = s.presetRolls[i];
          dice = [total];
          delete s.presetRolls[i];
        } else {
          const count=Math.max(1,Math.min(10,Number(s.rollDiceCounts?.[i])||Number(s.settings.diceCount)||1)),sides=Math.max(2,Number(s.settings.diceSides)||6);
          dice=Array.from({length:count},()=>1+Math.floor(Math.random()*sides));
          total=dice.reduce((sum,n)=>sum+n,0);
        }
        G.applyMove(s,i,total,Math.random,dice);s.activeTeamId=null;return;
      }
      if(action==='reroll'){const t=s.teams[i];if(s.pendingBattle||s.pendingCard)return {error:'請先處理停留事件、BATTLE 或卡片結算'};if(t.buffs.reroll<=0||!t.rolled)return {error:'目前不能重骰'};t.buffs.reroll-=1;t.rolled=false;t.lastRoll=null;t.lastDice=null;s.activeTeamId=i;s.log.unshift(`${t.name} 使用重骰卡，已重新取得擲骰權限`);return;}
      if(action==='battle'||action==='resolveLanding'){const choice=action==='battle'?'battle':String(p.choice||'');const r=G.resolvePendingBattle(s,i,choice,{targetTeamId:p.targetTeamId});return r.ok?undefined:{error:r.msg};}
      if(action==='attack'){const kind=String(p.kind||''),useKey=`${Number(s.round)}:${i}:${kind}`;if(s.attackUsage?.[useKey]||Number(s.teams[i].attackRounds?.[kind])===Number(s.round))return {error:`「${s.settings.attacks?.[kind]?.name||'特殊操作'}」本回合已使用過`};const r=G.playAttack(s,i,kind,{targetTeamId:p.targetTeamId});if(!r.ok)return {error:r.msg};s.attackUsage={...(s.attackUsage||{}),[useKey]:true};return;}
      if(action==='gamble'){const r=G.buyGamble(s,i,Number(p.index));return r.ok?undefined:{error:r.msg};}
      if(action==='buff'){const r=G.buyBuff(s,i,p.kind);return r.ok?undefined:{error:r.msg};}
      if(action==='upgrade'){const r=G.upgradeBase(s,i);return r.ok?undefined:{error:r.msg};}
      if(action==='sell'){const r=G.sellBase(s,i);return r.ok?undefined:{error:r.msg};}
      if(action==='buyBack'){const r=G.buyBackBase(s,i);return r.ok?undefined:{error:r.msg};}
    }
    if(action==='assignBases'){if(s.phase!=='setup')return {error:'遊戲開始後不能重新抽籤'};G.assignBases(s);return;}
    if(action==='startGame'){if(s.phase!=='setup')return {error:'遊戲已開始或已結束'};if(s.teams.some(t=>t.baseIdx===null))return {error:'請先抽籤分配基地'};s.paused=false;s.phase='market';s.round=1;s.activeTeamId=null;s.rollDiceCounts={};s.ceremonyStep=0;s.pendingBattle=null;s.pendingCard=null;s.cardCursors={fate:0,chance:0};s.teams.forEach(team=>{team.cardIntel=null;});s.log.unshift('遊戲開始，第 1 回合（首回合免房屋稅）');return;}
    if(action==='pauseGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=true;s.log.unshift('主持人暫停了活動');return;}
    if(action==='resumeGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;if(s.phase==='settle'){s.phase='roll';s.ceremonyStep=0;}s.log.unshift('主持人恢復了活動');return;}
    if(action==='nextPhase'){if(s.phase==='ended')return {error:'活動已結束'};if(s.paused)return {error:'活動目前已暫停，請先恢復活動'};if(s.pendingBattle||s.pendingCard)return {error:'請先完成停留事件、BATTLE 或卡片結算'};const beforePhase=s.phase,beforeLog=s.log?.[0];G.nextPhase(s);if(s.log?.[0]===beforeLog)s.log.unshift(`主持人推進遊戲階段：${beforePhase} → ${s.phase}`);return;}
    if(action==='settleGame'){if(s.phase==='ended')return {error:'活動已結束'};s.paused=false;s.phase='settle';s.ceremonyStep=0;s.log.unshift('🏆 活動進入最終頒獎典禮，等待主持人揭曉');return;}
    if(action==='setCeremonyStep'){if(!['settle','ended'].includes(s.phase))return {error:'目前不是頒獎典禮階段'};const step=Number(p.step);if(!Number.isInteger(step)||step<0||step>5)return {error:'頒獎典禮進度錯誤'};s.ceremonyStep=step;s.log.unshift(`頒獎典禮進度：${step}/5`);return;}
    if(action==='endGame'){if(s.phase==='ended')return {error:'活動已結束'};const wasSettling=s.phase==='settle';s.paused=false;s.phase='ended';if(!wasSettling)s.ceremonyStep=5;s.log.unshift('活動結束，歷史紀錄已保存');return;}
    if(action==='setMarket'){const k=p.kind;if(!s.settings.marketOrder.includes(k))return {error:'房市狀態錯誤'};s.market=k;s.log.unshift(`房市公布：${s.settings.marketNames[k]}`);return;}
    if(action==='allowRoll'){
      if(s.phase!=='roll')return {error:'目前不是擲骰階段'};
      if(s.pendingBattle||s.pendingCard)return {error:'請先完成停留事件、BATTLE 或卡片結算'};
      const i=Number(p.teamId),t=s.teams[i],diceCount=Number(p.diceCount??s.settings.diceCount);if(!Number.isInteger(i)||!t)return {error:'隊伍編號錯誤'};
      if(!Number.isInteger(diceCount)||diceCount<1||diceCount>10)return {error:'骰子顆數必須為 1～10 顆'};
      if(t.rolled)return {error:'這一隊本回合不能再擲骰'};
      s.rollDiceCounts={...(s.rollDiceCounts||{}),[i]:diceCount};s.activeTeamId=i;s.log.unshift(`主持人允許 ${t.name} 使用 ${diceCount} 顆骰子`);return;
    }
    if(action==='setPresetRoll'){
      if(s.phase!=='roll'&&s.phase!=='setup')return {error:'目前不是擲骰或準備階段'};
      const i=Number(p.teamId), steps=Number(p.steps);
      if(!Number.isInteger(i)||!s.teams[i])return {error:'隊伍編號錯誤'};
      if(!Number.isInteger(steps)||steps<1||steps>48)return {error:'指定步數需介於 1 到 48 之間'};
      s.presetRolls = { ...(s.presetRolls||{}), [i]: steps };
      s.log.unshift(`[測試模式] 主持人預設 ${s.teams[i].name} 下次擲骰為 ${steps} 步`);
      return;
    }
    if(action==='clearPresetRoll'){
      const i=Number(p.teamId);
      if(s.presetRolls && s.presetRolls[i] !== undefined){
        delete s.presetRolls[i];
        s.log.unshift(`[測試模式] 取消 ${s.teams[i]?.name||'該隊'} 的預設步數`);
      }
      return;
    }
    if(action==='testRoll'){
      if(s.phase!=='roll')return {error:'目前不是擲骰階段'};
      if(s.pendingBattle||s.pendingCard)return {error:'請先完成停留事件、BATTLE 或卡片結算'};
      const i=Number(p.teamId), steps=Number(p.steps);
      if(!Number.isInteger(i)||!s.teams[i])return {error:'隊伍編號錯誤'};
      const t=s.teams[i];
      if(!Number.isInteger(steps)||steps<1||steps>48)return {error:'指定步數需介於 1 到 48 之間'};
      if(s.presetRolls) delete s.presetRolls[i];
      G.applyMove(s,i,steps,Math.random,[steps]);
      s.activeTeamId=null;
      s.log.unshift(`[測試模式] 主持人指定 ${t.name} 前進 ${steps} 步`);
      return;
    }
    if(action==='resolveBattle'){const r=G.adjudicateBattle(s,String(p.outcome||''));return r.ok?undefined:{error:r.msg};}
    if(action==='resolveCard'){const r=G.resolveCard(s,String(p.outcome||''));return r.ok?undefined:{error:r.msg};}
    if(action==='redeemPhysical'){const r=G.redeemPhysicalItem(s,Number(p.teamId),Number(p.itemIndex),Number(p.reward));return r.ok?undefined:{error:r.msg};}
    if(action==='unlock'){const i=Number(p.index),stageIndex=G.STAGE_IDX.indexOf(i),stage=s.settings.stages?.[stageIndex];if(stageIndex<0||!stage)return {error:'關卡格錯誤'};if(!s.unlocked.includes(i)){s.unlocked.push(i);s.stageNoticeSeq=Number(s.stageNoticeSeq||0)+1;s.stageNotices=[...(s.stageNotices||[]),{id:s.stageNoticeSeq,stageIndex,tileIndex:i,stage:G.clone(stage),createdAt:now()}].slice(-20);}s.log.unshift(`${stage.name}關卡解封（第 ${i+1} 格）`);return;}
    if(action==='regenerateAccessCode'){const i=Number(p.teamId),kind=String(p.kind||'');if(!s.teams[i]||!['team','viewer'].includes(kind))return {error:'登入代碼設定錯誤'};ensureTeamAccessCodes(s,s.teams.length);const key=kind==='team'?'teamCode':'viewerCode',used=new Set(s.accessCodes.map(entry=>entry[key]));let code='';do{code=randomAccessCode(kind==='team'?'T':'V');}while(used.has(code));s.accessCodes[i][key]=code;if(kind==='viewer')revokeTeamViewers(s,i);s.log.unshift(`主持人重新產生 ${s.teams[i].name} 的${kind==='team'?'隊輔':'觀眾'}代碼`);return;}
    if(action==='adjustCash'||action==='adjustPts'){const i=Number(p.teamId),amount=Number(p.amount);if(!s.teams[i]||!Number.isFinite(amount)||Math.abs(amount)>1000000)return {error:'調整值錯誤'};if(action==='adjustCash'){if(amount>=0)G.creditCash(s,i,amount,'主持人調整本隊現金',{category:'host_adjust'});else{const before=s.teams[i].cash;s.teams[i].cash+=amount;G.recordTransaction(s,{category:'host_adjust',entries:[{teamId:i,cashDelta:s.teams[i].cash-before,reason:'主持人調整本隊現金'}]});}}else G.changePoints(s,i,amount,'主持人調整本隊諂媚點數',{category:'host_adjust'});s.log.unshift(`${s.teams[i].name} ${action==='adjustCash'?'現金':'點數'} ${amount>0?'+':''}${amount}`);return;}
    if(action==='renameTeams'){if(!Array.isArray(p.names))return {error:'隊伍名稱格式錯誤'};s.teams.forEach((t,i)=>{const n=text(p.names[i],t.name).slice(0,30);if(n)t.name=n;});s.log.unshift('主持人更新了隊伍名稱');return;}
    if(action==='setConfig'){const path=String(p.path||''),error=updateConfig(s.settings,path,p.value);if(error)return {error};s.log.unshift(`主持人調整設定：${path}`);return;}
    if(action==='setConfigs'){if(!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>50)return {error:'設定清單格式錯誤'};for(const entry of p.entries){const error=updateConfig(s.settings,String(entry?.path||''),entry?.value);if(error)return {error};}s.log.unshift(`主持人儲存遊戲設定（${p.entries.length} 項）`);return;}
    return {error:'未知操作'};
  }
  async commit(next,actor,eventType,payload){
    if(Array.isArray(next.log)&&next.log.length>120)next.log=next.log.slice(0,120);
    next.publicFeed=Array.isArray(next.publicFeed)?next.publicFeed:[];
    const publicMessage=safePublicEvent(next,eventType,actor,payload);
    if(publicMessage)next.publicFeed.unshift({id:Number(next.rev)||0,message:publicMessage,eventType,createdAt:now()});
    if(next.publicFeed.length>80)next.publicFeed=next.publicFeed.slice(0,80);
    const prevState=this.state;
    const prevStatus=this.meta?.status;
    const prevActivity=this.lastActivityAt;
    const status=statusOf(next);
    const timestamp=now();
    const timestampMs=Date.parse(timestamp)||Date.now();
    const activityAt=PASSIVE_ACTIVITY_EVENTS.has(eventType)?(this.lastActivityAt||timestampMs):timestampMs;
    next.gameplayActivityAt=activityAt;
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
    if(this.ctx.storage?.put)try{await this.ctx.storage.put('state',next);}catch(error){console.error('DO state cache write failed; D1 remains authoritative',error);}
    this.lastActivityAt=activityAt;
    if(this.ctx.storage?.put)try{await this.ctx.storage.put('lastActivityAt',activityAt);}catch(error){console.error('DO activity cache write failed',error);}
    if(status==='ended'){ if(this.ctx.storage?.deleteAlarm) await this.ctx.storage.deleteAlarm(); }
    else { await this.armIdleAlarm(); }
    if(this.meta) this.meta.status=status;
    this.broadcast({type:'state',state:next,status,resolvedActionId:payload?.actionId});
  }
  kickTeam(teamId){ this.kickedTeams.add(teamId); for(const ws of this.ctx.getWebSockets()){ const a=ws.deserializeAttachment?.(); if(a?.role==='team'&&a.teamId===teamId){ try{ws.send(JSON.stringify({type:'kicked',message:'主持人已將你踢出活動'}));ws.close(4003,'kicked');}catch{} } } }
  onlineViewerIds(){return new Set((this.ctx.getWebSockets?.()||[]).map(ws=>ws.deserializeAttachment?.()).filter(actor=>actor?.role==='viewer'&&actor.viewerId).map(actor=>actor.viewerId));}
  withPresence(actor,message={}){const timestamp=Date.now();return {...actor,clientId:text(message.clientId).slice(0,80),connectedAt:timestamp,lastSeenAt:timestamp,quality:'live',lastRev:Math.max(0,Number(message.lastRev)||0)};}
  teamPresence(exclude=null){
    const grouped=new Map();
    for(const ws of this.ctx.getWebSockets?.()||[]){if(ws===exclude)continue;const actor=ws.deserializeAttachment?.();if(actor?.role!=='team'||!Number.isInteger(Number(actor.teamId)))continue;const teamId=Number(actor.teamId),record=grouped.get(teamId)||{teamId,deviceCount:0,lastSeenAt:0};record.deviceCount+=1;record.lastSeenAt=Math.max(record.lastSeenAt,Number(actor.lastSeenAt)||Number(actor.connectedAt)||0);grouped.set(teamId,record);}
    return [...grouped.values()].sort((a,b)=>a.teamId-b.teamId);
  }
  broadcastPresence(exclude=null){const payload={type:'presence',teams:this.teamPresence(exclude),serverTime:Date.now()};for(const socket of this.ctx.getWebSockets?.()||[]){const actor=socket.deserializeAttachment?.();if(actor?.role==='host')socketSend(socket,payload);}}
  approveViewerSession(viewerId,sessionToken){for(const ws of this.ctx.getWebSockets()){const actor=ws.deserializeAttachment?.();if(actor?.role==='viewer_pending'&&actor.viewerId===viewerId){socketSend(ws,{type:'viewer_approved',viewerId,sessionToken});}}}
  invalidateViewer(viewerId,message){for(const ws of this.ctx.getWebSockets()){const actor=ws.deserializeAttachment?.();if(actor?.viewerId===viewerId){try{socketSend(ws,{type:'viewer_access_revoked',message});ws.close(4006,'viewer-access-revoked');}catch{}}}}
  invalidateAccessCode(teamId,kind){for(const ws of this.ctx.getWebSockets()){const actor=ws.deserializeAttachment?.();const affected=kind==='team'?actor?.role==='team'&&actor.teamId===teamId:['viewer','viewer_pending'].includes(actor?.role)&&actor.teamId===teamId;if(affected){try{socketSend(ws,{type:'credentials_changed',message:'登入代碼已更新，請使用新代碼重新登入'});ws.close(4005,'credentials-changed');}catch{}}}}
  broadcast(message){const online=this.onlineViewerIds();for(const ws of this.ctx.getWebSockets()){try{const actor=ws.deserializeAttachment?.()||{role:'pending',teamId:null};if(actor.role==='pending'||actor.role==='viewer_pending')continue;const payload=message?.type==='state'?{...message,state:projectStateForActor(message.state,actor,online)}:message;ws.send(JSON.stringify(payload));}catch{}}}
  async webSocketClose(ws){
    const actor=ws.deserializeAttachment?.();
    if(actor?.role==='team')this.broadcastPresence(ws);
    if(actor?.role==='viewer'&&actor.viewerId){if(this.loaded&&this.state)this.broadcast({type:'state',state:this.state,status:statusOf(this.state)});return;}
    if(!actor || actor.role!=='team' || this.kickedTeams.has(actor.teamId) || !this.loaded || this.state?.phase==='ended' || !this.state?.teams?.[actor.teamId]?.joined) return;
    const stillConnected=this.ctx.getWebSockets().some(other=>other!==ws&&other.deserializeAttachment?.()?.role==='team'&&other.deserializeAttachment?.()?.teamId===actor.teamId);
    if(stillConnected)return;
    const next=G.clone(this.state); next.teams[actor.teamId].joined=false; next.log.unshift(`${next.teams[actor.teamId].name} 已離線`); next.rev=(this.state.rev||0)+1;
    try{ await this.commit(next,{role:'system',teamId:actor.teamId},'teamLeave',{}); }catch{}
  }
  webSocketError(){}
}
