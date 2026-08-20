const BUILD_VERSION = '2026.08.21.7';
import { G } from './game-core.js?v=2026.08.21.7';
import { PHASE_FX, ATTACK_FX, SoundFX, isSoundEnabled, toggleSound, classifyEvent, movementPath } from './game-fx.js?v=2026.08.21.7';

const App = {
  screen: 'home', entry: 'home', role: null, gameId: null, state: null, teamId: null,
  token: null, gameMeta: null, socket: null, connected: false,
  tab: 'main', zoom: false, dice: null, rolling: false, busy: false,
  highlight: [], cfg: false, history: [], lobbyTimer: null,
  access: {host: '', team: ''}, installPrompt: null,
  pendingAction: null, pendingTimer: null, actionSeq: 0, updateReady: false, applyingUpdate: false,
  sound: isSoundEnabled(), radarFocus: null, _radarTimer: null,
  fx: {phase:null,event:null,attack:null,aftershock:null,upgrade:null,dice:null,camera:null,positions:{},timers:{},stepText:''},
};



const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phaseNames = {setup:'準備中', lobby:'準備中', running:'進行中', market:'公布股市', sell:'出售基地', shop:'商店與道具', roll:'擲骰移動', ended:'已結束', paused:'已暫停'};
const roleNames = {host:'主持人', team:'隊輔', viewer:'觀眾'};


function accessKey(role){ return role === 'host' ? 'preview:admin-access' : 'preview:team-access'; }
function loadAccess(){ App.access.host=sessionStorage.getItem(accessKey('host'))||''; App.access.team=sessionStorage.getItem(accessKey('team'))||''; }
function saveAccess(role,password){ App.access[role]=password; sessionStorage.setItem(accessKey(role),password); }
function clearAccess(role){ App.access[role]=''; sessionStorage.removeItem(accessKey(role)); }
function navRolePath(){ return App.entry==='admin'?'/admin':App.entry==='team'?'/team':'/'; }
function updateNav(){ document.querySelectorAll('#bottomNav [data-route]').forEach(b=>{const active=b.dataset.route===navRolePath();b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}); }
function syncChrome(){ const inGame=App.screen==='game'; const nav=$('bottomNav'); if(nav)nav.hidden=inGame; document.body.classList.toggle('in-game',inGame); ['host','team','viewer'].forEach(role=>document.body.classList.toggle(`role-${role}`,inGame&&App.role===role)); updateNav(); syncUpdatePrompt(); }
function syncUpdatePrompt(){ const el=$('pwaUpdate');if(!el)return;el.hidden=!App.updateReady||App.screen==='game'; }
function showUpdatePrompt(){ App.updateReady=true;syncUpdatePrompt(); }
async function applyPwaUpdate(){
  if(App.screen==='game'){toast('已延後更新，離開遊戲後即可套用');return;}
  App.applyingUpdate=true;
  try{
    const reg=await navigator.serviceWorker?.getRegistration();
    if(reg?.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    else if(reg) await reg.update();
  }finally{
    // controllerchange normally reloads after the waiting worker activates.
    // Keep a slower fallback for browsers that do not emit the event reliably.
    setTimeout(()=>{if(!window.__pwaReloaded)location.reload();},1500);
  }
}
function registerPWA(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(App.applyingUpdate&&!window.__pwaReloaded){ window.__pwaReloaded=true; location.reload(); } });
  navigator.serviceWorker.register(`./sw.js?v=${BUILD_VERSION}`,{updateViaCache:'none'}).then(reg=>{
    const check=()=>{ if(reg.waiting) showUpdatePrompt(); }; check();
    reg.addEventListener('updatefound',()=>{ const w=reg.installing; if(w) w.addEventListener('statechange',()=>{ if(w.state==='installed'&&navigator.serviceWorker.controller) showUpdatePrompt(); }); });
    reg.update().catch(()=>{});
  }).catch(()=>{});
}
function enableInstallPrompt(){
  const b=$('installPwa'); if(!b) return;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();App.installPrompt=e;b.hidden=false;});
  b.onclick=async()=>{ if(App.installPrompt){await App.installPrompt.prompt();App.installPrompt=null;b.hidden=true;} else toast('iPhone 請使用分享選單的「加入主畫面」；Android 請從瀏覽器選單選擇「安裝 App」。'); };
}

function toast(msg, bad=false){
  const el = $('toast'); if(!el) return;
  el.textContent = msg; el.style.background = bad ? '#ffe0e0' : '#e6f6e4';
  el.style.display = 'block'; clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display='none'; }, 3400);
}
function ask(title, detail, onYes){
  $('cfTitle').textContent = title; $('cfBody').innerHTML = detail;
  $('confirm').style.display = 'flex';
  $('cfYes').onclick = () => { $('confirm').style.display='none'; onYes(); };
  $('cfNo').onclick = () => { $('confirm').style.display='none'; };
}
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
function fxTimeout(key,fn,delay){clearTimeout(App.fx.timers[key]);App.fx.timers[key]=setTimeout(()=>{delete App.fx.timers[key];fn();},delay);}
function renderFx(){if(App.screen==='game')render(true);}
function resetGameFx(){Object.values(App.fx.timers).forEach(clearTimeout);App.fx={phase:null,event:null,attack:null,aftershock:null,upgrade:null,dice:null,camera:null,positions:{},timers:{},stepText:''};App.highlight=[];}
function showPhaseFx(data){App.fx.phase=data;SoundFX.playPhaseChange();fxTimeout('phase',()=>{App.fx.phase=null;renderFx();},reducedMotion?700:1900);}
function showUpgradeFx(team){
  if(!team||team.baseIdx===null)return;
  App.fx.upgrade={tileIndex:team.baseIdx,teamId:team.id,teamName:team.name,level:team.level,color:team.color};
  SoundFX.playUpgrade();
  fxTimeout('upgrade',()=>{App.fx.upgrade=null;renderFx();},2000);
}
function showEventFx(message){
  const kind=classifyEvent(message);App.fx.event={message:String(message).slice(0,180),kind};
  if(/獲得|獎勵|買回|升級|取走/.test(message))SoundFX.playCoinReward();
  else if(/修繕|扣款|稅金|支付|進入監獄/.test(message))SoundFX.playAttackHit();
  fxTimeout('event',()=>{App.fx.event=null;renderFx();},reducedMotion?1500:3600);
}

function showAttackFx(attack,message,next){
  const preset=ATTACK_FX[attack?.kind];if(!preset)return false;
  App.fx.event=null;App.fx.attack={...preset,kind:attack.kind,message:String(message||'').slice(0,180),teamName:next.teams?.[attack.team]?.name||''};
  App.fx.aftershock=null;
  SoundFX.playAttackAlert(attack?.kind);
  fxTimeout('attack',()=>{
    App.fx.attack=null;
    App.fx.aftershock={kind:attack.kind,hit:Array.isArray(attack.hit)?attack.hit:[],message:String(message||'').slice(0,180)};
    renderFx();
    fxTimeout('aftershock',()=>{App.fx.aftershock=null;renderFx();},reducedMotion?2000:4000);
  },reducedMotion?1200:3400);
  return true;
}

