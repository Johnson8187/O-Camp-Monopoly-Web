import { G } from './game-core.js';

const App = {
  screen: 'home', role: null, gameId: null, state: null, teamId: null,
  token: null, gameMeta: null, socket: null, connected: false,
  tab: 'main', zoom: false, dice: null, rolling: false, busy: false,
  highlight: [], cfg: false, history: [], teamPins: [], lobbyTimer: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phaseNames = {setup:'準備中', market:'公布股市', sell:'出售基地', shop:'商店與道具', roll:'擲骰移動', ended:'已結束'};
const roleNames = {host:'主持人', team:'隊輔', viewer:'觀眾'};

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
async function api(path, options={}){
  const r = await fetch(path, {cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}});
  const text = await r.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = {error:text}; }
  if(!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
function saveSession(){
  localStorage.setItem('preview:session', JSON.stringify({gameId:App.gameId,role:App.role,teamId:App.teamId,token:App.token,teamPins:App.teamPins||[]}));
}
function loadSession(){ try { return JSON.parse(localStorage.getItem('preview:session') || 'null'); } catch { return null; } }
function clearSession(){ localStorage.removeItem('preview:session'); }
function socketURL(gameId){
  const u = new URL(location.href); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/ws/${encodeURIComponent(gameId)}`; u.search = ''; return u.toString();
}

class LiveSocket {
  constructor(gameId, role, token, teamId){ this.gameId=gameId; this.role=role; this.token=token; this.teamId=teamId; this.ws=null; }
  connect(){
    this.ws = new WebSocket(socketURL(this.gameId));
    this.ws.onopen = () => { App.connected=true; render(true); this.send({type:'hello',role:this.role,token:this.token||'',teamId:this.teamId}); };
    this.ws.onclose = () => { App.connected=false; render(true); toast('即時連線已中斷，請重新整理或回到首頁', true); };
    this.ws.onerror = () => { App.connected=false; render(true); };
    this.ws.onmessage = (e) => {
      let m; try { m=JSON.parse(e.data); } catch { return; }
      if(m.type==='state'){ App.state=m.state; App.gameMeta={...App.gameMeta,status:m.status}; render(true); }
      else if(m.type==='hello_ok'){ App.connected=true; App.state=m.state; App.gameMeta={...App.gameMeta,...m.meta}; saveSession(); render(true); }
      else if(m.type==='error'){ App.busy=false; toast(m.error || '操作失敗', true); render(true); }
      else if(m.type==='notice'){ toast(m.message || ''); }
    };
  }
  send(message){ if(this.ws?.readyState===WebSocket.OPEN) this.ws.send(JSON.stringify(message)); else toast('尚未連線完成', true); }
  close(){ try { this.ws?.close(); } catch {} this.ws=null; }
}

function sprite(type,size){
  const g=G.SPR[G.SPRKEY[type]], pal=G.PAL[type];
  let out=`<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">`;
  for(let y=0;y<g.length;y++) for(let x=0;x<g[y].length;x++){ const c=pal[g[y][x]]; if(c) out+=`<rect x="${x}" y="${y}" width="1.05" height="1.05" fill="${c}"/>`; }
  return out+'</svg>';
}
function setHome(){
  App.socket?.close(); App.socket=null; App.screen='home'; App.role=null; App.gameId=null; App.state=null;
  App.teamId=null; App.token=null; App.gameMeta=null; App.connected=false; App.history=[]; clearSession();
  render(true); refreshLobby();
}
function openGame(game, role, token='', teamId=null){
  clearInterval(App.lobbyTimer); App.gameId=game.id; App.gameMeta=game; App.role=role; App.token=token; App.teamId=teamId; App.screen='game'; App.tab='main'; App.state=null; App.connected=false;
  App.socket?.close(); App.socket=new LiveSocket(game.id,role,token,teamId); App.socket.connect(); render(true);
}

async function refreshLobby(){
  if(App.screen!=='home') return;
  const list=$('lobbyList'); if(!list) return;
  try{
    const data=await api('/api/lobby');
    if(!data.games?.length){ list.innerHTML='<div class="note">目前沒有開放中的活動。主持人建立活動後，這裡會出現可加入的活動。</div>'; return; }
    list.innerHTML=data.games.map(g=>`<div class="lobby-item">
      <h3>${esc(g.name)}</h3><div class="lobby-meta">活動識別：${esc(g.id)}　隊伍：${g.teamCount} 隊　已加入：${g.joinedCount} 隊<br>狀態：${esc(phaseNames[g.status]||g.status)}　更新：${esc(g.updatedAt||'')}</div>
      <div class="lobby-actions"><button class="btn blue watch" data-id="${esc(g.id)}">進入觀戰</button><button class="btn green team" data-id="${esc(g.id)}">隊輔加入</button></div>
    </div>`).join('');
    list.querySelectorAll('.watch').forEach(b=>b.onclick=()=>{const g=data.games.find(x=>x.id===b.dataset.id)||{id:b.dataset.id,name:'活動'};openGame(g,'viewer');});
    list.querySelectorAll('.team').forEach(b=>b.onclick=()=>{const g=data.games.find(x=>x.id===b.dataset.id)||{id:b.dataset.id,name:'活動'};showTeamJoin(g);});
  }catch(e){ list.innerHTML=`<div class="note warn">活動清單載入失敗：${esc(e.message)}</div>`; }
}
function renderHome(){
  $('app').innerHTML=`<div class="hd"><div class="t1">人生大富翁</div><div class="t2">營隊大地遊戲 · 即時連線版</div></div>
  <div class="card"><div class="ch">★ 目前開放中的活動</div><div class="cb"><div id="lobbyList" class="lobby-list">載入中…</div><button class="btn sm gold" id="refreshLobby" style="margin-top:10px">重新整理活動</button></div></div>
  <div class="card"><div class="ch">★ 主持人控制台</div><div class="cb"><input id="gameName" placeholder="活動名稱，例如：2026 夏令營人生大富翁"><label class="fl"><span>隊伍數量</span><input id="teamCount" type="number" value="10" min="2" max="${G.BASE_IDX.length}"><span class="u">隊</span></label><button class="btn green" id="createGame">建立並開放活動</button><div class="note">隊伍數量不是寫死的，主持人建立活動時可設定；上限依目前棋盤可分配的基地格數量決定。</div></div></div>
  <div class="card"><div class="ch">★ 加入方式</div><div class="cb note">主持人建立活動後，所有人直接在上方清單選擇活動，不需要輸入房號。隊輔選擇自己的隊伍並輸入主持人提供的隊伍 PIN；其他人選擇「進入觀戰」即可唯讀觀看。</div></div>
  <div id="resumeBox"></div>`;
  $('refreshLobby').onclick=refreshLobby; $('createGame').onclick=createGame;
  const sess=loadSession();
  if(sess?.gameId){ $('resumeBox').innerHTML=`<div class="card"><div class="ch">★ 繼續上次連線</div><div class="cb">活動：<b>${esc(sess.gameId)}</b>　身分：${esc(roleNames[sess.role]||sess.role)}<br><br><button class="btn green" id="resume">回到活動</button><button class="btn sm ink" id="forget">清除本機連線</button></div></div>`; $('resume').onclick=()=>resumeSession(sess); $('forget').onclick=()=>{clearSession();renderHome();}; }
  clearInterval(App.lobbyTimer); App.lobbyTimer=setInterval(refreshLobby,8000); refreshLobby();
}
async function createGame(){
  const name=($('gameName').value||'未命名活動').trim(); const teamCount=Math.max(2,Math.min(G.BASE_IDX.length,Number($('teamCount').value)||10));
  try{ const g=await api('/api/games',{method:'POST',body:JSON.stringify({name,teamCount})}); App.teamPins=g.teamPins; openGame(g,'host',g.hostToken,null); toast('活動已建立，請把各隊 PIN 提供給對應隊輔'); } catch(e){ toast('建立活動失敗：'+e.message,true); }
}
function showTeamJoin(game){
  App.screen='join'; App.gameMeta=game; App.gameId=game.id;
  $('app').innerHTML=`<div class="card"><div class="ch">★ ${esc(game.name||'活動')} — 隊輔加入</div><div class="cb"><div class="note">不需要輸入房號；請選擇你的隊伍，並輸入主持人提供的隊伍 PIN。</div><select id="joinTeam">${Array.from({length:Math.max(2,game.teamCount||G.BASE_IDX.length)},(_,i)=>`<option value="${i}">第 ${i+1} 組</option>`).join('')}</select><input id="teamPin" inputmode="numeric" maxlength="6" placeholder="隊伍 PIN"><button class="btn green" id="joinTeamBtn">開始連線</button><button class="btn sm ink" id="backHome">返回活動清單</button></div></div>`;
  $('joinTeamBtn').onclick=()=>{ const team=Number($('joinTeam').value); const pin=($('teamPin').value||'').trim(); if(!pin){toast('請輸入隊伍 PIN',true);return;} openGame(game,'team',pin,team); };
  $('backHome').onclick=setHome;
}
function resumeSession(sess){ App.teamPins=sess.teamPins||[]; openGame({id:sess.gameId,name:'活動'},sess.role,sess.token,sess.teamId); }

function boardHTML(){
  const S=App.state, cell=46,gap=4,W=11*(cell+gap),H=10*(cell+gap); let out=`<div class="bwrap ${App.zoom?'zoomed':'fit'}" id="bwrap"><div class="board" id="board" style="width:${W}px;height:${H}px">`;
  G.TRACK.forEach((t,i)=>{ const [kind,c,r]=t,T=G.TILE[kind],own=G.ownerOf(S,i),here=S.teams.filter(x=>x.pos===i),hot=App.highlight.includes(i),locked=kind==='stage'&&!S.unlocked.includes(i); out+=`<div class="tile" data-i="${i}" style="left:${c*(cell+gap)}px;top:${r*(cell+gap)}px;background:${hot?'#ffdcdc':T.bg};border-color:${hot?'#e23b3b':'#14110f'}">${sprite(kind,22)}<div class="tl" style="color:${T.fg}">${T.n}</div>${locked?'<div class="lock"></div>':''}${own?`<div class="ow" style="background:${own.color};color:${G.LIGHT_FG.includes(own.id)?'#14110f':'#fff'}">${own.id+1}</div>`:''}${here.length?`<div class="pins">${here.slice(0,4).map(h=>`<i style="background:${h.color}">${h.id+1}</i>`).join('')}${here.length>4?`<i class="more">+${here.length-4}</i>`:''}</div>`:''}</div>`; });
  return out+'</div></div><button class="btn sm gold" id="bZoom">'+(App.zoom?'符合螢幕':'放大檢視')+'</button>';
}
function fitBoard(){ if(App.screen!=='game') return; const wrap=$('bwrap'),bd=$('board'); if(!wrap||!bd) return; if(App.zoom){bd.style.transform='';wrap.style.height='';return;} const max=Math.min($('app').clientWidth-24,620),scale=Math.min(1,max/bd.offsetWidth); bd.style.transformOrigin='top left';bd.style.transform=`scale(${scale})`;wrap.style.height=`${bd.offsetHeight*scale}px`; }
function tileDesc(i){ const S=App.state,kind=G.TRACK[i][0],own=G.ownerOf(S,i); const descriptions={base:'基地：可持有、升級、出售或收取過夜費。',safe:'安全格：沒有額外效果。',tax:'稅收格：支付稅金給銀行。',fate:'命運格：抽取一張命運卡。',black:'黑市：下一次商店消費折扣。',casino:'賭場：支付賭資並依規則抽獎。',bank:'銀行密道：取得銀行池的一部分。',worm:'蟲洞：傳送到另一個蟲洞。',jail:'監獄：下一回合停留。',exch:'交易所：查看市場資訊。',stage:'關卡：由主持人解封後觸發。',start:'起點：經過或停留可取得繞圈獎勵。'}; return `${descriptions[kind]||''}${own?`<br>目前領地：${esc(own.name)}`:''}`; }
function rankingHTML(){ const S=App.state; return `<div class="card"><div class="ch">★ 即時排行榜</div><div class="cb">${[...S.teams].sort((a,b)=>G.netWorth(S,b)-G.netWorth(S,a)).map((t,i)=>`<div class="rk"><div class="rn">${i+1}</div><div class="sw" style="background:${t.color}"></div><div class="rname">${esc(t.name)}<div class="dim">${t.joined?'已連線':'尚未連線'}</div></div><div class="rval">${G.money(G.netWorth(S,t))}<br><span class="dim">${t.pts} 點</span></div></div>`).join('')}</div></div>`; }
function logHTML(){ return `<div class="card"><div class="ch">★ 遊戲紀錄</div><div class="cb">${(App.state.log||[]).slice(0,80).map(x=>`<div class="lg">${esc(x)}</div>`).join('')||'<div class="note">尚無紀錄</div>'}</div></div>`; }
function teamControls(){
  const S=App.state, me=App.teamId!==null?S.teams[App.teamId]:null; if(App.role==='viewer'||!me) return `<div class="viewer-note">你目前是觀眾，只能觀看棋盤、排行榜與即時紀錄；遊戲操作由各隊隊輔與主持人控制。</div>`;
  let h=`<div class="card"><div class="ch">★ ${esc(me.name)} 的操作</div><div class="cb">`;
  if(S.phase==='roll'){ h+=`<div class="dice" id="dice">${App.dice??'?'}</div><button class="btn green" id="bRoll" ${me.rolled||App.busy?'disabled':''}>${me.rolled?'本回合已骰過':App.busy?'處理中…':'擲骰子'}</button>`; }
  if(S.phase==='shop'){ h+=`<div class="note">目前是商店階段。</div>${S.settings.gambles.map((g,i)=>`<button class="btn sm purple gam" data-i="${i}">${g.name}　${G.costWithDiscount(S,me,g.cost)} 點</button>`).join('')}${Object.entries(S.settings.buffs).map(([k,b])=>`<button class="btn sm blue buf" data-k="${k}">${b.name}　${G.costWithDiscount(S,me,b.cost)} 點</button>`).join('')}`; }
  if(S.phase==='roll'){ h+=`<div class="seg">特殊操作</div>${Object.entries(S.settings.attacks).map(([k,a])=>`<button class="btn sm dark atk" data-k="${k}">${a.name}　${G.costWithDiscount(S,me,a.cost)} 點</button>`).join('')}<button class="btn sm ink" id="bBattle">使用 BATTLE（剩 ${me.battles} 次）</button>`; }
  h+=`<div class="seg">基地與道具</div><div class="small-grid"><button class="btn sm green" id="bUp">升級基地</button><button class="btn sm gold" id="bSell">賣出基地</button><button class="btn sm blue" id="bBuyBack">買回基地</button><button class="btn sm outline" id="bReroll">重骰卡（${me.buffs.reroll}）</button></div></div></div>`; return h;
}
function cfgHTML(){ const S=App.state; const f=(label,path,val,suf='')=>`<label class="fl"><span>${label}</span><input class="cfg" data-p="${path}" type="number" value="${val}"><span class="u">${suf}</span></label>`; let h='<div class="cfgbox">'; h+=f('繞圈獎勵','lapBonus',S.settings.lapBonus);h+=f('稅收扣款','taxAmount',S.settings.taxAmount);h+=f('賭場花費','casinoCost',S.settings.casinoCost);h+=f('黑市折扣','blackDiscount',S.settings.blackDiscount,'%');h+=f('銀行密道取走','bankShare',S.settings.bankShare,'%');h+=f('骰子面數','diceSides',S.settings.diceSides,'面');h+=f('通行費佔過夜費','passRatio',S.settings.passRatio,'%');h+='<div class="sub">基地等級</div>';S.settings.levels.forEach((lv,i)=>{h+=`<div class="grp"><b>Lv${i+1}「${lv.name}」</b>`+f('過夜費',`levels.${i}.stay`,lv.stay)+f('升級點數',`levels.${i}.up`,lv.up)+f('賣出價值',`levels.${i}.sell`,lv.sell)+'</div>';});return h+'</div>'; }
function hostPanel(){
  const S=App.state; let h='<div class="card"><div class="ch">★ 主持人控制台</div><div class="cb">';
  h+=`<div class="connection-row"><span class="role-pill">主持人控制權</span><span class="status ${App.connected?'':'off'}"><i class="status-dot"></i>${App.connected?'已連線':'未連線'}</span></div>`;
  if(App.teamPins?.length){ h+='<div class="sub">請把各隊 PIN 私下提供給對應隊輔</div><div class="pin-list">'+App.teamPins.map((p,i)=>`<div class="pin-item">第 ${i+1} 組：<code>${esc(p)}</code></div>`).join('')+'</div>'; }
  h+=`<div class="sub">活動流程</div><div class="small-grid">${S.phase==='setup'?'<button class="btn sm gold" id="bAssign">重新抽籤</button><button class="btn sm green" id="bStart">開始遊戲</button>':''}${!['setup','ended'].includes(S.phase)?'<button class="btn sm blue" id="bNext">進入下一階段</button>':''}<button class="btn sm dark" id="bEnd">結束並保存紀錄</button></div>`;
  h+='<div class="sub">隊伍名稱</div><textarea id="teamNames">'+S.teams.map(t=>t.name).join('\n')+'</textarea><button class="btn sm green" id="saveNames">儲存隊伍名稱</button>';
  h+='<div class="sub">主持人調整</div>'; h+=S.teams.map((t,i)=>`<div class="adj2"><div class="sw" style="background:${t.color}">${i+1}</div><div class="an2">${esc(t.name)}<span class="dim">現金 ${G.money(t.cash)}／點數 ${t.pts}</span></div><div class="ain"><input class="cash" data-i="${i}" type="number" placeholder="現金"><button class="btn xs gold csgo" data-i="${i}">調整</button></div><div class="ain"><input class="pts" data-i="${i}" type="number" placeholder="點數"><button class="btn xs blue ptgo" data-i="${i}">調整</button></div></div>`).join('');
  h+='<div class="sub">股市與關卡</div><div class="row wrap mkrow">'+S.settings.marketOrder.map(k=>`<button class="tg mk" data-k="${k}">${S.settings.marketNames[k]}<span class="mx">×${S.settings.market[k]/100}</span></button>`).join('')+'</div><div class="row wrap">'+G.STAGE_IDX.map(i=>`<button class="btn xs purple unl" data-i="${i}">解封第 ${i+1} 格</button>`).join('')+'</div>';
  h+='<button class="btn sm outline" id="showHistory">查看 D1 歷史紀錄</button><div id="historyBox"></div><button class="btn sm gold" id="bCfg">'+(App.cfg?'收起設定':'展開設定')+'</button>'+(App.cfg?cfgHTML():'')+'</div></div>';return h;
}
function renderGame(){
  const S=App.state;if(!S){$('app').innerHTML='<div class="card"><div class="cb">正在建立即時連線…</div></div>';return;}
  const tabs=[['main','遊戲'],['log','紀錄']];if(App.role==='host')tabs.push(['host','主控']);if(!tabs.some(x=>x[0]===App.tab))App.tab='main';
  let body=''; if(App.tab==='main') body=`<div class="card"><div class="ch">★ 棋盤 — 點格子查看說明</div><div class="cb">${boardHTML()}<div class="note">左上小方塊＝領地擁有者　右下圓點＝隊伍位置　綠色遮罩＝關卡未解封</div></div></div>${teamControls()}${rankingHTML()}`; if(App.tab==='log') body=logHTML(); if(App.tab==='host'&&App.role==='host') body=hostPanel();
  $('app').innerHTML=`<div class="bar"><div><span class="code2">${esc(App.gameMeta?.name||S.code)}</span><br><span class="ph">${esc(phaseNames[S.phase]||S.phase)} · 第 ${S.round} 回合</span></div><div class="connection-row"><span class="role-pill">${esc(roleNames[App.role])}</span><span class="status ${App.connected?'':'off'}"><i class="status-dot"></i>${App.connected?'即時連線':'重新連線中'}</span></div></div><div class="game-head"><div class="row tabs">${tabs.map(([k,n])=>`<button class="tg tb ${App.tab===k?'on':''}" data-k="${k}">${n}</button>`).join('')}</div><div class="head-actions"><button class="btn xs ink" id="leaveGame">離開</button></div></div>${body}`;
  bindGame(); fitBoard();
}
function send(action,payload={}){ if(!App.socket){toast('尚未連線',true);return;} App.busy=true;App.socket.send({type:'action',action,payload});setTimeout(()=>{App.busy=false;},1800); }
function bindGame(){
  const S=App.state, bind=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>{App.tab=b.dataset.k;render(true);});
  bind('leaveGame',()=>{if(confirm('離開目前活動？'))setHome();}); bind('bZoom',()=>{App.zoom=!App.zoom;render(true);});
  document.querySelectorAll('.tile').forEach(t=>t.onclick=()=>{const i=Number(t.dataset.i);$('modalTitle').textContent=`第 ${i+1} 格 — ${G.TILE[G.TRACK[i][0]].n}`;$('modalBody').innerHTML=`<div class="mrow">${sprite(G.TRACK[i][0],40)}<div>${tileDesc(i)}</div></div>`;$('modal').style.display='flex';});
  if(App.role==='team'&&App.teamId!==null){
    const me=S.teams[App.teamId];bind('bRoll',()=>ask('擲骰子？',`${esc(me.name)} 準備移動`,()=>send('roll')));bind('bReroll',()=>ask('使用重骰卡？','會清除本回合骰點，重新骰一次',()=>send('reroll')));bind('bBattle',()=>ask('使用 BATTLE？','使用一次 BATTLE 並交由關主裁決',()=>send('battle')));bind('bUp',()=>send('upgrade'));bind('bSell',()=>send('sell'));bind('bBuyBack',()=>send('buyBack'));
    document.querySelectorAll('.atk').forEach(b=>b.onclick=()=>send('attack',{kind:b.dataset.k}));document.querySelectorAll('.gam').forEach(b=>b.onclick=()=>send('gamble',{index:Number(b.dataset.i)}));document.querySelectorAll('.buf').forEach(b=>b.onclick=()=>send('buff',{kind:b.dataset.k}));
  }
  if(App.role==='host'){
    bind('bAssign',()=>ask('重新抽籤？','會重新分配所有隊伍的基地',()=>send('assignBases')));bind('bStart',()=>ask('開始遊戲？','開始後隊伍可以依流程進行操作',()=>send('startGame')));bind('bNext',()=>send('nextPhase'));bind('bEnd',()=>ask('結束活動？','結束後會保存到 D1 歷史紀錄，活動不再出現在公開大廳。',()=>send('endGame')));bind('bCfg',()=>{App.cfg=!App.cfg;render(true);});
    bind('saveNames',()=>{const names=$('teamNames').value.split(/\r?\n/).map(x=>x.trim());send('renameTeams',{names});});bind('showHistory',loadHistory);
    document.querySelectorAll('.mk').forEach(b=>b.onclick=()=>send('setMarket',{kind:b.dataset.k}));document.querySelectorAll('.unl').forEach(b=>b.onclick=()=>send('unlock',{index:Number(b.dataset.i)}));
    document.querySelectorAll('.csgo').forEach(b=>b.onclick=()=>{const v=Number(document.querySelector(`.cash[data-i="${b.dataset.i}"]`).value);if(Number.isFinite(v))send('adjustCash',{teamId:Number(b.dataset.i),amount:v});});document.querySelectorAll('.ptgo').forEach(b=>b.onclick=()=>{const v=Number(document.querySelector(`.pts[data-i="${b.dataset.i}"]`).value);if(Number.isFinite(v))send('adjustPts',{teamId:Number(b.dataset.i),amount:v});});
    document.querySelectorAll('.cfg').forEach(inp=>inp.onchange=()=>send('setConfig',{path:inp.dataset.p,value:Number(inp.value)}));
  }
}
async function loadHistory(){
  try{const data=await api(`/api/games/${encodeURIComponent(App.gameId)}/history`,{headers:{Authorization:`Bearer ${App.token}`}});App.history=data.events||[];const box=$('historyBox');if(box)box.innerHTML=`<div class="history-item">共 ${App.history.length} 筆事件</div>`+App.history.slice(0,80).map(e=>`<div class="history-item">${esc(e.createdAt)}　${esc(e.actorRole)}${e.actorTeam!==null&&e.actorTeam!==undefined?'／第 '+(e.actorTeam+1)+' 組':''}<br>${esc(e.eventType)}：${esc(e.message||'')}</div>`).join('');}catch(e){toast('歷史紀錄讀取失敗：'+e.message,true);}
}
function render(force=false){ if(App.screen==='home'){renderHome();return;}if(App.screen==='join')return;if(App.screen==='game')renderGame(); }
window.addEventListener('DOMContentLoaded',()=>{ $('modalClose').onclick=()=>{$('modal').style.display='none';};$('modal').onclick=e=>{if(e.target.id==='modal')$('modal').style.display='none';};$('bHome').onclick=()=>{if(confirm('回到活動清單？'))setHome();};render(true); });
window.addEventListener('resize',fitBoard);window.addEventListener('orientationchange',()=>setTimeout(fitBoard,300));