function startRollFx(previous,next){
  const roll=next.lastRoll,teamId=Number(roll?.team),team=next.teams?.[teamId],before=previous.teams?.[teamId];
  if(!roll||!team||!before)return;
  App.fx.dice={teamId,teamName:team.name,value:roll.n,rolling:!reducedMotion};
  SoundFX.playDiceTumble();
  if(reducedMotion){fxTimeout('dice',()=>{App.fx.dice=null;renderFx();},1200);return;}
  fxTimeout('diceReveal',()=>{if(App.fx.dice){App.fx.dice.rolling=false;SoundFX.playDiceResult();}renderFx();},900);
  const path=movementPath(before.pos,roll.n,team.pos,G.N);
  if(path.length){
    App.fx.positions[teamId]=before.pos;let step=0;
    const move=()=>{
      const from=App.fx.positions[teamId],pos=path[step];
      App.fx.positions[teamId]=pos;
      App.fx.camera={teamId,from,pos};
      App.highlight=[pos];
      App.fx.stepText=`${step+1} / ${path.length}`;
      SoundFX.playStepHop();
      step+=1;renderFx();
      if(step<path.length){
        fxTimeout('move',move,460);
      }else{
        SoundFX.playLanding();
        App.fx.stepText='★ 抵達！';
        renderFx();
        fxTimeout('move',()=>{
          delete App.fx.positions[teamId];
          App.fx.camera=null;
          App.highlight=[];
          App.fx.stepText='';
          renderFx();
        },1100);
      }
    };
    fxTimeout('move',move,1200);
  }
  fxTimeout('dice',()=>{App.fx.dice=null;renderFx();},2200);
}
function processGameFx(previous,next){
  if(!previous||!next)return;
  if(previous.phase!==next.phase&&PHASE_FX[next.phase])showPhaseFx(PHASE_FX[next.phase]);
  else if(next.paused&&!previous.paused)showPhaseFx(PHASE_FX.paused);
  else if(previous.paused&&!next.paused)showPhaseFx({...PHASE_FX[next.phase],title:'繼續遊戲',subtitle:'活動已恢復，請繼續進行'});
  const message=next.log?.[0],changed=message&&message!==previous.log?.[0];
  const upgradedTeam=next.teams?.find((t,i)=>previous.teams?.[i]&&t.level>previous.teams[i].level&&t.baseIdx!==null);
  if(upgradedTeam)showUpgradeFx(upgradedTeam);
  const attackChanged=changed&&next.lastAttack&&next.lastAttack.seq!==previous.lastAttack?.seq;
  if(attackChanged){if(!showAttackFx(next.lastAttack,message,next))showEventFx(message);}
  else if(changed)showEventFx(message);
  if(changed&&next.lastRoll&&(/骰出/.test(message)||/監獄/.test(message)))startRollFx(previous,next);
}

async function api(path, options={}){
  const r = await fetch(path, {cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}});
  const text = await r.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = {error:text}; }
  if(!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
function saveSession(){
  localStorage.setItem('preview:session', JSON.stringify({gameId:App.gameId,role:App.role,teamId:App.teamId,token:App.token,accessToken:App.access[App.role]||''}));
}
function loadSession(){ try { return JSON.parse(localStorage.getItem('preview:session') || 'null'); } catch { return null; } }
function clearSession(){ localStorage.removeItem('preview:session'); }
function socketURL(gameId){
  const u = new URL(location.href); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/ws/${encodeURIComponent(gameId)}`; u.search = ''; return u.toString();
}

class LiveSocket {
  constructor(gameId, role, token, teamId, accessToken=''){ this.gameId=gameId; this.role=role; this.token=token; this.teamId=teamId; this.accessToken=accessToken; this.ws=null;this.retryTimer=null;this.attempt=0;this.stopped=false;this.connecting=false; }
  connect(){
    if(this.stopped||this.connecting||this.ws?.readyState===WebSocket.OPEN)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;this.connecting=true;
    const ws = new WebSocket(socketURL(this.gameId));this.ws=ws;
    ws.onopen = () => { if(ws!==this.ws)return;this.connecting=false;this.attempt=0;App.connected=true;render(true);this.send({type:'hello',role:this.role,token:this.token||'',accessToken:this.accessToken||'',teamId:this.teamId}); };
    ws.onclose = () => { if(ws!==this.ws)return;this.connecting=false;App.connected=false;clearPendingAction();render(true);if(!this.stopped)this.scheduleReconnect(); };
    ws.onerror = () => { if(ws!==this.ws)return;App.connected=false;render(true); };
    ws.onmessage = (e) => {
      if(ws!==this.ws)return;
      let m; try { m=JSON.parse(e.data); } catch { return; }
      if(m.type==='state'){ const previous=App.state;App.state=m.state;processGameFx(previous,m.state);App.gameMeta={...App.gameMeta,status:m.status};render(true); }
      else if(m.type==='hello_ok'){ App.connected=true; App.state=m.state; App.gameMeta={...App.gameMeta,...m.meta}; saveSession(); render(true); }
      else if(m.type==='action_ok'){ if(!App.pendingAction||!m.actionId||m.actionId===App.pendingAction)clearPendingAction();render(true); }
      else if(m.type==='error'){ clearPendingAction();toast(m.error || '操作失敗', true);render(true); }
      else if(m.type==='kicked'){ toast(m.message || '你已被主持人踢出活動', true);clearSession();this.close();setTimeout(()=>setHome(),300); }
      else if(m.type==='notice'){ toast(m.message || ''); }
    };
  }
  scheduleReconnect(){ if(this.stopped||this.retryTimer)return;const delay=Math.min(15000,1000*(2**Math.min(this.attempt++,4)))+Math.floor(Math.random()*500);this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect();},delay); }
  reconnectNow(){ if(this.stopped)return;clearTimeout(this.retryTimer);this.retryTimer=null;try{if(this.ws&&this.ws.readyState!==WebSocket.CLOSED)this.ws.close();}catch{}this.ws=null;this.connecting=false;this.connect(); }
  send(message){ if(this.ws?.readyState===WebSocket.OPEN){this.ws.send(JSON.stringify(message));return true;}toast('連線尚未恢復，請稍候',true);return false; }
  close(){ this.stopped=true;clearTimeout(this.retryTimer);this.retryTimer=null;const ws=this.ws;this.ws=null;try{ws?.close();}catch{} }
}

function sprite(type,size){
  const g=G.SPR[G.SPRKEY[type]], pal=G.PAL[type];
  let out=`<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">`;
  for(let y=0;y<g.length;y++) for(let x=0;x<g[y].length;x++){ const c=pal[g[y][x]]; if(c) out+=`<rect x="${x}" y="${y}" width="1.05" height="1.05" fill="${c}"/>`; }
  return out+'</svg>';
}
const diceGlyphs=['⚀','⚁','⚂','⚃','⚄','⚅'];
function diceCubeHTML(value=1){
  const val=Math.max(1,Math.min(6,Number(value)||1)),face=diceGlyphs[val-1];
  return `<div class="dice-cube" data-value="${val}"><div class="dice-inner"><i class="face front">${face}</i><i class="face back">⚅</i><i class="face right">⚂</i><i class="face left">⚃</i><i class="face top">⚄</i><i class="face bottom">⚁</i></div></div>`;
}

function baseBuildingHTML(owner){const level=Math.max(1,Math.min(3,Number(owner.level)||1)),names=['營地','商店','豪華賭場'];return `<div class="base-building lv${level}" style="--owner:${owner.color}" aria-label="${names[level-1]}"><i class="base-roof"></i><i class="base-body"><b></b><b></b><b></b></i><em>LV${level}</em></div>`;}
function boardAftermathHTML(kind){if(!kind)return '';if(kind==='quake')return `<div class="board-aftermath board-quake">${Array.from({length:5},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;if(kind==='missile')return `<div class="board-aftermath board-missile"><i></i><i></i><i></i><b>LOCK</b></div>`;if(kind==='typhoon')return `<div class="board-aftermath board-typhoon">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;return `<div class="board-aftermath board-wildfire">${Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;}
function routeEntry(){ const p=location.pathname.replace(/\/+$/,'')||'/'; return p==='/admin'?'admin':p==='/team'?'team':'home'; }
function go(path){ App.socket?.close(); App.socket=null;clearPendingAction();resetGameFx();App.connected=false;App.screen='home'; App.entry=path==='/admin'?'admin':path==='/team'?'team':'home'; history.pushState({},'',path); render(true); }
function setHome(){ App.socket?.close(); App.socket=null;clearPendingAction();resetGameFx();App.screen='home'; App.role=null; App.gameId=null; App.state=null; App.teamId=null; App.token=null; App.gameMeta=null; App.connected=false; App.history=[]; render(true); }
function entryURL(path){ return `${location.origin}${path}`; }
function openGame(game, role, token='', teamId=null, accessToken=''){
  clearInterval(App.lobbyTimer);clearPendingAction();resetGameFx();App.gameId=game.id; App.gameMeta=game; App.role=role; App.token=token; App.teamId=teamId; App.access[role]=accessToken||App.access[role]||''; App.screen='game'; App.tab='main'; App.state=null; App.connected=false;
  App.socket?.close(); App.socket=new LiveSocket(game.id,role,token,teamId,App.access[role]); App.socket.connect(); render(true);
}

async function refreshLobby(){
  if(App.screen!=='home') return;
  const list=$('lobbyList'); if(!list) return;
  try{
    const data=await api('/api/lobby');
    if(!data.games?.length){ list.innerHTML='<div class="note">目前沒有開放中的活動。主持人建立活動後，這裡會出現可加入的活動。</div>'; return; }
    list.innerHTML=data.games.map(g=>`<div class="lobby-item">
      <h3>${esc(g.name)}</h3><div class="lobby-meta">隊伍：${g.teamCount} 隊　已連線：${g.joinedCount} 隊<br>狀態：${esc(phaseNames[g.status]||g.status)}</div>
      <div class="lobby-actions"><button class="btn blue watch" data-id="${esc(g.id)}">進入觀戰</button></div>
    </div>`).join('');
    list.querySelectorAll('.watch').forEach(b=>b.onclick=()=>{const g=data.games.find(x=>x.id===b.dataset.id)||{id:b.dataset.id,name:'活動'};openGame(g,'viewer');});
  }catch(e){ list.innerHTML=`<div class="note warn">活動清單載入失敗：${esc(e.message)}</div>`; }
}
function renderHome(){
  if(App.entry==='admin') return renderAdminHome();
  if(App.entry==='team') return renderTeamHome();
  $('app').innerHTML=`<div class="hd"><div class="t1">人生大富翁</div><div class="t2">營隊大地遊戲 · 即時觀戰</div></div>
  <div class="card"><div class="ch">★ 觀戰入口</div><div class="cb"><div id="lobbyList" class="lobby-list">載入中…</div><button class="btn sm gold" id="refreshLobby" style="margin-top:10px">重新整理</button></div></div>`;
  $('refreshLobby').onclick=refreshLobby;
  clearInterval(App.lobbyTimer); App.lobbyTimer=setInterval(refreshLobby,8000); refreshLobby(); updateNav();
}
function renderGate(role){
  const host=role==='host';
  $('app').innerHTML=`<div class="hd"><div class="t1">${host?'主持人控制台':'隊輔系統'}</div><div class="t2">${host?'請輸入控制台密碼':'輸入共用密碼後直接選隊'}</div></div><div class="card"><div class="ch">★ ${host?'主持人登入':'隊輔登入'}</div><div class="cb"><input id="accessPassword" type="password" autocomplete="current-password" placeholder="密碼"><button class="btn green" id="accessLogin">登入</button><div class="note">${host?'這台裝置會保留活動連線，方便斷線或重新整理後恢復。':'驗證成功後會直接顯示目前隊伍，不需要房號或 PIN。'}密碼不會寫入網址。</div></div></div>`;
  $('accessLogin').onclick=async()=>{ const p=$('accessPassword').value||''; if(!p){toast('請輸入密碼',true);return;} try{await api('/api/auth',{method:'POST',body:JSON.stringify({role,password:p})});saveAccess(role,p);render(true);toast(host?'主持人登入成功':'隊輔登入成功');}catch(e){toast('登入失敗：'+e.message,true);} };
  $('accessPassword').onkeydown=e=>{if(e.key==='Enter')$('accessLogin').click();}; updateNav();
}
async function renderTeamHome(){
  if(!App.access.team) return renderGate('team');
  $('app').innerHTML=`<div class="hd"><div class="t1">隊輔入口</div><div class="t2">正在取得目前活動與隊伍狀態</div></div><div class="card"><div class="cb" id="teamEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div>`;
  $('teamLogout').onclick=()=>{clearSession();clearAccess('team');go('/');};
  try{
    const data=await api('/api/lobby'); const g=data.games?.[0]; const box=$('teamEntryBox');
    if(App.entry!=='team'||App.screen!=='home')return;
    if(!g){box.innerHTML='<div class="note">目前沒有開放中的活動，請等待主持人開啟遊戲。</div>';return;}
    showTeamJoin(g);
  }catch(e){$('teamEntryBox').innerHTML=`<div class="note warn">活動狀態載入失敗：${esc(e.message)}</div>`;}
}
async function renderAdminHome(){
  if(!App.access.host) return renderGate('host');
  $('app').innerHTML=`<div class="hd"><div class="t1">主持人主控台</div><div class="t2">單一活動的建立、開始、暫停、結束與隊伍管理</div></div><div class="card"><div class="cb" id="adminEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="adminLogout">主持人登出</button></div></div>`;
  $('adminLogout').onclick=()=>{clearAccess('host');go('/');};
  try{
    const data=await api('/api/lobby'); const g=data.games?.[0]; const box=$('adminEntryBox'); const sess=loadSession();
    if(g){
      box.innerHTML=`<div class="ch">★ ${esc(g.name)}</div><div class="note">目前已有一場活動：${esc(phaseNames[g.status]||g.status)}，${g.teamCount} 隊。</div><br><button class="btn green" id="resumeAdmin">進入主持人控制台</button><button class="btn dark" id="closeExisting">關閉目前活動</button>`;
      $('resumeAdmin').onclick=()=>openGame(g,'host','',null,App.access.host);
      $('closeExisting').onclick=()=>ask('關閉目前活動？','即使主持人分頁已關閉，也會由後端關閉活動並保存歷史紀錄。',()=>closeActivity(g.id));
      return;
    }
    box.innerHTML=`<div class="ch">★ 建立唯一活動</div><input id="gameName" placeholder="活動名稱，例如：2026 夏令營人生大富翁"><label class="fl"><span>隊伍數量</span><input id="teamCount" type="number" value="10" min="2" max="${G.BASE_IDX.length}"><span class="u">隊</span></label><button class="btn green" id="createGame">建立並開放活動</button><div class="note">建立後，隊輔輸入共用密碼即可直接選擇隊伍；同一時間只會存在一場遊戲。</div>`;
    $('createGame').onclick=createGame;
  }catch(e){$('adminEntryBox').innerHTML=`<div class="note warn">主持人頁面載入失敗：${esc(e.message)}</div>`;}
}
async function createGame(){
  const name=($('gameName').value||'未命名活動').trim(); const teamCount=Math.max(2,Math.min(G.BASE_IDX.length,Number($('teamCount').value)||10));
  const button=$('createGame');if(button?.disabled)return;if(button){button.disabled=true;button.textContent='建立中…';}
  try{ const g=await api('/api/games',{method:'POST',headers:{Authorization:`Bearer ${App.access.host}`},body:JSON.stringify({name,teamCount})}); openGame(g,'host',g.hostToken||'',null,App.access.host); toast('活動已建立，隊輔現在可以直接選隊加入'); } catch(e){ if(button){button.disabled=false;button.textContent='建立並開放活動';}toast('建立活動失敗：'+e.message,true); }
}
async function closeActivity(id){
  try{ await api(`/api/games/${encodeURIComponent(id)}/close`,{method:'POST',headers:{Authorization:`Bearer ${App.access.host}`}}); App.socket?.close(); App.socket=null; clearSession();resetGameFx(); App.screen='home'; App.entry='admin'; render(true); toast('活動已關閉，歷史紀錄已保存'); }catch(e){toast('關閉活動失敗：'+e.message,true);}
}
function showTeamJoin(game){
  App.screen='join'; App.gameMeta=game; App.gameId=game.id;
  const teams=game.teams?.length?game.teams:Array.from({length:Math.max(2,game.teamCount||G.BASE_IDX.length)},(_,i)=>({id:i,name:`第 ${i+1} 組`,color:'#8a8676',joined:false}));
  $('app').innerHTML=`<div class="hd team-pick-head"><div class="t1">選擇你的隊伍</div><div class="t2">${esc(game.name||'目前活動')} · ${esc(phaseNames[game.status]||game.status)}</div></div><div class="card"><div class="ch">★ 點一下直接加入</div><div class="cb"><div class="note team-pick-note">共用密碼已通過。請確認隊名與顏色；標示「已有裝置」的隊伍仍可加入，但會先再次確認。</div><div class="team-pick-grid">${teams.map((t,i)=>`<button type="button" class="team-pick ${t.joined?'occupied':''}" data-i="${i}"><span class="team-pick-color" style="background:${esc(t.color)};color:${G.LIGHT_FG.includes(i)?'#14110f':'#fff'}">${i+1}</span><span class="team-pick-main"><b>${esc(t.name)}</b><small>第 ${i+1} 組</small></span><span class="team-pick-status ${t.joined?'online':''}">${t.joined?'已有裝置':'可以加入'}</span></button>`).join('')}</div><div class="team-pick-actions"><button class="btn sm outline" id="refreshTeams">更新隊伍狀態</button><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div></div>`;
  document.querySelectorAll('.team-pick').forEach(button=>button.onclick=()=>{
    const team=teams[Number(button.dataset.i)];if(!team)return;
    const enter=()=>openGame(game,'team','',Number(team.id),App.access.team);
    if(team.joined)ask('這隊已經有裝置連線',`${esc(team.name)} 目前顯示已連線。如果是同隊的第二台裝置或重新接手，可以繼續加入。`,enter);else enter();
  });
  $('refreshTeams').onclick=()=>{App.screen='home';render(true);};
  $('teamLogout').onclick=()=>{clearSession();clearAccess('team');go('/');};
}
function resumeSession(sess){ if(sess.accessToken) App.access[sess.role]=sess.accessToken; openGame({id:sess.gameId,name:'活動'},sess.role,sess.token||'',sess.teamId,App.access[sess.role]); }

function boardHUD(){
  const S=App.state,last=S.lastRoll,lastTeam=last?S.teams[last.team]:null,dice=App.fx.dice;
  const marketName=S.settings.marketNames[S.market]||S.market,marketRate=(S.settings.market[S.market]||100)/100;
  const diceValue=dice?(dice.rolling?'?':dice.value):(last?.n||'–');
  const diceTeam=dice?.teamName||lastTeam?.name||'等待擲骰';
  return `<div class="board-hud"><div class="hud-kicker">LIFE GAME</div><div class="hud-round"><span>ROUND</span><b>${S.round}</b></div><div class="hud-phase">${esc(S.paused?'已暫停':(phaseNames[S.phase]||S.phase))}</div><div class="hud-market"><span>股市 ${esc(marketName)}</span><b>×${marketRate}</b></div><div class="hud-roll"><div class="hud-dice ${dice?.rolling?'rolling':''}">${diceValue}</div><div><small>最近行動</small><strong>${esc(diceTeam)}</strong></div></div></div>`;
}
function boardHTML(){
  const S=App.state,cell=46,gap=4,W=11*(cell+gap),H=10*(cell+gap),attackKind=App.fx.attack?.kind||App.fx.aftershock?.kind||'',attackHit=App.fx.aftershock?.hit||[],cameraPos=App.fx.camera?.pos,upgradeIdx=App.fx.upgrade?.tileIndex;
  let out=`<div class="bwrap ${App.zoom?'zoomed':'fit'} ${App.fx.camera?'camera-active':''}" id="bwrap"><div class="board ${attackKind?`fx-attack fx-${attackKind}`:''}" id="board" style="width:${W}px;height:${H}px">`;
  G.TRACK.forEach((t,i)=>{
    const [kind,c,r]=t,T=G.TILE[kind],own=G.ownerOf(S,i),here=S.teams.filter(x=>(App.fx.positions[x.id]??x.pos)===i),attackHot=attackHit.includes(i),stepHot=App.highlight.includes(i),radarHot=App.radarFocus===i,upgradeHot=upgradeIdx===i,hot=attackHot||stepHot||radarHot||upgradeHot,locked=kind==='stage'&&!S.unlocked.includes(i);
    out+=`<div class="tile ${attackHot?`fx-hit fx-hit-${attackKind}`:stepHot?'fx-step':''} ${cameraPos===i?'camera-focus':''} ${radarHot?'radar-beacon':''} ${upgradeHot?'fx-upgrade':''}" data-i="${i}" style="left:${c*(cell+gap)}px;top:${r*(cell+gap)}px;background:${hot?'#ffdcdc':T.bg};border-color:${hot?'#e23b3b':'#14110f'}">${kind==='base'&&own?baseBuildingHTML(own):sprite(kind,22)}<div class="tl" style="color:${T.fg}">${kind==='base'&&own?esc(S.settings.levels[own.level-1]?.name||T.n):T.n}</div>${locked?'<div class="lock"></div>':''}${own?`<div class="ow" style="background:${own.color};color:${G.LIGHT_FG.includes(own.id)?'#14110f':'#fff'}">🚩${own.id+1}</div>`:''}${here.length?`<div class="pins">${here.slice(0,4).map(h=>`<i class="${App.fx.positions[h.id]!==undefined?'moving':''} ${App.teamId===h.id?'is-me':''}" style="background:${h.color};color:${G.LIGHT_FG.includes(h.id)?'#14110f':'#fff'}">${h.id+1}</i>`).join('')}${here.length>4?`<i class="more">+${here.length-4}</i>`:''}</div>`:''}${upgradeHot?`<div class="upgrade-frame-3d"></div><div class="upgrade-badge">▲ 基地升級 LV${App.fx.upgrade.level} ▲</div>`:''}</div>`;
  });
  if(App.fx.stepText)out+=`<div class="step-progress-badge">${esc(App.fx.stepText)}</div>`;
  return out+boardAftermathHTML(attackKind)+boardHUD()+'</div></div><button class="btn sm gold" id="bZoom">'+(App.zoom?'符合螢幕':'放大檢視')+'</button>';
}
function fitBoard(){
  if(App.screen!=='game')return;
  const wrap=$('bwrap'),bd=$('board');
  if(!wrap||!bd)return;
  if(App.fx.camera){
    const height=Math.min(580,Math.max(390,window.innerHeight-wrap.getBoundingClientRect().top-18)),
          scale=window.innerWidth<600?1.35:window.innerWidth<1000?1.55:1.75,
          point=pos=>{const tile=G.TRACK[pos]||G.TRACK[0];return {x:tile[1]*50+23,y:tile[2]*50+23};},
          from=point(App.fx.camera.from),to=point(App.fx.camera.pos),
          centerX=wrap.clientWidth*.5,centerY=height*.52,
          dx=to.x-from.x,dy=to.y-from.y,
          rotX=dy>0?36:dy<0?28:32,
          rotY=dx>0?-8:dx<0?8:0,
          rotZ=dx>0?-2:dx<0?2:0,
          tx=centerX-to.x,ty=centerY-to.y;
    wrap.style.height=`${height}px`;
    wrap.classList.remove('compact-board');
    bd.style.transformOrigin='275px 250px';
    bd.style.transform=`translate3d(${tx}px, ${ty}px, 0) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
    return;
  }
  if(App.zoom){bd.style.transform='';wrap.style.height='';wrap.classList.remove('compact-board');return;}
  const max=Math.max(240,wrap.clientWidth-4),stage=App.role==='viewer'&&window.innerWidth>=1100,viewerMax=stage?1.45:1,availableHeight=stage?Math.max(420,window.innerHeight-wrap.getBoundingClientRect().top-22):Infinity,scale=Math.min(viewerMax,max/bd.offsetWidth,availableHeight/bd.offsetHeight);
  bd.style.transformOrigin='top left';
  bd.style.transform=`scale(${scale})`;
  wrap.style.height=`${bd.offsetHeight*scale}px`;
  wrap.classList.toggle('compact-board',scale<.78);
}


function tileDesc(i){ const S=App.state,kind=G.TRACK[i][0],own=G.ownerOf(S,i); const descriptions={base:'基地：可持有、升級、出售或收取過夜費。',safe:'安全格：沒有額外效果。',tax:'稅收格：支付稅金給銀行。',fate:'命運格：抽取一張命運卡。',black:'黑市：下一次商店消費折扣。',casino:'賭場：支付賭資並依規則抽獎。',bank:'銀行密道：取得銀行池的一部分。',worm:'蟲洞：傳送到另一個蟲洞。',jail:'監獄：下一回合停留。',exch:'交易所：查看市場資訊。',stage:'關卡：由主持人解封後觸發。',start:'起點：經過或停留可取得繞圈獎勵。'}; return `${descriptions[kind]||''}${own?`<br>目前領地：${esc(own.name)}`:''}`; }
function rankingHTML(){
  const S=App.state,money=n=>`${Number(n||0).toLocaleString()}元`;
  return `<div class="card ranking-card"><div class="ch">★ 即時排行榜 · 點擊隊伍地圖定位</div><div class="cb ranking-list"><div class="rank-legend">點擊隊伍可在棋盤定位 <i>/</i> 現金 <i>/</i> 房產 <i>/</i> 點數</div>${[...S.teams].sort((a,b)=>G.netWorth(S,b)-G.netWorth(S,a)).map((t,i)=>`<div class="rk" data-team="${t.id}" title="點擊在棋盤定位 ${esc(t.name)}"><div class="rank-head"><div class="rn">${i+1}</div><div class="sw" style="background:${t.color}"></div><div class="rname">${esc(t.name)}<div class="dim">${t.joined?'已連線':'尚未連線'} · 第 ${t.pos+1} 格</div></div></div><div class="rank-values"><b>${money(t.cash)}</b><i>/</i><b>${money(G.propertyValue(S,t))}</b><i>/</i><b>${Number(t.pts||0).toLocaleString()}點</b></div></div>`).join('')}</div></div>`;
}
function logHTML(){ return `<div class="card"><div class="ch">★ 遊戲紀錄</div><div class="cb">${(App.state.log||[]).slice(0,80).map(x=>`<div class="lg">${esc(x)}</div>`).join('')||'<div class="note">尚無紀錄</div>'}</div></div>`; }
function stagePanelHTML(){const S=App.state,last=S.lastRoll,lastTeam=last?S.teams[last.team]:null;return `<div class="stage-panel"><div class="stage-live"><i></i> LIVE ARENA</div><div class="stage-round"><small>ROUND</small><b>${S.round}</b></div><div class="stage-phase">${esc(S.paused?'活動暫停':(phaseNames[S.phase]||S.phase))}</div><div class="stage-stats"><span>股市<b>${esc(S.settings.marketNames[S.market]||S.market)} ×${(S.settings.market[S.market]||100)/100}</b></span><span>最近骰點<b>${last?`${esc(lastTeam?.name||'')} · ${last.n}`:'等待開局'}</b></span></div></div>`;}
function stageTickerHTML(){if(App.role!=='viewer')return '';const message=App.state.log?.[0]||'活動即將開始，請各隊做好準備';return `<div class="stage-ticker"><span>● LIVE</span><div><b>現場快報</b>${esc(message)}</div></div>`;}
function teamControls(){
  const S=App.state, me=App.teamId!==null?S.teams[App.teamId]:null; if(App.role==='viewer') return stagePanelHTML(); if(!me) return `<div class="viewer-note">目前沒有可操作的隊伍。</div>`;
  if(S.phase==='setup')return `<div class="viewer-note">隊伍已連線，請等待主持人抽籤並開始遊戲。</div>`;
  if(S.phase==='ended')return `<div class="viewer-note">活動已結束，操作功能已關閉。</div>`;
  if(S.paused)return `<div class="viewer-note">主持人已暫停活動，恢復後才能繼續操作。</div>`;
  let h=`<div class="card"><div class="ch">★ ${esc(me.name)} 的操作</div><div class="cb">`;
  if(S.phase==='market'){h+='<div class="note">正在公布本回合股市，請等待主持人進入下一階段。</div>';}
  if(S.phase==='roll'){
    const mine=App.fx.dice?.teamId===me.id,lastMine=S.lastRoll?.team===me.id?S.lastRoll.n:1;
    if(me.rolled||App.busy)h+=`<div class="dice-result-panel ${mine&&App.fx.dice?.rolling?'rolling':''}">${diceCubeHTML(mine?App.fx.dice.value:lastMine)}<b>${App.busy?'骰子飛行中…':`本回合擲出 ${lastMine} 點`}</b></div>`;
    else h+=`<div class="dice-throw-pad" id="diceThrow" role="button" tabindex="0" aria-label="向上滑動擲骰子"><div class="throw-lane"><span>FLICK TO ROLL</span>${diceCubeHTML(1)}<i class="throw-arrow">↑</i><i class="throw-status">向上甩動</i></div><strong>按住骰子向上滑動，放手擲出</strong><small>快速輕甩或拉過紅線即可；點數仍由伺服器公平決定</small></div>`;
  }
  if(S.phase==='shop'){ h+=`<div class="note">目前是商店階段。</div>${S.settings.gambles.map((g,i)=>`<button class="btn sm purple gam" data-i="${i}">${g.name}　${G.costWithDiscount(S,me,g.cost)} 點</button>`).join('')}${Object.entries(S.settings.buffs).map(([k,b])=>`<button class="btn sm blue buf" data-k="${k}">${b.name}　${G.costWithDiscount(S,me,b.cost)} 點</button>`).join('')}`; }
  if(S.phase==='roll'){ h+=`<div class="seg">特殊操作・每招每回合限一次</div><div class="attack-list">${Object.entries(S.settings.attacks).map(([k,a])=>{const used=Boolean(S.attackUsage?.[`${Number(S.round)}:${me.id}:${k}`])||Number(me.attackRounds?.[k])===Number(S.round),cost=G.costWithDiscount(S,me,a.cost),lack=me.pts<cost;return `<div class="attack-action"><button class="btn sm dark atk ${used?'used':lack?'lack':''}" data-k="${k}" ${used||lack?'disabled':''}><span>${a.name}</span><b>${used?'本回合已使用':lack?`還差 ${cost-me.pts} 點`:cost+' 點'}</b></button><div class="attack-help">${esc(attackDescription(S,k,a))}</div></div>`;}).join('')}</div><button class="btn sm ink" id="bBattle">使用 BATTLE（剩 ${me.battles} 次）</button>`; }
  if(S.phase==='sell'){h+=`<div class="seg">基地操作</div><div class="small-grid"><button class="btn sm green" id="bUp">升級基地</button><button class="btn sm gold" id="bSell">賣出基地</button><button class="btn sm blue" id="bBuyBack">買回基地</button></div>`;}
  if(S.phase==='roll'){h+=`<div class="seg">持有道具</div><button class="btn sm outline" id="bReroll" ${me.buffs.reroll<=0||!me.rolled?'disabled':''}>重骰卡（${me.buffs.reroll}）</button>`;}
  h+='</div></div>';return h;
}
function attackDescription(S,k,a){const m={quake:`隨機震央，7×7 範圍基地支付 ${G.money(a.repair)} 修繕費；震央為 1.5 倍。`,missile:`鎖定排行榜相鄰隊伍，使其支付 ${G.money(a.repair)} 修繕費。`,typhoon:`隨機 7×7 暴風圈；外圈支付 ${G.money(a.repair)}，颱風眼反而獲得 ${G.money(a.eyeBonus)}。`,wildfire:`隨機延燒 1–2 個橫排，範圍基地支付 ${G.money(a.repair)} 修繕費。`};return m[k]||'發動特殊操作。';}
function attackSceneHTML(kind){
  if(kind==='quake')return `<div class="attack-scene quake-scene"><svg viewBox="0 0 1000 700" aria-hidden="true"><path d="M510 0L455 132l78 72-118 110 75 74-156 142 72 170"/><path d="M475 165L320 108l38 104-190 62"/><path d="M456 360L630 275l-16 116 210 95"/><path d="M402 520L238 485l-90 112"/></svg>${Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  if(kind==='missile')return `<div class="attack-scene missile-scene"><div class="target-reticle"><i></i><i></i><i></i></div><div class="missile-projectile"><b>➤</b><i></i></div><div class="impact-core"></div>${Array.from({length:12},(_,i)=>`<i class="blast" style="--i:${i}"></i>`).join('')}</div>`;
  if(kind==='typhoon')return `<div class="attack-scene typhoon-scene"><div class="vortex">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}<b>颱</b></div>${Array.from({length:18},(_,i)=>`<span style="--i:${i}"></span>`).join('')}</div>`;
  return `<div class="attack-scene wildfire-scene"><div class="fire-wall">${Array.from({length:16},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>${Array.from({length:20},(_,i)=>`<span style="--i:${i}"></span>`).join('')}</div>`;
}
function cfgHTML(){ const S=App.state; const f=(label,path,val,suf='')=>`<label class="fl"><span>${label}</span><input class="cfg" data-p="${path}" type="number" min="0" value="${val}"><span class="u">${suf}</span></label>`; let h='<div class="cfgbox"><div class="note">修改完成後請按最下方的「儲存全部遊戲設定」，所有數值會一次驗證並套用。</div>'; h+=f('繞圈獎勵','lapBonus',S.settings.lapBonus);h+=f('稅收扣款','taxAmount',S.settings.taxAmount);h+=f('賭場花費','casinoCost',S.settings.casinoCost);h+=f('黑市折扣','blackDiscount',S.settings.blackDiscount,'%');h+=f('銀行密道取走','bankShare',S.settings.bankShare,'%');h+=f('骰子面數','diceSides',S.settings.diceSides,'面');h+=f('通行費佔過夜費','passRatio',S.settings.passRatio,'%');h+='<div class="sub">特殊操作費用</div><div class="grp">';Object.entries(S.settings.attacks).forEach(([k,a])=>{h+=f(`${a.name}所需諂媚點數`,`attacks.${k}.cost`,a.cost,'點');});h+='</div><div class="sub">基地等級</div>';S.settings.levels.forEach((lv,i)=>{h+=`<div class="grp"><b>Lv${i+1}「${lv.name}」</b>`+f('過夜費',`levels.${i}.stay`,lv.stay)+f('升級點數',`levels.${i}.up`,lv.up)+f('賣出價值',`levels.${i}.sell`,lv.sell)+'</div>';});return h+'<button class="btn sm green" id="bSaveCfg">儲存全部遊戲設定</button></div>'; }
function hostPanel(){
  const S=App.state; let h='<div class="card"><div class="ch">★ 主持人控制台</div><div class="cb">';
  h+=`<div class="note share-note">請讓隊輔從首頁底部導覽進入「隊輔」，隊員與觀眾直接留在首頁觀戰。</div>`;
  h+=`<div class="connection-row"><span class="role-pill">主持人控制權</span><span class="status ${App.connected?'':'off'}"><i class="status-dot"></i>${App.connected?'已連線':'未連線'}</span></div>`;
  h+='<div class="note">隊輔輸入共用密碼後即可直接選隊。若有人選錯隊，可在下方將該隊踢出後重新加入。</div>';
  h+=`<div class="sub">活動流程</div><div class="small-grid">${S.phase==='setup'?'<button class="btn sm gold" id="bAssign">重新抽籤</button><button class="btn sm green" id="bStart">開始遊戲</button>':''}${!['setup','ended'].includes(S.phase)?'<button class="btn sm blue" id="bNext">進入下一階段</button>':''}${S.phase!=='ended'?(S.paused?'<button class="btn sm green" id="bResume">恢復活動</button>':'<button class="btn sm gold" id="bPause">暫停活動</button>'):''}<button class="btn sm dark" id="bEnd">結束並保存紀錄</button></div>`;
  h+='<div class="sub">隊伍名稱</div><textarea id="teamNames">'+esc(S.teams.map(t=>t.name).join('\n'))+'</textarea><button class="btn sm green" id="saveNames">儲存隊伍名稱</button>';
  h+='<div class="sub">隊輔連線</div><div class="team-connection-list">'+S.teams.map((t,i)=>`<div class="team-connection"><span class="sw" style="background:${t.color}">${i+1}</span><span>${esc(t.name)}<small>${t.joined?'已連線':'未連線'}</small></span>${t.joined?`<button class="btn xs dark kick" data-i="${i}">踢出</button>`:''}</div>`).join('')+'</div>'; h+='<div class="sub">主持人調整</div>'; h+=S.teams.map((t,i)=>`<div class="adj2"><div class="sw" style="background:${t.color}">${i+1}</div><div class="an2">${esc(t.name)}<span class="dim">現金 ${G.money(t.cash)}／點數 ${t.pts}</span></div><div class="ain"><input class="cash" data-i="${i}" type="number" placeholder="現金"><button class="btn xs gold csgo" data-i="${i}">調整</button></div><div class="ain"><input class="pts" data-i="${i}" type="number" placeholder="點數"><button class="btn xs blue ptgo" data-i="${i}">調整</button></div></div>`).join('');
  h+='<div class="sub">股市與關卡</div><div class="row wrap mkrow">'+S.settings.marketOrder.map(k=>`<button class="tg mk" data-k="${k}">${S.settings.marketNames[k]}<span class="mx">×${S.settings.market[k]/100}</span></button>`).join('')+'</div><div class="row wrap">'+G.STAGE_IDX.map(i=>`<button class="btn xs purple unl" data-i="${i}">解封第 ${i+1} 格</button>`).join('')+'</div>';
  h+='<button class="btn sm outline" id="showHistory">查看 D1 歷史紀錄</button><div id="historyBox"></div><button class="btn sm gold" id="bCfg">'+(App.cfg?'收起設定':'展開設定')+'</button>'+(App.cfg?cfgHTML():'')+'</div></div>';return h;
}
function renderGame(){
  const S=App.state;if(!S){$('app').innerHTML='<div class="card"><div class="cb">正在建立即時連線…</div></div>';return;}
  const tabs=[['main','遊戲'],['log','紀錄']];if(App.role==='host')tabs.push(['host','主控']);if(!tabs.some(x=>x[0]===App.tab))App.tab='main';
  const flow=[['market','股市'],['sell','基地'],['shop','商店'],['roll','移動']];const phaseTrack=S.phase==='setup'||S.phase==='ended'?'':`<div class="phase-track">${flow.map(([k,n],i)=>`<div class="phase-step ${S.phase===k?'on':''} ${flow.findIndex(x=>x[0]===S.phase)>i?'done':''}"><span>${i+1}</span>${n}</div>`).join('')}</div>`;
  let body=''; if(App.tab==='main') body=`${stageTickerHTML()}<div class="game-layout"><div class="game-primary"><div class="card board-card"><div class="ch">★ 棋盤 — 點格子查看說明</div><div class="cb">${boardHTML()}<div class="note board-legend">🚩＝領地　立體方塊＝駐留隊伍　綠色遮罩＝未解封</div></div></div></div><aside class="game-sidebar">${teamControls()}${rankingHTML()}</aside></div>`; if(App.tab==='log') body=logHTML(); if(App.tab==='host'&&App.role==='host') body=hostPanel();
  const phaseFx=App.fx.phase?`<div class="phase-overlay ${App.fx.phase.kind}" aria-live="assertive"><div class="phase-overlay-card"><div class="phase-symbol">${esc(App.fx.phase.symbol)}</div><div class="phase-title">${esc(App.fx.phase.title)}</div><div class="phase-subtitle">${esc(App.fx.phase.subtitle)}</div></div></div>`:'';
  const eventFx=App.fx.event?`<div class="event-flash ${App.fx.event.kind}" aria-live="polite"><span class="event-mark"></span><strong>${esc(App.fx.event.message)}</strong></div>`:'';
  const attackFx=App.fx.attack?`<div class="attack-overlay attack-${App.fx.attack.kind}" aria-live="assertive">${attackSceneHTML(App.fx.attack.kind)}<div class="attack-cinematic">⚠ WARNING // SPECIAL ATTACK DETECTED ⚠</div><div class="attack-card"><div class="attack-symbol">${esc(App.fx.attack.symbol)}</div><div class="attack-kicker">SPECIAL ATTACK</div><div class="attack-title">${esc(App.fx.attack.title)}</div><div class="attack-subtitle">【${esc(App.fx.attack.teamName)}】發動｜${esc(App.fx.attack.subtitle)}</div><div class="attack-message">${esc(App.fx.attack.message)}</div></div></div>`:'';
  const diceFx=App.fx.dice?`<div class="dice-flight ${App.fx.dice.rolling?'tumbling':'revealed'}" aria-live="assertive"><div class="dice-flight-name">${esc(App.fx.dice.teamName)} 擲骰</div>${diceCubeHTML(App.fx.dice.value)}<strong>${App.fx.dice.rolling?'ROLLING…':App.fx.dice.value}</strong></div>`:'';
  $('app').innerHTML=`<div class="bar"><div><span class="code2">${esc(App.gameMeta?.name||S.code)}</span><br><span class="ph">${esc(S.paused?'已暫停':(phaseNames[S.phase]||S.phase))} · 第 ${S.round} 回合</span></div><div class="connection-row"><button type="button" class="btn-sound-toggle ${App.sound?'':'muted'}" id="bSound" title="切換音效">${App.sound?'🔊 音效 ON':'🔇 音效 OFF'}</button><span class="role-pill">${esc(roleNames[App.role])}</span><span class="status ${App.connected?'':'off'}" aria-live="polite"><i class="status-dot"></i>${App.connected?'即時連線':'正在重新連線'}</span></div></div>${phaseTrack}<div class="game-head"><div class="row tabs">${tabs.map(([k,n])=>`<button class="tg tb ${App.tab===k?'on':''}" data-k="${k}">${n}</button>`).join('')}</div><div class="head-actions"><button class="btn xs ink" id="leaveGame">離開</button></div></div>${body}${eventFx}${phaseFx}${diceFx}${attackFx}`;
  bindGame(); fitBoard();
}
function clearPendingAction(){ clearTimeout(App.pendingTimer);App.pendingTimer=null;App.pendingAction=null;App.busy=false; }
function send(action,payload={},options={}){
  if(App.busy){toast('上一個操作仍在處理中');return;}
  if(!App.socket){toast('尚未連線',true);return;}
  const actionId=`${Date.now()}-${++App.actionSeq}`;
  if(!App.socket.send({type:'action',action,payload,actionId}))return;
  App.pendingAction=actionId;App.busy=true;if(!options.preserveView)render(true);
  App.pendingTimer=setTimeout(()=>{if(App.pendingAction===actionId){clearPendingAction();render(true);toast('操作回應較慢，請先確認畫面狀態再重試',true);}},10000);
}
function bindDiceGesture(){
  const pad=$('diceThrow');if(!pad)return;let active=false,startY=0,startX=0,pull=0,tilt=0,velocity=0,lastY=0,lastAt=0,frame=0,launched=false;
  const status=pad.querySelector('.throw-status'),paint=()=>{const power=Math.min(1,pull/82);frame=0;pad.style.setProperty('--throw-pull',`${pull}px`);pad.style.setProperty('--throw-y',`${-pull}px`);pad.style.setProperty('--throw-spin',`${pull*1.75}deg`);pad.style.setProperty('--throw-tilt',`${tilt}deg`);pad.style.setProperty('--throw-shadow-scale',String(1-power*.24));pad.style.setProperty('--throw-shadow-opacity',String(.22+power*.24));if(status)status.textContent=pull>=52?'放手擲出！':pull>12?'再往上一點':'向上甩動';},queuePaint=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  const reset=()=>{active=false;if(frame)cancelAnimationFrame(frame);frame=0;pad.classList.remove('dragging');pad.classList.add('settling');pull=0;tilt=0;paint();setTimeout(()=>pad.classList.remove('settling'),280);};
  const launch=()=>{if(launched||App.busy)return;launched=true;active=false;if(frame)cancelAnimationFrame(frame);paint();pad.classList.remove('dragging','settling');pad.classList.add('launch');if(status)status.textContent='擲出中…';navigator.vibrate?.([20,25,35]);SoundFX.playDiceTumble();setTimeout(()=>{pad.classList.add('waiting');if(status)status.textContent='等待骰點…';send('roll',{}, {preserveView:true});},540);};
  pad.onpointerdown=e=>{if(launched)return;e.preventDefault();active=true;startY=lastY=e.clientY;startX=e.clientX;lastAt=performance.now();pull=0;tilt=0;velocity=0;pad.classList.remove('settling');pad.classList.add('dragging');pad.setPointerCapture?.(e.pointerId);queuePaint();};
  pad.onpointermove=e=>{if(!active)return;e.preventDefault();const now=performance.now(),dy=lastY-e.clientY,dt=Math.max(8,now-lastAt);velocity=velocity*.6+(dy/dt)*.4;lastY=e.clientY;lastAt=now;pull=Math.max(0,Math.min(132,startY-e.clientY));tilt=Math.max(-12,Math.min(12,(e.clientX-startX)*.12));queuePaint();};
  pad.onpointerup=e=>{if(!active)return;pad.releasePointerCapture?.(e.pointerId);if(pull>=52||(pull>=32&&velocity>.55))launch();else reset();};pad.onpointercancel=reset;pad.onlostpointercapture=()=>{if(active)reset();};pad.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pull=82;paint();launch();}};
}
function bindGame(){
  const S=App.state, bind=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>{App.tab=b.dataset.k;render(true);});
  bind('leaveGame',()=>{if(confirm('離開目前活動？')){clearSession();go(App.entry==='admin'?'/admin':App.entry==='team'?'/team':'/');}}); bind('bZoom',()=>{App.zoom=!App.zoom;render(true);});
  bind('bSound',()=>{App.sound=toggleSound();render(true);toast(App.sound?'🔊 音效已開啟':'🔇 音效已靜音');});
  document.querySelectorAll('.tile').forEach(t=>{
    t.onclick=()=>{
      const i=Number(t.dataset.i),teamsHere=S.teams.filter(x=>x.pos===i);
      $('modalTitle').textContent=`第 ${i+1} 格 — ${G.TILE[G.TRACK[i][0]].n}`;
      let body=`<div class="mrow">${sprite(G.TRACK[i][0],40)}<div>${tileDesc(i)}</div></div>`;
      if(teamsHere.length>0){
        body+=`<div class="sub" style="margin-top:12px;">★ 目前駐留隊伍 (${teamsHere.length} 隊)</div><div class="tile-team-list">${teamsHere.map(team=>`<div class="tile-team-item"><div class="sw" style="background:${team.color}">${team.id+1}</div><div><b>${esc(team.name)}</b><span class="dim" style="display:block">現金 ${G.money(team.cash)} ｜ 點數 ${team.pts}</span></div></div>`).join('')}</div>`;
      }
      $('modalBody').innerHTML=body;$('modal').style.display='flex';
    };
  });
  document.querySelectorAll('.rk[data-team]').forEach(row=>{
    row.onclick=()=>{
      const teamId=Number(row.dataset.team),team=S.teams[teamId];
      if(team&&team.pos!==undefined){
        App.radarFocus=team.pos;SoundFX.playStepHop();render(true);
        clearTimeout(App._radarTimer);
        App._radarTimer=setTimeout(()=>{App.radarFocus=null;render(true);},3000);
      }
    };
  });
  if(App.role==='team'&&App.teamId!==null){
    const me=S.teams[App.teamId];bindDiceGesture();bind('bReroll',()=>ask('使用重骰卡？','會清除本回合骰點，重新骰一次',()=>send('reroll')));bind('bBattle',()=>ask('使用 BATTLE？','使用一次 BATTLE 並交由關主裁決',()=>send('battle')));bind('bUp',()=>send('upgrade'));bind('bSell',()=>send('sell'));bind('bBuyBack',()=>send('buyBack'));
    document.querySelectorAll('.atk').forEach(b=>b.onclick=()=>{const kind=b.dataset.k,a=S.settings.attacks[kind],cost=G.costWithDiscount(S,me,a.cost);ask(`發動「${a.name}」？`,`${esc(attackDescription(S,kind,a))}<br>將消耗 ${cost} 點諂媚點數，本回合不能再次發動同一招。`,()=>send('attack',{kind}));});document.querySelectorAll('.gam').forEach(b=>b.onclick=()=>send('gamble',{index:Number(b.dataset.i)}));document.querySelectorAll('.buf').forEach(b=>b.onclick=()=>send('buff',{kind:b.dataset.k}));
  }
  if(App.role==='host'){
    bind('bAssign',()=>ask('重新抽籤？','會重新分配所有隊伍的基地',()=>send('assignBases')));bind('bStart',()=>ask('開始遊戲？','開始後隊伍可以依流程進行操作',()=>send('startGame')));bind('bNext',()=>send('nextPhase'));bind('bPause',()=>ask('暫停活動？','暫停後隊輔暫時不能操作，但觀眾仍可觀看目前狀態。',()=>send('pauseGame')));bind('bResume',()=>send('resumeGame'));bind('bEnd',()=>ask('結束活動？','結束後會保存到 D1 歷史紀錄，活動不再出現在公開入口。',()=>send('endGame')));document.querySelectorAll('.kick').forEach(b=>b.onclick=()=>ask('踢出隊輔？','會關閉該隊目前的 WebSocket 連線，隊伍狀態回到未連線。',()=>send('kickTeam',{teamId:Number(b.dataset.i)})));bind('bCfg',()=>{App.cfg=!App.cfg;render(true);});
    bind('saveNames',()=>{const names=$('teamNames').value.split(/\r?\n/).map(x=>x.trim());send('renameTeams',{names});});bind('showHistory',loadHistory);
    document.querySelectorAll('.mk').forEach(b=>b.onclick=()=>send('setMarket',{kind:b.dataset.k}));document.querySelectorAll('.unl').forEach(b=>b.onclick=()=>send('unlock',{index:Number(b.dataset.i)}));
    document.querySelectorAll('.csgo').forEach(b=>b.onclick=()=>{const v=Number(document.querySelector(`.cash[data-i="${b.dataset.i}"]`).value);if(Number.isFinite(v))send('adjustCash',{teamId:Number(b.dataset.i),amount:v});});document.querySelectorAll('.ptgo').forEach(b=>b.onclick=()=>{const v=Number(document.querySelector(`.pts[data-i="${b.dataset.i}"]`).value);if(Number.isFinite(v))send('adjustPts',{teamId:Number(b.dataset.i),amount:v});});
    bind('bSaveCfg',()=>{const entries=[...document.querySelectorAll('.cfg')].map(inp=>({path:inp.dataset.p,value:Number(inp.value)}));send('setConfigs',{entries});});
  }
  if(App.busy)document.querySelectorAll('#app button').forEach(b=>{if(!b.matches('.tb,#leaveGame,#bZoom,#bSound'))b.disabled=true;});
}
async function loadHistory(){
  try{const auth=App.token||App.access.host;const data=await api(`/api/games/${encodeURIComponent(App.gameId)}/history`,{headers:{Authorization:`Bearer ${auth}`}});App.history=data.events||[];const box=$('historyBox');if(box)box.innerHTML=`<div class="history-item">共 ${App.history.length} 筆事件</div>`+App.history.slice(0,80).map(e=>`<div class="history-item">${esc(e.createdAt)}　${esc(e.actorRole)}${e.actorTeam!==null&&e.actorTeam!==undefined?'／第 '+(e.actorTeam+1)+' 組':''}<br>${esc(e.eventType)}：${esc(e.message||'')}</div>`).join('');}catch(e){toast('歷史紀錄讀取失敗：'+e.message,true);}
}
function render(force=false){ syncChrome(); if(App.screen==='home'){renderHome();return;}if(App.screen==='join')return;if(App.screen==='game')renderGame(); }

function bootApp(){
  try{
    loadAccess(); App.entry=routeEntry();
    $('modalClose').onclick=()=>{$('modal').style.display='none';}; $('modal').onclick=e=>{if(e.target.id==='modal')$('modal').style.display='none';};
    document.querySelectorAll('#bottomNav [data-route]').forEach(b=>b.onclick=()=>go(b.dataset.route));
    $('applyUpdate')?.addEventListener('click',applyPwaUpdate); enableInstallPrompt(); registerPWA();
    const sess=loadSession(); if(sess?.accessToken&&!App.access[sess.role]) App.access[sess.role]=sess.accessToken;
    const canResume=(App.entry==='admin'&&sess?.role==='host'&&App.access.host)||(App.entry==='team'&&sess?.role==='team'&&App.access.team);
    if(canResume&&sess?.gameId&&(sess.role==='host'||Number.isInteger(sess.teamId))) resumeSession(sess); else render(true);
    window.__appBooted=true;
  }catch(error){
    console.error('App bootstrap failed',error);
    window.__showBootFallback?.();
  }
}

if(document.readyState==='loading'){
  window.addEventListener('DOMContentLoaded',bootApp);
}else{
  bootApp();
}
window.addEventListener('popstate',()=>{App.socket?.close();App.socket=null;clearPendingAction();resetGameFx();App.connected=false;App.entry=routeEntry();App.screen='home';render(true);});
window.addEventListener('resize',fitBoard);window.addEventListener('orientationchange',()=>setTimeout(fitBoard,300));
window.addEventListener('online',()=>App.socket?.reconnectNow());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!App.connected)App.socket?.reconnectNow();});

