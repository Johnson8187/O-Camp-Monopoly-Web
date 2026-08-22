const BUILD_VERSION = '2026.08.22.45';
import { G } from './game-core.js?v=2026.08.22.45';
import { PHASE_FX, ATTACK_FX, SoundFX, isSoundEnabled, toggleSound, classifyEvent, movementPath, presentationTier, isPresentationTaskRelevant, isPurchaseReceipt } from './game-fx.js?v=2026.08.22.45';

// Disable iOS / PWA pinch-zoom and gesture zooming
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

// Disable accidental double-tap to zoom on touch devices
let _lastTouchTime = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - _lastTouchTime <= 300) {
    if (e.target && !['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(e.target.tagName)) {
      e.preventDefault();
      e.target.click?.();
    }
  }
  _lastTouchTime = now;
}, { passive: false });

















const App = {
  screen: 'home', entry: 'home', role: null, gameId: null, state: null, teamId: null,
  token: null, gameMeta: null, socket: null, connected: false,
  tab: 'main', zoom: false, dice: null, rolling: false, busy: false,
  highlight: [], cfg: false, history: [], lobbyTimer: null, homeIntroTimer:null,
  access: {host: '', team: '', dev: ''}, installPrompt: null,
  pendingAction: null, pendingTimer: null, actionSeq: 0, updateReady: false, applyingUpdate: false,
  sound: isSoundEnabled(), audioReady:false, radarFocus: null, _radarTimer: null,
  devTab: 'overview', devEventsFilter: { gameId: '', eventType: '', actorRole: '', search: '' }, devGamesFilter: { status: 'all', search: '' },
  fxQueue: [], isFxRunning: false,
  fx: {phase:null,event:null,attack:null,aftershock:null,upgrade:null,sell:null,purchase:null,teamMoment:null,battlePrompt:null,assignment:null,dice:null,camera:null,positions:{},timers:{},stepText:''},
  hostDrafts:{}, hostSection:'flow', editingTeamName:null, receiptScope:'mine', leaving:false, leaveActionId:null, leaveTimer:null, battlePromptDone:null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CAMP_NAME = '不「管」別人「工」蝦毀 都來「電」惦賭「醫」把';
function campFooterHTML(){ return `<footer class="camp-footer">© 2026 ${esc(CAMP_NAME)} 版權所有</footer>`; }
function entryBackHomeHTML(){return `<button type="button" class="entry-back-home" data-entry-home><span>←</span><b>回首頁</b></button>`;}
function bindEntryBackHome(){document.querySelectorAll('[data-entry-home]').forEach(button=>button.onclick=()=>go('/'));}
const phaseNames = {setup:'準備中', lobby:'準備中', running:'進行中', market:'公布房市', sell:'出售基地', shop:'商店與道具', roll:'擲骰移動', settle:'最終結算', ended:'已結束', paused:'已暫停'};

const roleNames = {host:'主持人', team:'隊輔', viewer:'觀眾', dev:'開發者'};

function accessKey(role){ return role === 'host' ? 'preview:admin-access' : role === 'team' ? 'preview:team-access' : 'preview:dev-access'; }
function loadAccess(){ try{ App.access.host=sessionStorage.getItem(accessKey('host'))||''; App.access.team=sessionStorage.getItem(accessKey('team'))||''; App.access.dev=sessionStorage.getItem(accessKey('dev'))||''; }catch{} }
function saveAccess(role,password){ App.access[role]=password; try{ sessionStorage.setItem(accessKey(role),password); }catch{} }
function clearAccess(role){ App.access[role]=''; try{ sessionStorage.removeItem(accessKey(role)); }catch{} }

function currentPresentationTier(){return presentationTier({role:App.role||'',width:window.innerWidth,reducedMotion:Boolean(reducedMotion),hardwareConcurrency:navigator.hardwareConcurrency||8,deviceMemory:navigator.deviceMemory||8});}
function syncChrome(){ const inGame=App.screen==='game'; const isDev=App.entry==='dev'; const viewerLive=inGame&&App.role==='viewer'&&App.state&&!['settle','ended'].includes(App.state.phase),lifeHome=App.screen==='home'&&App.entry==='home',tier=currentPresentationTier(); document.body.classList.toggle('in-game',inGame); document.body.classList.toggle('in-dev',isDev); document.body.classList.toggle('life-home-mode',lifeHome);if(!lifeHome)document.body.classList.remove('life-intro-active'); document.body.classList.toggle('viewer-live-mode',viewerLive); ['host','team','viewer','dev'].forEach(role=>document.body.classList.toggle(`role-${role}`,inGame&&App.role===role)); ['cinematic','party','compact','lite','reduced'].forEach(level=>document.body.classList.toggle(`fx-${level}`,inGame&&tier===level)); syncUpdatePrompt(); }
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
function showIosInstallGuideModal(){
  $('modalTitle').textContent = 'iPhone / iPad 加入主畫面教學';
  $('modalBody').innerHTML = `
    <div class="install-guide-box">
      <div class="guide-step-card">
        <span class="guide-num">1</span>
        <div>點擊 Safari 底部工具列的 <b>「分享」</b> 按鈕（方框向上箭頭）。</div>
      </div>
      <div class="guide-step-card">
        <span class="guide-num">2</span>
        <div>在選單中往下滑動，點選 <b>「加入主畫面」</b>。</div>
      </div>
      <div class="guide-step-card">
        <span class="guide-num">3</span>
        <div>點擊右上角的 <b>「新增」</b>，即可在桌面以全螢幕 App 方式直接開啟！</div>
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button type="button" class="btn gold sm" id="btnCloseInstallGuide">我知道了</button>
      </div>
    </div>
  `;
  $('modal').style.display = 'flex';
  const btnClose = $('btnCloseInstallGuide');
  if(btnClose) btnClose.onclick = () => { $('modal').style.display = 'none'; };
}

function isMobileDevice(){
  try{
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  }catch{
    return false;
  }
}

function enableInstallPrompt(){
  let isStandalone = false;
  try{
    isStandalone = Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone);
  }catch{}
  const b = $('installPwa');
  const isMobile = isMobileDevice();
  if(b){
    if(isMobile && !isStandalone){
      b.hidden = false;
      b.style.display = 'inline-flex';
    }else{
      b.hidden = true;
      b.style.display = 'none';
    }
    b.onclick = async () => {
      if(App.installPrompt){
        try{
          await App.installPrompt.prompt();
          App.installPrompt = null;
        }catch{}
        return;
      }
      let isIOS = false;
      try{
        isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
      }catch{}
      if(isIOS){
        showIosInstallGuideModal();
      }else{
        toast('請點擊瀏覽器右上角選單（⋮），選擇「安裝應用程式」或「加到主畫面」');
      }
    };
  }
  window.addEventListener('beforeinstallprompt', e => {
    try{
      e.preventDefault();
      App.installPrompt = e;
      if(b && isMobile && !isStandalone){
        b.hidden = false;
        b.style.display = 'inline-flex';
      }
    }catch{}
  });
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

function resetGameFx(){
  App.fxQueue=[];
  App.isFxRunning=false;
  Object.values(App.fx.timers).forEach(clearTimeout);
  App.fx={phase:null,event:null,attack:null,aftershock:null,upgrade:null,sell:null,purchase:null,teamMoment:null,battlePrompt:null,assignment:null,dice:null,camera:null,positions:{},timers:{},stepText:''};
  App.battlePromptDone=null;
  App.highlight=[];
  document.querySelectorAll('.moving-token').forEach(el=>el.remove());
  const wrap=$('bwrap');
  if(wrap)wrap.classList.remove('camera-active');
}

function activeFxStatus(){
  if(!App.isFxRunning && !App.fxQueue?.length && !Object.keys(App.fx.positions || {}).length) return null;
  let currentDesc = '';
  if(App.fx.dice) currentDesc = `【${App.fx.dice.teamName || '隊伍'}】擲骰移動`;
  else if(Object.keys(App.fx.positions || {}).length) currentDesc = '隊伍棋盤移動';
  else if(App.fx.upgrade) currentDesc = `【${App.fx.upgrade.teamName || '隊伍'}】基地升級`;
  else if(App.fx.sell) currentDesc = `【${App.fx.sell.teamName || '隊伍'}】變賣基地`;
  else if(App.fx.purchase) currentDesc = `【${App.fx.purchase.teamName || '隊伍'}】購買道具`;
  else if(App.fx.teamMoment) currentDesc = `【${App.fx.teamMoment.teamName || '隊伍'}】${App.fx.teamMoment.title || '小隊事件'}`;
  else if(App.fx.battlePrompt) currentDesc = '等待隊伍選擇付款或 BATTLE';
  else if(App.fx.attack) currentDesc = `【${App.fx.attack.teamName || '隊伍'}】${App.fx.attack.title || '特殊操作'}`;
  else if(App.fx.aftershock) currentDesc = '特殊操作棋盤餘波';
  else if(App.fx.assignment) currentDesc = '人生起點抽籤';
  else if(App.fx.phase) currentDesc = `${App.fx.phase.title || '階段切換'}`;
  else if(App.fx.event) currentDesc = `事件公告（${App.fx.event.message || ''}）`;
  else if(App.fxQueue?.length) {
    const next = App.fxQueue[0];
    const typeNames = {roll:'隊伍擲骰移動', upgrade:'基地升級', sell:'基地變賣', purchase:'購買道具', teamMoment:'小隊人生事件', rank:'排名提升', teamTurn:'輪到本隊', battlePrompt:'基地 BATTLE 選擇', attack:'特殊操作', event:'事件公告', assignment:'基地抽籤', phase:'階段切換'};
    currentDesc = typeNames[next.type] || '特效動畫';
  } else {
    currentDesc = '特效動畫';
  }
  const pendingCount = App.fxQueue?.length || 0;
  return {
    desc: currentDesc,
    count: pendingCount,
    text: `請等待${currentDesc}完成${pendingCount > 0 ? `（還有 ${pendingCount} 個排隊中）` : ''}`
  };
}

function enqueueFx(task){

  if(!task)return;
  if(!isPresentationTaskRelevant(task,{role:App.role,teamId:App.teamId,state:App.state}))return;
  task.presentationId=task.presentationId||`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  App.fxQueue.push(task);
  if(!App.isFxRunning){
    runNextFx();
  }
}

function runNextFx(){
  if(!App.fxQueue.length){
    App.isFxRunning=false;
    renderFx();
    return;
  }
  App.isFxRunning=true;
  const task=App.fxQueue.shift();
  let finished=false;
  let watchdog=null;
  const done=()=>{
    if(finished)return;
    finished=true;
    clearTimeout(watchdog);
    runNextFx();
  };
  watchdog=task.type==='battlePrompt'?null:setTimeout(done,14000);

  try{
    switch(task.type){
      case 'phase':
        executePhaseFx(task.data,done);
        break;
      case 'assignment':
        executeAssignmentFx(task.next,done);
        break;
      case 'upgrade':
        executeUpgradeFx(task.team,done);
        break;
      case 'sell':
        executeSellFx(task.team,task.tileIndex,done);
        break;
      case 'purchase':
        executePurchaseFx(task.purchase,task.team,done);
        break;
      case 'teamMoment':
      case 'rank':
      case 'teamTurn':
        executeTeamMomentFx(task,done);
        break;
      case 'battlePrompt':
        executeBattlePromptFx(task,done);
        break;
      case 'attack':
        executeAttackFx(task.attack,task.message,task.next,done);
        break;
      case 'roll':
        executeRollFx(task,done);
        break;
      case 'event':
        executeEventFx(task.message,done);
        break;
      default:
        done();
    }
  }catch(err){
    console.error('FX execution error',err);
    done();
  }
}

function executePhaseFx(data,done){
  App.fx.phase=data;
  if(data?.kind==='settle'||data?.kind==='ended'){
    SoundFX.playVictory();
  }else{
    SoundFX.playPhaseChange();
  }
  renderFx();
  fxTimeout('phase',()=>{
    App.fx.phase=null;
    renderFx();
    done();
  },reducedMotion?800:2200);
}


function executeUpgradeFx(team,done){
  if(!team||team.baseIdx===null){done();return;}
  App.fx.upgrade={tileIndex:team.baseIdx,teamId:team.id,teamName:team.name,level:team.level,color:team.color};
  App.fx.camera={teamId:team.id,pos:team.baseIdx};
  activateMovementCamera();
  SoundFX.playUpgrade();
  renderFx();
  fxTimeout('upgrade',()=>{
    App.fx.upgrade=null;
    App.fx.camera=null;
    const wrap=$('bwrap');
    if(wrap&&!Object.keys(App.fx.positions).length)wrap.classList.remove('camera-active');
    fitBoard();
    renderFx();
    done();
  },reducedMotion?1000:2100);
}

function executeSellFx(team,tileIndex,done){
  const idx=tileIndex??team?.baseIdx;
  if(!team||idx===null||idx===undefined){done();return;}
  App.fx.sell={tileIndex:idx,teamId:team.id,teamName:team.name,color:team.color};
  App.fx.camera={teamId:team.id,pos:idx};
  activateMovementCamera();
  SoundFX.playSell();
  renderFx();
  fxTimeout('sell',()=>{
    App.fx.sell=null;
    App.fx.camera=null;
    const wrap=$('bwrap');
    if(wrap&&!Object.keys(App.fx.positions).length)wrap.classList.remove('camera-active');
    fitBoard();
    renderFx();
    done();
  },reducedMotion?1000:2100);
}
function skipPresentationFx(){resetGameFx();render(true);toast('已略過目前視覺演出，遊戲狀態未受影響');}

function executePurchaseFx(purchase,team,done){
  if(!purchase||!team){done();return;}
  App.fx.purchase={...purchase,teamName:team.name,color:team.color};
  SoundFX.playCoinReward();
  renderFx();
  fxTimeout('purchase',()=>{App.fx.purchase=null;renderFx();done();},reducedMotion?900:2100);
}

function executeTeamMomentFx(task,done){
  const team=task.team||App.state?.teams?.[task.teamId];if(!team){done();return;}
  const moment=task.moment||task.type,receipt=task.receipt||null;
  const presets={
    gain:{icon:'＋$',kicker:'LIFE RESOURCE',title:'資源入袋',detail:receipt?.reason||'本隊獲得資源',tone:'gain'},
    loss:{icon:'−$',kicker:'LIFE EXPENSE',title:'人生支出',detail:receipt?.reason||'本隊支付款項',tone:'loss'},
    points:{icon:'＋✦',kicker:'SOCIAL MOMENT',title:'諂媚點數變動',detail:receipt?.reason||'人際影響力改變',tone:Number(receipt?.ptsDelta||0)>=0?'gain':'loss'},
    shield:{icon:'▣',kicker:'PROTECTION USED',title:'防災卡展開',detail:'護盾已抵擋本次災害並消耗一張防災卡',tone:'shield'},
    rank:{icon:'▲',kicker:'LIFE MILESTONE',title:'排名提升',detail:`${task.fromRank} → ${task.toRank} 名`,tone:'rank'},
    turn:{icon:'⚄',kicker:'YOUR TURN',title:'輪到本隊',detail:'主持人已開放本隊擲骰',tone:'turn'},
  },preset=presets[moment]||presets.gain;
  const cash=Number(receipt?.cashDelta||0),pts=Number(receipt?.ptsDelta||0),amount=cash?`${cash>0?'+':''}${G.money(cash)}`:pts?`${pts>0?'+':''}${pts} 點`:'';
  App.fx.teamMoment={...preset,moment,teamId:team.id,teamName:team.name,color:team.color,amount};
  if(moment==='gain')SoundFX.playCoinReward();else if(moment==='loss')SoundFX.playPayment();else if(moment==='shield')SoundFX.playShield();else if(moment==='rank')SoundFX.playRankUp();else SoundFX.playPhaseChange();
  if(App.role==='team')navigator.vibrate?.(moment==='shield'?[35,30,70]:moment==='turn'?[25,35,25]:[25]);
  renderFx();
  fxTimeout('teamMoment',()=>{App.fx.teamMoment=null;renderFx();done();},reducedMotion?800:1900);
}

function executeBattlePromptFx(task,done){
  const battle=task.battle,teams=task.next?.teams||App.state?.teams||[];
  if(!battle||Number(battle.attackerId)!==Number(App.teamId)||battle.status!=='awaiting_choice'){done();return;}
  App.battlePromptDone=done;
  App.fx.battlePrompt={battle:{...battle},attacker:teams[battle.attackerId],defender:teams[battle.defenderId]};
  SoundFX.playAttackAlert('battle');
  navigator.vibrate?.([35,45,70]);
  renderFx();
}

function finishBattlePromptFx(){
  if(!App.fx.battlePrompt&&!App.battlePromptDone)return;
  App.fx.battlePrompt=null;
  const done=App.battlePromptDone;App.battlePromptDone=null;
  renderFx();
  done?.();
}

function executeAssignmentFx(next,done){
  const teams=(next.teams||[]).filter(team=>team.baseIdx!==null&&team.baseIdx!==undefined).map(team=>({id:team.id,name:team.name,color:team.color,baseIdx:team.baseIdx}));
  if(!teams.length){done();return;}
  const duration=reducedMotion?1800:Math.min(7200,2600+teams.length*380);
  App.fx.event=null;
  App.fx.assignment={teams,duration};
  SoundFX.playPhaseChange();
  renderFx();
  if(!reducedMotion)fxTimeout('assignmentChime',()=>SoundFX.playCoinReward(),1180);
  fxTimeout('assignment',()=>{
    App.fx.assignment=null;
    renderFx();
    done();
  },duration);
}

function executeAttackFx(attack,message,next,done){
  const preset=ATTACK_FX[attack?.kind];
  if(!preset){done();return;}
  App.fx.event=null;
  let targetTeamId = attack.targetTeam;
  if(targetTeamId === undefined || targetTeamId === null){
    const match = (next.teams||[]).find(t => (message||'').includes(`鎖定 ${t.name}`));
    if(match) targetTeamId = match.id;
  }
  const targetTeam = targetTeamId !== undefined && targetTeamId !== null ? next.teams?.[targetTeamId] : null;
  const targetPos = attack.targetPos ?? targetTeam?.pos ?? (Array.isArray(attack.hit) && attack.hit.length ? attack.hit[0] : null);

  App.fx.attack={
    ...preset,
    kind:attack.kind,
    message:String(message||'').slice(0,180),
    teamName:next.teams?.[attack.team]?.name||'',
    teamId:Number(attack.team),
    targetTeam:targetTeamId,
    targetTeamName:targetTeam?.name||'',
    targetPos
  };
  App.fx.aftershock=null;
  SoundFX.playAttackAlert(attack?.kind);
  renderFx();
  fxTimeout('attack',()=>{
    App.fx.attack=null;
    App.fx.aftershock={
      kind:attack.kind,
      hit:Array.isArray(attack.hit)?attack.hit:[],
      targetTeam:targetTeamId,
      targetTeamName:targetTeam?.name||'',
      targetPos,
      message:String(message||'').slice(0,180)
    };
    renderFx();
    fxTimeout('aftershock',()=>{
      App.fx.aftershock=null;
      renderFx();
      done();
    },reducedMotion?1800:3600);
  },reducedMotion?1200:3200);
}


function executeEventFx(message,done){
  const kind=classifyEvent(message);
  App.fx.event={message:String(message).slice(0,180),kind};
  if(/獲得|獎勵|買回|升級|取走/.test(message))SoundFX.playCoinReward();
  else if(/修繕|扣款|稅金|支付|進入監獄/.test(message))SoundFX.playAttackHit();
  renderFx();
  fxTimeout('event',()=>{
    App.fx.event=null;
    renderFx();
    done();
  },reducedMotion?1200:2600);
}

function revealRollFx(){
  if(!App.fx.dice)return;
  App.fx.dice.rolling=false;SoundFX.playDiceResult();
  const flight=document.querySelector('.dice-flight');
  if(flight){flight.classList.remove('tumbling');flight.classList.add('revealed');const label=flight.querySelector(':scope > strong');if(label)label.textContent=App.fx.dice.value;}
  document.querySelectorAll('.dice-result-panel.rolling').forEach(panel=>panel.classList.remove('rolling'));
  const hud=document.querySelector('.hud-dice');if(hud){hud.classList.remove('rolling');hud.textContent=App.fx.dice.value;}
}
function removeRollFx(){document.querySelector('.dice-flight')?.remove();}
function movementPoint(pos){const tile=G.TRACK[pos]||G.TRACK[0];return {x:tile[1]*50+26,y:tile[2]*50+26};}
function updateMovementDom(teamId,pos){
  const token=document.querySelector(`[data-moving-team="${teamId}"]`),point=movementPoint(pos);
  if(token){token.style.setProperty('--token-x',`${point.x}px`);token.style.setProperty('--token-y',`${point.y}px`);}
  document.querySelectorAll('.tile.camera-focus,.tile.fx-step,.tile.landing-goal').forEach(tile=>tile.classList.remove('camera-focus','fx-step','landing-goal'));
  const tile=document.querySelector(`.tile[data-i="${pos}"]`);if(tile)tile.classList.add('camera-focus','fx-step');
  const badge=document.querySelector('.step-progress-badge');if(badge)badge.textContent=App.fx.stepText;
  fitBoard();
}
function activateMovementCamera(){const wrap=$('bwrap');if(!wrap)return;wrap.classList.add('camera-active');fitBoard();}
function finishMovementDom(pos){
  const tile=document.querySelector(`.tile[data-i="${pos}"]`);if(tile){tile.classList.remove('fx-step');tile.classList.add('landing-goal');}
  const badge=document.querySelector('.step-progress-badge');if(badge)badge.textContent='★ 抵達！';
  SoundFX.playLanding();
}

function ensureMovingToken(teamId,pos,team){
  let token=document.querySelector(`[data-moving-team="${teamId}"]`);
  const point=movementPoint(pos);
  if(!token){
    const bd=$('board');
    if(bd){
      token=document.createElement('div');
      token.className='moving-token';
      token.dataset.movingTeam=teamId;
      token.style.setProperty('--token-color',team?.color||'#f2c12e');
      token.style.setProperty('--token-fg',G.LIGHT_FG.includes(teamId)?'#14110f':'#fff');
      token.innerHTML=`<span>${teamId+1}</span>`;
      bd.appendChild(token);
    }
  }
  if(token){
    token.style.setProperty('--token-x',`${point.x}px`);
    token.style.setProperty('--token-y',`${point.y}px`);
  }
  return token;
}

function finishRollTask(teamId,done){
  delete App.fx.positions[teamId];
  if(App.fx.camera?.teamId===teamId){
    App.fx.camera=null;
    App.fx.stepText='';
    App.highlight=[];
  }
  document.querySelector(`[data-moving-team="${teamId}"]`)?.remove();
  const wrap=$('bwrap');
  if(wrap&&!Object.keys(App.fx.positions).length){
    wrap.classList.remove('camera-active');
  }
  fitBoard();
  renderFx();
  done();
}

function executeRollFx(task,done){
  const {teamId,team,beforePos,targetPos,rollVal}=task;
  if(!team){done();return;}

  const values=Array.isArray(task.diceValues)&&task.diceValues.length?task.diceValues:[rollVal];
  App.fx.dice={teamId,teamName:team.name,value:rollVal,values,rolling:!reducedMotion};
  SoundFX.playDiceTumble();
  renderFx();

  const isJail=Number(rollVal)===0||(beforePos===targetPos&&(task.landPos===undefined||task.landPos===targetPos));
  const walkSteps=isJail?0:Math.max(0,Math.floor(Number(rollVal)||0));
  const walkPath=[];
  for(let i=1;i<=walkSteps;i++){
    walkPath.push((beforePos+i)%G.N);
  }
  const landPos=task.landPos ?? (walkPath.length?walkPath[walkPath.length-1]:beforePos);
  const isTeleport=!isJail&&(targetPos!==landPos);


  if(reducedMotion||(!walkPath.length&&!isTeleport)){
    revealRollFx();
    fxTimeout('diceDone',()=>{
      App.fx.dice=null;
      removeRollFx();
      renderFx();
      done();
    },1000);
    return;
  }

  fxTimeout('diceReveal',revealRollFx,800);
  fxTimeout('diceDismiss',()=>{App.fx.dice=null;removeRollFx();},2200);

  App.fx.positions[teamId]=beforePos;
  App.fx.stepText=`0 / ${walkPath.length}`;
  ensureMovingToken(teamId,beforePos,team);

  let step=0;
  const moveNext=()=>{
    if(step<walkPath.length){
      const pos=walkPath[step];
      App.fx.positions[teamId]=pos;
      const from=step>0?walkPath[step-1]:beforePos;
      App.fx.camera={teamId,from,pos};
      App.highlight=[pos];
      App.fx.stepText=`${step+1} / ${walkPath.length}`;
      activateMovementCamera();
      SoundFX.playStepHop();
      updateMovementDom(teamId,pos);
      step+=1;

      if(step<walkPath.length){
        fxTimeout('rollStep',moveNext,520);
      }else{
        if(isTeleport){
          const token=document.querySelector(`[data-moving-team="${teamId}"]`);
          const isWorm=G.TRACK[landPos]?.[0]==='worm';
          App.fx.stepText=isWorm?'🌀 蟲洞吸入…':'⚡ 傳送中…';
          if(token){
            token.classList.remove('warp-in','no-transition');
            token.classList.add('warp-out');
          }
          SoundFX.playStepHop();

          fxTimeout('warpJump',()=>{
            App.fx.positions[teamId]=targetPos;
            if(token){
              token.classList.add('no-transition');
              token.classList.remove('warp-out');
              void token.offsetWidth;
            }
            App.fx.camera={teamId,from:landPos,pos:targetPos};
            App.highlight=[targetPos];
            App.fx.stepText=isWorm?'✨ 蟲洞躍遷！':'★ 傳送抵達！';
            updateMovementDom(teamId,targetPos);
            activateMovementCamera();
            finishMovementDom(targetPos);

            if(token){
              void token.offsetWidth;
              token.classList.remove('no-transition');
              token.classList.add('warp-in');
            }

            fxTimeout('rollFinish',()=>{
              finishRollTask(teamId,done);
            },1200);
          },450);
        }else{
          App.fx.stepText='★ 抵達！';
          finishMovementDom(pos);
          fxTimeout('rollFinish',()=>{
            finishRollTask(teamId,done);
          },1000);
        }
      }
    }
  };


  fxTimeout('rollStart',()=>{
    App.fx.camera={teamId,from:beforePos,pos:beforePos};
    activateMovementCamera();
    moveNext();
  },850);
}

function processGameFx(previous,next){
  if(!previous||!next)return;
  const teamLifeMoments=[];
  if(App.fx.battlePrompt&&next.pendingBattle?.status!=='awaiting_choice')finishBattlePromptFx();

  // 1. Phase change or pause change
  if(previous.phase!==next.phase&&PHASE_FX[next.phase]){
    enqueueFx({type:'phase',data:PHASE_FX[next.phase]});
  }else if(next.paused&&!previous.paused){
    enqueueFx({type:'phase',data:PHASE_FX.paused});
  }else if(previous.paused&&!next.paused){
    enqueueFx({type:'phase',data:{...PHASE_FX[next.phase],title:'繼續遊戲',subtitle:'活動已恢復，請繼續進行'}});
  }

  // 2. Base assignment (lottery in setup phase)
  const message=next.log?.[0]||'';
  const assignmentChanged=next.phase==='setup'&&next.teams?.some((team,i)=>team.baseIdx!==previous.teams?.[i]?.baseIdx)&&/抽籤/.test(message);
  if(assignmentChanged){
    enqueueFx({type:'assignment',next});
  }

  // 3. Base upgrades and sells
  const upgradedTeams=(next.teams||[]).filter((t,i)=>previous.teams?.[i]&&t.level>previous.teams[i].level&&t.baseIdx!==null);
  upgradedTeams.forEach(team=>{
    enqueueFx({type:'upgrade',team});
  });
  const soldTeams=(next.teams||[]).filter((t,i)=>previous.teams?.[i]&&!previous.teams[i].sold&&t.sold&&t.baseIdx!==null);
  soldTeams.forEach(team=>{
    enqueueFx({type:'sell',team,tileIndex:team.baseIdx});
  });
  const buyBackTeams=(next.teams||[]).filter((t,i)=>previous.teams?.[i]&&previous.teams[i].sold&&!t.sold&&t.baseIdx!==null);
  buyBackTeams.forEach(team=>{
    enqueueFx({type:'upgrade',team});
  });

  const purchaseChanged=next.lastPurchase&&next.lastPurchase.seq!==previous.lastPurchase?.seq;
  if(purchaseChanged){
    const team=next.teams?.[Number(next.lastPurchase.team)];
    if(team)enqueueFx({type:'purchase',purchase:next.lastPurchase,team});
  }

  // 4. Special attacks
  const attackChanged=next.lastAttack&&next.lastAttack.seq!==previous.lastAttack?.seq;
  if(attackChanged){
    enqueueFx({type:'attack',attack:next.lastAttack,message,next});
  }

  // 4b. Team-local life moments. These are visual-only reactions to confirmed state.
  if(App.role==='team'&&App.teamId!==null){
    const mine=next.teams?.[App.teamId],beforeMine=previous.teams?.[App.teamId];
    const previousReceipts=new Set((previous.receipts||[]).map(r=>`${r.id??''}:${r.teamId}:${r.cashDelta||0}:${r.ptsDelta||0}:${r.reason||''}`));
    const freshReceipts=(next.receipts||[]).filter(r=>Number(r.teamId)===App.teamId&&!previousReceipts.has(`${r.id??''}:${r.teamId}:${r.cashDelta||0}:${r.ptsDelta||0}:${r.reason||''}`)).slice(0,3).reverse();
    freshReceipts.filter(receipt=>!(purchaseChanged&&isPurchaseReceipt(receipt,next.lastPurchase))).forEach(receipt=>teamLifeMoments.push({type:'teamMoment',team:mine,receipt,moment:Number(receipt.cashDelta||0)>0?'gain':Number(receipt.cashDelta||0)<0?'loss':'points'}));
    if(Number(beforeMine?.buffs?.shield||0)>Number(mine?.buffs?.shield||0))teamLifeMoments.push({type:'teamMoment',team:mine,moment:'shield'});
    if(previous.activeTeamId!==next.activeTeamId&&Number(next.activeTeamId)===App.teamId&&next.phase==='roll')teamLifeMoments.push({type:'teamTurn',team:mine,moment:'turn'});
    try{
      const previousRank=G.rankTeams(previous).findIndex(t=>t.originalIndex===App.teamId)+1,nextRank=G.rankTeams(next).findIndex(t=>t.originalIndex===App.teamId)+1;
      if(previousRank>0&&nextRank>0&&nextRank<previousRank)teamLifeMoments.push({type:'rank',team:mine,moment:'rank',fromRank:previousRank,toRank:nextRank});
    }catch{}
  }

  // 5. Rolls & Movements (captures both latest roll and any simultaneous movers)
  const rollChanged = next.lastRoll && (
    next.lastRoll.seq !== previous.lastRoll?.seq ||
    next.lastRoll.team !== previous.lastRoll?.team ||
    next.lastRoll.n !== previous.lastRoll?.n
  );
  const lastRollTeam = rollChanged ? Number(next.lastRoll.team) : null;
  if(rollChanged){
    const teamId = lastRollTeam, team = next.teams?.[teamId], before = previous.teams?.[teamId];
    if(team && before){
      const beforePos = next.lastRoll.from ?? before.pos;
      const rollVal = next.lastRoll.n !== undefined && next.lastRoll.n !== null ? Number(next.lastRoll.n) : 1;
      const landPos = next.lastRoll.landPos ?? ((beforePos + rollVal) % G.N);
      const targetPos = next.lastRoll.targetPos ?? team.pos;
      if (rollVal > 0 || beforePos !== targetPos) {
        enqueueFx({type:'roll',teamId,team,beforePos,landPos,targetPos,rollVal,diceValues:Array.isArray(next.lastRoll.dice)?next.lastRoll.dice:[rollVal]});
      }
    }
  }
  (next.teams||[]).forEach((team,i)=>{
    const before=previous.teams?.[i];
    if(before && before.pos!==team.pos && team.id!==lastRollTeam){
      const rollVal=(team.pos-before.pos+G.N)%G.N||1;
      enqueueFx({type:'roll',teamId:team.id,team,beforePos:before.pos,landPos:team.pos,targetPos:team.pos,rollVal});
    }
  });

  const battleOpened=next.pendingBattle?.status==='awaiting_choice'&&(
    !previous.pendingBattle||
    previous.pendingBattle.attackerId!==next.pendingBattle.attackerId||
    previous.pendingBattle.tileIndex!==next.pendingBattle.tileIndex||
    previous.pendingBattle.round!==next.pendingBattle.round
  );
  if(battleOpened&&App.role==='team'&&Number(next.pendingBattle.attackerId)===Number(App.teamId)){
    enqueueFx({type:'battlePrompt',battle:next.pendingBattle,next});
  }

  // Team-local receipts and reactions must wait until dice and movement finish.
  teamLifeMoments.forEach(enqueueFx);


  // 6. Announcements & Event logs in FIFO order
  if(next.log&&previous.log){
    let newCount = 0;
    const maxCheck = Math.min(next.log.length, Math.max(1, (next.rev || 0) - (previous.rev || 0)));
    for (let k = maxCheck; k >= 1; k--) {
      let match = true;
      const compareLen = Math.min(previous.log.length, next.log.length - k, 5);
      for (let j = 0; j < compareLen; j++) {
        if (next.log[k + j] !== previous.log[j]) { match = false; break; }
      }
      if (match && compareLen > 0) { newCount = k; break; }
    }
    if (newCount === 0 && next.log[0] !== previous.log[0]) newCount = 1;
    const newLogs = next.log.slice(0, newCount);
    newLogs.reverse().forEach(logMsg=>{
      if(!logMsg)return;
      if(/發動「/.test(logMsg)&&attackChanged)return;
      if(/抽籤/.test(logMsg)&&assignmentChanged)return;
      if(/骰出/.test(logMsg))return;
      if(/買了(?:實體物品)?「|取得「/.test(logMsg)&&purchaseChanged)return;
      enqueueFx({type:'event',message:logMsg});
    });
  }
}


async function api(path, options={}){
  const r = await fetch(path, {cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}});
  const text = await r.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = {error:text}; }
  if(!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
function saveSession(){
  try{ localStorage.setItem('preview:session', JSON.stringify({gameId:App.gameId,role:App.role,teamId:App.teamId,token:App.token,accessToken:App.access[App.role]||''})); }catch{}
}
function loadSession(){ try { return JSON.parse(localStorage.getItem('preview:session') || 'null'); } catch { return null; } }
function clearSession(){ try{ localStorage.removeItem('preview:session'); }catch{} }

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
      if(m.type==='state'){
        const previous=App.state;
        App.state=m.state;
        if(App.leaveActionId&&m.resolvedActionId===App.leaveActionId){finishTeamLeave();return;}
        if(App.pendingAction){
          if(m.resolvedActionId === App.pendingAction || m.resolvedActionId === App.pendingActionId){
            clearPendingAction();
          } else if(App.role==='team' && App.teamId!==null){
            const me=m.state.teams?.[App.teamId];
            if(me?.rolled && (App.pendingActionType === 'roll' || App.pendingActionType === 'reroll')) clearPendingAction();
          } else if((m.state.rev||0) > (previous?.rev||0)){
            clearPendingAction();
          }
        }
        processGameFx(previous,m.state);
        App.gameMeta={...App.gameMeta,status:m.status};
        render(true);
      }
      else if(m.type==='hello_ok'){ App.connected=true; App.state=m.state; App.gameMeta={...App.gameMeta,...m.meta}; saveSession(); render(true); }
      else if(m.type==='action_ok'){if(App.leaveActionId&&m.actionId===App.leaveActionId){finishTeamLeave();return;}clearPendingAction();render(true); }
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
  const val=Math.max(1,Math.min(20,Number(value)||1)),numeric=val>6,face=numeric?val:diceGlyphs[val-1];
  return `<div class="dice-cube" data-value="${val}"><div class="dice-inner"><i class="face front ${numeric?'numeric':''}">${face}</i><i class="face back">⚅</i><i class="face right">⚂</i><i class="face left">⚃</i><i class="face top">⚄</i><i class="face bottom">⚁</i></div></div>`;
}
function diceSetHTML(values,total=null){
  const list=Array.isArray(values)&&values.length?values:[1],sum=total??list.reduce((n,v)=>n+Number(v||0),0);
  return `<div class="dice-set" style="--dice-count:${list.length}">${list.map(v=>diceCubeHTML(v)).join('')}</div>${list.length>1?`<div class="dice-total">${list.join(' + ')} = <b>${sum}</b></div>`:''}`;
}

function baseBuildingHTML(owner){const level=Math.max(1,Math.min(3,Number(owner.level)||1)),names=['營地','商店','豪華賭場'];return `<div class="base-building lv${level}" style="--owner:${owner.color}" aria-label="${names[level-1]}"><i class="base-roof"></i><i class="base-body"><b></b><b></b><b></b></i><em>LV${level}</em></div>`;}
function boardAftermathHTML(kind){
  if(!kind)return '';
  if(kind==='quake')return `<div class="board-aftermath board-quake">${Array.from({length:5},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  if(kind==='missile'){
    const after = App.fx.aftershock || App.fx.attack;
    let targetPos = after?.targetPos;
    if (targetPos === null || targetPos === undefined) {
      if (after?.targetTeam !== undefined && App.state?.teams?.[after.targetTeam]?.pos !== undefined) {
        targetPos = App.state.teams[after.targetTeam].pos;
      } else if (after?.hit?.length) {
        targetPos = after.hit[0];
      } else if (App.state?.lastAttack?.targetPos !== undefined) {
        targetPos = App.state.lastAttack.targetPos;
      } else {
        const found = App.state?.teams?.find(t => (after?.message || '').includes(t.name));
        targetPos = found ? found.pos : 0;
      }
    }
    const pt = movementPoint(targetPos || 0);
    const targetName = after?.targetTeamName || (after?.targetTeam !== undefined ? App.state?.teams?.[after.targetTeam]?.name : '');
    const centerX = 276, centerY = 251;
    const fromX = pt.x >= centerX ? (pt.x - 340) : (pt.x + 340);
    const fromY = pt.y >= centerY ? (pt.y - 300) : (pt.y + 300);
    const startDx = fromX - pt.x, startDy = fromY - pt.y;
    const flightAngle = Math.atan2(pt.y - fromY, pt.x - fromX) * 180 / Math.PI;
    const flyerRot = Math.round(flightAngle + 45);
    return `<div class="board-aftermath board-missile" style="--lock-x:${pt.x}px;--lock-y:${pt.y}px;--start-dx:${startDx}px;--start-dy:${startDy}px;--flyer-rot:${flyerRot}deg"><div class="missile-target-circle"><i></i><i></i><i></i><b>🎯 LOCK ${targetName ? esc(targetName) : ''}</b></div><div class="board-missile-flyer"></div><div class="board-missile-explosion"><div class="blast-core"></div><div class="blast-ring"></div>${Array.from({length:6},(_,i)=>`<div class="blast-spark" style="--i:${i}"></div>`).join('')}</div></div>`;
  }
  if(kind==='typhoon')return `<div class="board-aftermath board-typhoon">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  return `<div class="board-aftermath board-wildfire">${Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
}
function routeEntry(){ const p=location.pathname.replace(/\/+$/,'')||'/'; return p==='/admin'?'admin':p==='/team'?'team':(p==='/dev'||p==='/developer')?'dev':'home'; }
function go(path){ App.socket?.close(); App.socket=null;clearPendingAction();resetGameFx();clearTimeout(App.homeIntroTimer);App.connected=false;App.screen='home'; App.entry=path==='/admin'?'admin':path==='/team'?'team':(path==='/dev'||path==='/developer')?'dev':'home'; history.pushState({},'',path); render(true); }
function setHome(){ App.socket?.close(); App.socket=null;clearPendingAction();resetGameFx();App.screen='home'; App.role=null; App.gameId=null; App.state=null; App.teamId=null; App.token=null; App.gameMeta=null; App.connected=false; App.history=[]; render(true); }
function entryURL(path){ return `${location.origin}${path}`; }
function openGame(game, role, token='', teamId=null, accessToken=''){
  clearInterval(App.lobbyTimer);clearPendingAction();resetGameFx();App.gameId=game.id; App.gameMeta=game; App.role=role; App.token=token; App.teamId=teamId; App.access[role]=accessToken||App.access[role]||''; App.screen='game'; App.tab=role==='host'?'host':'main'; App.state=null; App.connected=false;
  if(role==='team'||role==='viewer')App.audioReady=SoundFX.unlockAudio();else App.audioReady=SoundFX.isAudioReady();
  preloadAttackArt();
  App.socket?.close(); App.socket=new LiveSocket(game.id,role,token,teamId,App.access[role]); App.socket.connect(); render(true);
}

function hasSeenLifeIntro(){try{return localStorage.getItem('life-festival:intro-v1')==='seen';}catch{return false;}}
function finishLifeIntro(remember=true){
  clearTimeout(App.homeIntroTimer);App.homeIntroTimer=null;
  document.body.classList.remove('life-intro-active');
  document.querySelector('.life-home')?.classList.remove('intro-active');
  document.querySelector('.life-intro')?.remove();
  if(remember)try{localStorage.setItem('life-festival:intro-v1','seen');}catch{}
}
function lifeFlagsHTML(teams=[]){return teams.map((team,i)=>`<i class="life-team-flag ${team.joined?'joined':''}" style="--team:${esc(team.color||'#8a8676')};--flag-delay:${i*.12}s"><b>${i+1}</b><span>${esc(team.name||`第 ${i+1} 組`)}</span></i>`).join('');}
function bindHomeRoutes(){document.querySelectorAll('[data-home-route]').forEach(button=>button.onclick=()=>go(button.dataset.homeRoute));}

async function refreshLobby(){
  if(App.screen!=='home') return;
  const list=$('lobbyList'); if(!list) return;
  try{
    const data=await api('/api/lobby');
    const square=$('lifeSquare'),status=$('lifeStatus'),flags=$('lifeFlags'),primary=$('watchPrimary');
    if(!data.games?.length){
      list.innerHTML='<div class="life-empty"><b>廣場正在準備</b><span>主持人建立活動後，人生道路就會點亮。</span></div>';
      if(square)square.dataset.activity='waiting';
      if(status)status.innerHTML='<small>FESTIVAL STATUS</small><b>等待活動建立</b><span>工作人員可先由下方入口登入。</span>';
      if(flags)flags.innerHTML='<i class="life-team-flag placeholder"><b>?</b><span>等待隊伍</span></i>';
      if(primary){primary.disabled=true;primary.dataset.id='';primary.querySelector('small').textContent='尚未開放';}
      return;
    }
    list.innerHTML=data.games.map(g=>`<div class="lobby-item">
      <div><small>NOW OPEN</small><h3>${esc(g.name)}</h3><div class="lobby-meta">${g.joinedCount}/${g.teamCount} 隊已抵達 · ${esc(phaseNames[g.status]||g.status)}</div></div>
      <div class="lobby-actions"><button class="btn blue watch" data-id="${esc(g.id)}">進入即時廣場</button></div>
    </div>`).join('');
    const featured=data.games[0],phase=featured.status||'setup';
    if(square)square.dataset.activity=['ended','settle'].includes(phase)?'finished':phase==='setup'?'gathering':'live';
    if(status)status.innerHTML=`<small>LIFE JOURNEY LIVE</small><b>${esc(featured.name)}</b><span>${featured.joinedCount}/${featured.teamCount} 隊已抵達 · ${esc(phaseNames[phase]||phase)}</span>`;
    if(flags)flags.innerHTML=lifeFlagsHTML(featured.teams||[]);
    if(primary){primary.disabled=false;primary.dataset.id=featured.id;primary.querySelector('small').textContent=phase==='setup'?'觀看隊伍集結':'立即進入戰況';}
    list.querySelectorAll('.watch').forEach(b=>b.onclick=()=>{const g=data.games.find(x=>x.id===b.dataset.id)||{id:b.dataset.id,name:'活動'};openGame(g,'viewer');});
    if(primary)primary.onclick=()=>{const g=data.games.find(x=>x.id===primary.dataset.id)||featured;openGame(g,'viewer');};
  }catch(e){ list.innerHTML=`<div class="note warn">活動清單載入失敗：${esc(e.message)}</div>`; }
}
function renderHome(){
  if(App.entry==='admin') return renderAdminHome();
  if(App.entry==='team') return renderTeamHome();
  if(App.entry==='dev') return renderDevHome();
  const intro=!hasSeenLifeIntro()&&!reducedMotion;
  document.body.classList.toggle('life-intro-active',intro);
  $('app').innerHTML=`<main class="life-home ${intro?'intro-active':''}">
    <section class="life-square" id="lifeSquare" data-activity="loading">
      <div class="life-art-bg" aria-hidden="true"></div>
      <header class="life-title-banner"><small>2026 CAMP LIFE FESTIVAL</small><h1>人生大富翁</h1><p>每一次選擇，都讓人生走向不同方向</p></header>
      <div class="life-flags" id="lifeFlags" aria-label="隊伍集結狀態"><i class="life-team-flag placeholder"><b>…</b><span>載入隊伍</span></i></div>
      <aside class="life-status-scroll" id="lifeStatus" aria-live="polite"><small>FESTIVAL STATUS</small><b>正在查看人生廣場</b><span>即時活動資料載入中…</span></aside>
      <nav class="life-gates" aria-label="活動入口">
        <button type="button" class="life-gate arena" id="watchPrimary" disabled><i>▶</i><span><b>進入即時廣場</b><small>正在尋找活動</small></span></button>
        <button type="button" class="life-gate team" data-home-route="/team"><i>⚑</i><span><b>隊伍報到</b><small>隊輔與小隊操作</small></span></button>
        <button type="button" class="life-gate host" data-home-route="/admin"><i>◆</i><span><b>祭典總管</b><small>主持人控制台</small></span></button>
      </nav>
      ${intro?`<div class="life-intro" aria-label="人生旅途開場"><div class="life-intro-road"><i></i><i></i><i></i><i></i><i></i></div><div class="life-intro-copy"><small>THE ROAD IS CALLING</small><strong>人生旅途即將啟程</strong><span>每一次選擇，都讓人生走向不同方向</span></div><div class="life-intro-actions"><button type="button" id="igniteLifeSound">🔊 點燃旅途音效</button><button type="button" id="skipLifeIntro">跳過開場</button></div></div>`:''}
    </section>
    <section class="life-open-games"><div class="life-section-head"><span>即時人生廣場</span><button class="btn xs gold" id="refreshLobby">重新整理</button></div><div id="lobbyList" class="lobby-list">載入中…</div></section>
    ${campFooterHTML()}
  </main>`;
  $('refreshLobby').onclick=refreshLobby;
  bindHomeRoutes();
  if(intro){
    $('skipLifeIntro').onclick=()=>finishLifeIntro(true);
    $('igniteLifeSound').onclick=()=>{App.audioReady=SoundFX.unlockAudio();SoundFX.playFestivalIntro();$('igniteLifeSound').textContent='♪ 旅途已點亮';$('igniteLifeSound').disabled=true;};
    App.homeIntroTimer=setTimeout(()=>finishLifeIntro(true),6500);
  }
  clearInterval(App.lobbyTimer); App.lobbyTimer=setInterval(refreshLobby,8000); refreshLobby();
}

function renderGate(role){
  const host=role==='host';
  const dev=role==='dev';
  const title = dev ? '開發者後台' : host ? '主持人控制台' : '隊輔系統';
  const subtitle = dev ? '系統監控、D1 資料庫記錄與 DO 服務管理' : host ? '請輸入控制台密碼' : '輸入共用密碼後直接選隊';
  const cardTitle = dev ? '★ 開發者登入' : host ? '★ 主持人登入' : '★ 隊輔登入';
  const note = dev ? '驗證成功後可檢視 D1 資料庫、管理活動、查詢事件日誌與切換 DO 伺服器開關。' : host ? '這台裝置會保留活動連線，方便斷線或重新整理後恢復。密碼不會寫入網址。' : '驗證成功後會直接顯示目前隊伍，不需要房號或 PIN。密碼不會寫入網址。';
  $('app').innerHTML=`${dev?'':entryBackHomeHTML()}<div class="hd"><div class="t1">${esc(title)}</div><div class="t2">${esc(subtitle)}</div></div><div class="card"><div class="ch">${esc(cardTitle)}</div><div class="cb"><input id="accessPassword" type="password" autocomplete="current-password" placeholder="密碼"><button class="btn ${dev?'gold':'green'}" id="accessLogin">登入</button><div class="note">${esc(note)}</div></div></div>${campFooterHTML()}`;
  bindEntryBackHome();
  $('accessLogin').onclick=async()=>{
    const p=$('accessPassword').value||''; if(!p){toast('請輸入密碼',true);return;}
    try{
      if(dev){
        await api('/api/dev/auth',{method:'POST',body:JSON.stringify({password:p})});
        saveAccess('dev',p);
        render(true);
        toast('開發者登入成功');
      }else{
        await api('/api/auth',{method:'POST',body:JSON.stringify({role,password:p})});
        saveAccess(role,p);
        render(true);
        toast(host?'主持人登入成功':'隊輔登入成功');
      }
    }catch(e){toast('登入失敗：'+e.message,true);}
  };
  $('accessPassword').onkeydown=e=>{if(e.key==='Enter')$('accessLogin').click();};
}

async function devApi(path, options={}){
  return api(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${App.access.dev}`,
      ...(options.headers||{})
    }
  });
}

function formatTWTime(dateStr, includeSeconds = true) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const parts = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false
    }).formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const timePart = includeSeconds ? `${map.hour}:${map.minute}:${map.second}` : `${map.hour}:${map.minute}`;
    return `${map.year}-${map.month}-${map.day} ${timePart}`;
  } catch (e) {
    const d = new Date(dateStr);
    const tw = new Date(d.getTime() + 8 * 3600 * 1000);
    return tw.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function showJsonModal(title, data){
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = `<div class="dev-json-viewer">${esc(JSON.stringify(data, null, 2))}</div><div style="margin-top:10px;display:flex;gap:6px"><button class="btn sm gold" id="copyJsonBtn">複製 JSON</button></div>`;
  $('copyJsonBtn').onclick = () => {
    navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
    toast('已複製 JSON 至剪貼簿');
  };
  $('modal').style.display = 'flex';
}

function downloadJson(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderDevHome(){
  if(!App.access.dev) return renderGate('dev');
  const tab = App.devTab || 'overview';
  $('app').innerHTML = `
    <div class="dev-container">
      <div class="dev-header">
        <div class="dev-title-wrap">
          <span style="font-size:22px">🛠️</span>
          <div>
            <div class="dev-title">DEVELOPER DASHBOARD</div>
            <div class="dev-subtitle">Cloudflare D1 & Durable Objects 後台管理</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn xs ink" id="devLogoutBtn">登出後台</button>
          <button class="btn xs gold" id="devHomeBtn">返回大廳</button>
        </div>
      </div>
      <div class="dev-nav-tabs">
        <button class="dev-tab ${tab==='overview'?'active':''}" data-tab="overview">📊 總覽與 DO</button>
        <button class="dev-tab ${tab==='games'?'active':''}" data-tab="games">🎮 活動記錄</button>
        <button class="dev-tab ${tab==='events'?'active':''}" data-tab="events">📜 事件審計</button>
        <button class="dev-tab ${tab==='sql'?'active':''}" data-tab="sql">💻 SQL 終端</button>
        <button class="dev-tab ${tab==='tools'?'active':''}" data-tab="tools">⚙️ 維護工具</button>
      </div>
      <div id="devTabContent"><div class="note">載入中…</div></div>
    </div>
    ${campFooterHTML()}
  `;

  $('devLogoutBtn').onclick = () => { clearAccess('dev'); go('/'); };
  $('devHomeBtn').onclick = () => { go('/'); };
  document.querySelectorAll('.dev-tab').forEach(b => {
    b.onclick = () => { App.devTab = b.dataset.tab; renderDevHome(); };
  });

  const content = $('devTabContent');
  if(!content) return;
  try{
    if(tab === 'overview') return await renderDevOverview(content);
    if(tab === 'games') return await renderDevGames(content);
    if(tab === 'events') return await renderDevEvents(content);
    if(tab === 'sql') return renderDevSql(content);
    if(tab === 'tools') return await renderDevTools(content);
  }catch(e){
    content.innerHTML = `<div class="card"><div class="cb"><div class="note warn">載入失敗：${esc(e.message)}</div><button class="btn sm gold" id="retryDevTab" style="margin-top:8px">重試</button></div></div>`;
    $('retryDevTab')?.addEventListener('click', renderDevHome);
  }
}

async function renderDevOverview(container){
  container.innerHTML = '<div class="note">正在讀取 D1 與 DO 狀態…</div>';
  const data = await devApi('/api/dev/overview');
  const doEnabled = Boolean(data.doEnabled);
  const idleHours = data.idleTimeoutHours || 3;
  const stats = data.stats || {};
  const active = data.activeGame;

  container.innerHTML = `
    <div class="dev-do-banner ${doEnabled ? 'enabled' : 'disabled'}">
      <div class="dev-do-info">
        <h3>
          <span>${doEnabled ? '🟢' : '🔴'}</span>
          <span>Durable Object 伺服器狀態：${doEnabled ? '已啟用 (允許開房與連線)' : '已停用 (全域鎖定中)'}</span>
        </h3>
        <p>${doEnabled ? '伺服器目前正常提供服務，主持人可建立新活動且隊伍可正常即時連線。' : '已關閉 DO 服務。目前全域禁止建立新活動，且所有即時連線將被阻擋拒絕。'}</p>
      </div>
      <button class="btn sm ${doEnabled ? 'dark' : 'green'}" id="toggleDoBtn" style="width:auto;margin:0">
        ${doEnabled ? '🔴 關閉 DO 伺服器' : '🟢 啟用 DO 伺服器'}
      </button>
    </div>

    <div class="dev-stats-grid">
      <div class="dev-stat-card">
        <div class="dev-stat-label">總活動場次</div>
        <div class="dev-stat-val">${stats.totalGames ?? 0}</div>
      </div>
      <div class="dev-stat-card">
        <div class="dev-stat-label">進行中活動</div>
        <div class="dev-stat-val" style="color:#3fbf5a">${stats.activeGames ?? 0}</div>
      </div>
      <div class="dev-stat-card">
        <div class="dev-stat-label">已結束活動</div>
        <div class="dev-stat-val" style="color:#8a8676">${stats.endedGames ?? 0}</div>
      </div>
      <div class="dev-stat-card">
        <div class="dev-stat-label">總事件日誌數</div>
        <div class="dev-stat-val" style="color:#3f86e0">${stats.totalEvents ?? 0}</div>
      </div>
    </div>

    <div class="card">
      <div class="ch">★ 當前活動即時狀態</div>
      <div class="cb">
        ${active ? `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div>
              <strong style="font-size:16px">${esc(active.name)}</strong>
              <code style="margin-left:6px">${esc(active.id)}</code>
              <span class="dev-badge ${active.status==='running'?'green':active.status==='paused'?'gold':'blue'}" style="margin-left:6px">${esc(phaseNames[active.status]||active.status)}</span>
            </div>
            <div style="font-size:12px;color:#7a6a45">
              階段：<b>${esc(phaseNames[active.phase]||active.phase)}</b> ｜ 回合：<b>${active.round}</b> ｜ 隊伍：<b>${active.joinedTeams}/${active.teamCount}</b>
            </div>
          </div>
          <div style="font-size:12px;color:#8a8676;margin-bottom:8px">最後活躍時間：<code>${formatTWTime(active.updatedAt)}</code></div>
          <div class="row wrap" style="margin-top:10px">
            <button class="btn sm blue" id="devWatchActive" style="flex:1">進入觀戰</button>
            <button class="btn sm gold" id="devViewActiveEvents" style="flex:1">查看事件紀錄</button>
            <button class="btn sm dark" id="devForceEndActive" style="flex:1">強制結束活動</button>
          </div>
        ` : `
          <div class="note">目前系統中沒有運行中的活動。</div>
        `}
      </div>
    </div>

    <div class="card">
      <div class="ch">★ 最新事件紀錄 (台灣時間 UTC+8)</div>
      <div class="cb">
        ${stats.latestEvent ? `
          <div style="font-size:13px;line-height:1.6">
            時間：<code>${formatTWTime(stats.latestEvent.created_at)}</code><br>
            活動 ID：<code>${esc(stats.latestEvent.game_id)}</code><br>
            類型：<span class="dev-badge gold">${esc(stats.latestEvent.event_type)}</span><br>
            內容：<b>${esc(stats.latestEvent.message || '(無訊息)')}</b>
          </div>
        ` : `
          <div class="note">尚無事件記錄。</div>
        `}
      </div>
    </div>

    <div class="card">
      <div class="ch">★ Worker & D1 系統設定資訊</div>
      <div class="cb">
        <div style="font-size:12.5px;line-height:1.8">
          版本：<code>${esc(data.version)}</code><br>
          活動閒置自動關閉：<span class="dev-badge gold">超過 ${idleHours} 小時</span> <i>（可於「維護工具」隨時調整）</i><br>
          D1 資料庫 Binding：<span class="dev-badge ${data.envStatus?.hasDb ? 'green' : 'red'}">${data.envStatus?.hasDb ? '正常' : '未連接'}</span><br>
          Durable Objects Binding：<span class="dev-badge ${data.envStatus?.hasDo ? 'green' : 'red'}">${data.envStatus?.hasDo ? '正常' : '未連接'}</span><br>
          Secret 憑證驗證：<span class="dev-badge ${data.envStatus?.hasDevSecret ? 'green' : 'gold'}">${data.envStatus?.hasDevSecret ? 'Worker Secret' : '預設 Hash'}</span>
        </div>
      </div>
    </div>
  `;

  $('toggleDoBtn').onclick = async () => {
    const nextState = !doEnabled;
    const msg = nextState
      ? '確定要開啟 Durable Object 伺服器服務嗎？主持人將可建立活動且隊輔可正常連線。'
      : '確定要關閉 Durable Object 伺服器服務嗎？關閉後將全面禁止建立新活動與 WebSocket 即時連線！';
    ask(nextState ? '開啟 DO 服務？' : '關閉 DO 服務？', msg, async () => {
      try{
        await devApi('/api/dev/settings', { method: 'POST', body: JSON.stringify({ doEnabled: nextState }) });
        toast(nextState ? 'DO 服務已成功開啟' : 'DO 服務已成功關閉');
        renderDevOverview(container);
      }catch(e){
        toast('切換失敗：' + e.message, true);
      }
    });
  };

  if(active){
    $('devWatchActive')?.addEventListener('click', () => {
      openGame({ id: active.id, name: active.name }, 'viewer');
    });
    $('devViewActiveEvents')?.addEventListener('click', () => {
      App.devEventsFilter.gameId = active.id;
      App.devTab = 'events';
      renderDevHome();
    });
    $('devForceEndActive')?.addEventListener('click', () => {
      ask('強制結束當前活動？', `活動「${esc(active.name)}」(${active.id}) 將被強制結束並保存 D1 紀錄。`, async () => {
        try{
          await devApi(`/api/dev/games/${encodeURIComponent(active.id)}/force-end`, { method: 'POST' });
          toast('活動已強制結束');
          renderDevOverview(container);
        }catch(e){
          toast('結束活動失敗：' + e.message, true);
        }
      });
    });
  }
}

async function renderDevGames(container){
  const filter = App.devGamesFilter || { status: 'all', search: '' };
  container.innerHTML = '<div class="note">正在載入 D1 活動資料…</div>';

  const queryParams = new URLSearchParams({
    status: filter.status,
    search: filter.search,
    limit: '50'
  });
  const data = await devApi(`/api/dev/games?${queryParams}`);
  const games = data.games || [];

  container.innerHTML = `
    <div class="card">
      <div class="ch">★ D1 活動清單管理 (${data.total} 筆)</div>
      <div class="cb">
        <div class="dev-filter-bar">
          <select id="devGameStatusFilter">
            <option value="all" ${filter.status==='all'?'selected':''}>全部狀態</option>
            <option value="active" ${filter.status==='active'?'selected':''}>進行中 / 準備中</option>
            <option value="ended" ${filter.status==='ended'?'selected':''}>已結束</option>
          </select>
          <input type="text" id="devGameSearchInput" placeholder="搜尋活動名稱或 ID" value="${esc(filter.search)}">
          <button class="btn sm gold" id="devGameFilterBtn" style="width:auto;margin:0">篩選</button>
          <button class="btn sm ink" id="devGameResetBtn" style="width:auto;margin:0">重設</button>
        </div>

        <div class="dev-table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>活動名稱</th>
                <th>狀態</th>
                <th>隊數</th>
                <th>建立時間 (UTC+8)</th>
                <th>更新時間 (UTC+8)</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${games.length ? games.map(g => `
                <tr>
                  <td><code>${esc(g.id)}</code></td>
                  <td><b>${esc(g.name)}</b></td>
                  <td><span class="dev-badge ${g.status==='ended'?'gray':g.status==='running'?'green':g.status==='paused'?'gold':'blue'}">${esc(phaseNames[g.status]||g.status)}</span></td>
                  <td>${g.team_count} 隊</td>
                  <td><small>${formatTWTime(g.created_at)}</small></td>
                  <td><small>${formatTWTime(g.updated_at)}</small></td>
                  <td class="actions">
                    <button class="btn xs gold dev-view-game" data-id="${esc(g.id)}" title="檢視狀態">🔍 狀態</button>
                    <button class="btn xs blue dev-events-game" data-id="${esc(g.id)}" title="查看事件">📜 事件</button>
                    <button class="btn xs ink dev-export-game" data-id="${esc(g.id)}" title="匯出 JSON">📥 匯出</button>
                    ${g.status !== 'ended' ? `<button class="btn xs dark dev-end-game" data-id="${esc(g.id)}" title="強制結束">🛑 結束</button>` : ''}
                    <button class="btn xs dark dev-del-game" data-id="${esc(g.id)}" title="刪除紀錄">🗑️ 刪除</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="7" style="text-align:center;padding:20px;color:#8a8676">沒有符合條件的活動記錄</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $('devGameFilterBtn').onclick = () => {
    App.devGamesFilter.status = $('devGameStatusFilter').value;
    App.devGamesFilter.search = $('devGameSearchInput').value.trim();
    renderDevGames(container);
  };
  $('devGameResetBtn').onclick = () => {
    App.devGamesFilter = { status: 'all', search: '' };
    renderDevGames(container);
  };
  $('devGameSearchInput').onkeydown = e => { if(e.key === 'Enter') $('devGameFilterBtn').click(); };

  container.querySelectorAll('.dev-view-game').forEach(b => {
    b.onclick = async () => {
      try{
        const id = b.dataset.id;
        const res = await devApi(`/api/dev/games/${encodeURIComponent(id)}`);
        showJsonModal(`活動 ${id} 詳細資料`, res);
      }catch(e){ toast('讀取失敗：' + e.message, true); }
    };
  });

  container.querySelectorAll('.dev-events-game').forEach(b => {
    b.onclick = () => {
      App.devEventsFilter.gameId = b.dataset.id;
      App.devTab = 'events';
      renderDevHome();
    };
  });

  container.querySelectorAll('.dev-export-game').forEach(b => {
    b.onclick = async () => {
      try{
        const id = b.dataset.id;
        const res = await devApi(`/api/dev/export/${encodeURIComponent(id)}`);
        downloadJson(`game-${id}-export.json`, res);
        toast(`活動 ${id} 資料匯出成功`);
      }catch(e){ toast('匯出失敗：' + e.message, true); }
    };
  });

  container.querySelectorAll('.dev-end-game').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id;
      ask('強制結束活動？', `確定要結束活動 ${id} 嗎？`, async () => {
        try{
          await devApi(`/api/dev/games/${encodeURIComponent(id)}/force-end`, { method: 'POST' });
          toast(`活動 ${id} 已結束`);
          renderDevGames(container);
        }catch(e){ toast('操作失敗：' + e.message, true); }
      });
    };
  });

  container.querySelectorAll('.dev-del-game').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id;
      ask('刪除活動紀錄？', `此操作將從 D1 永久刪除活動 ${id} 及所有關聯事件！`, async () => {
        try{
          await devApi(`/api/dev/games/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast(`活動 ${id} 已刪除`);
          renderDevGames(container);
        }catch(e){ toast('刪除失敗：' + e.message, true); }
      });
    };
  });
}

async function renderDevEvents(container){
  const filter = App.devEventsFilter || { gameId: '', eventType: '', actorRole: '', search: '' };
  container.innerHTML = '<div class="note">正在讀取 D1 事件日誌…</div>';

  const queryParams = new URLSearchParams({
    gameId: filter.gameId,
    eventType: filter.eventType,
    actorRole: filter.actorRole,
    search: filter.search,
    limit: '60'
  });
  const data = await devApi(`/api/dev/events?${queryParams}`);
  const events = data.events || [];

  const eventTypes = [
    'roll','reroll','attack','battle','gamble','buff','upgrade','sell','buyBack',
    'assignBases','startGame','pauseGame','resumeGame','nextPhase','settleGame','endGame',
    'kickTeam','idleTimeout','teamJoin','teamLeave','forceEnd'
  ];

  container.innerHTML = `
    <div class="card">
      <div class="ch">★ D1 事件審計日誌 (${data.total} 筆)</div>
      <div class="cb">
        <div class="dev-filter-bar">
          <input type="text" id="devEvGameId" placeholder="活動 ID (例：AB12CD)" value="${esc(filter.gameId)}" style="max-width:140px">
          <select id="devEvType">
            <option value="">全部事件類型</option>
            ${eventTypes.map(t => `<option value="${t}" ${filter.eventType===t?'selected':''}>${t}</option>`).join('')}
          </select>
          <select id="devEvRole">
            <option value="">全部角色</option>
            <option value="host" ${filter.actorRole==='host'?'selected':''}>host (主持人)</option>
            <option value="team" ${filter.actorRole==='team'?'selected':''}>team (隊輔)</option>
            <option value="viewer" ${filter.actorRole==='viewer'?'selected':''}>viewer (觀眾)</option>
            <option value="system" ${filter.actorRole==='system'?'selected':''}>system (系統)</option>
            <option value="dev" ${filter.actorRole==='dev'?'selected':''}>dev (開發者)</option>
          </select>
          <input type="text" id="devEvSearch" placeholder="關鍵字搜尋訊息" value="${esc(filter.search)}">
          <button class="btn sm gold" id="devEvFilterBtn" style="width:auto;margin:0">查詢</button>
          <button class="btn sm ink" id="devEvResetBtn" style="width:auto;margin:0">清除</button>
        </div>

        <div class="dev-table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>時間 (UTC+8)</th>
                <th>活動 ID</th>
                <th>角色 / 隊伍</th>
                <th>事件類型</th>
                <th>訊息內容</th>
                <th>Rev</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              ${events.length ? events.map(e => `
                <tr>
                  <td><code>${e.id}</code></td>
                  <td><small>${formatTWTime(e.createdAt)}</small></td>
                  <td><code>${esc(e.gameId)}</code></td>
                  <td>
                    <span class="dev-badge ${e.actorRole==='host'?'gold':e.actorRole==='team'?'green':e.actorRole==='system'?'blue':'gray'}">${esc(e.actorRole)}</span>
                    ${e.actorTeam !== null && e.actorTeam !== undefined ? `<small>隊${e.actorTeam+1}</small>` : ''}
                  </td>
                  <td><span class="dev-badge ${e.eventType==='attack'||e.eventType==='kickTeam'||e.eventType==='forceEnd'?'red':e.eventType==='roll'||e.eventType==='buff'?'green':'gold'}">${esc(e.eventType)}</span></td>
                  <td>${esc(e.message || '')}</td>
                  <td><code>${e.stateRev}</code></td>
                  <td>
                    <button class="btn xs ink dev-view-payload" data-payload='${esc(JSON.stringify(e.payload))}'>🔍 檢視</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="8" style="text-align:center;padding:20px;color:#8a8676">沒有符合條件的事件記錄</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $('devEvFilterBtn').onclick = () => {
    App.devEventsFilter.gameId = $('devEvGameId').value.trim();
    App.devEventsFilter.eventType = $('devEvType').value;
    App.devEventsFilter.actorRole = $('devEvRole').value;
    App.devEventsFilter.search = $('devEvSearch').value.trim();
    renderDevEvents(container);
  };
  $('devEvResetBtn').onclick = () => {
    App.devEventsFilter = { gameId: '', eventType: '', actorRole: '', search: '' };
    renderDevEvents(container);
  };
  $('devEvSearch').onkeydown = e => { if(e.key === 'Enter') $('devEvFilterBtn').click(); };
  $('devEvGameId').onkeydown = e => { if(e.key === 'Enter') $('devEvFilterBtn').click(); };

  container.querySelectorAll('.dev-view-payload').forEach(b => {
    b.onclick = () => {
      try{
        const payload = JSON.parse(b.dataset.payload || '{}');
        showJsonModal('事件 Payload 詳細內容', payload);
      }catch(e){}
    };
  });
}

function renderDevSql(container){
  container.innerHTML = `
    <div class="card">
      <div class="ch">★ D1 SQL 查詢終端機</div>
      <div class="cb">
        <div class="dev-sql-presets">
          <button data-sql="SELECT * FROM games ORDER BY updated_at DESC LIMIT 10;">活動清單 (10 筆)</button>
          <button data-sql="SELECT * FROM game_events ORDER BY id DESC LIMIT 20;">最新事件 (20 筆)</button>
          <button data-sql="SELECT event_type, count(*) as count FROM game_events GROUP BY event_type ORDER BY count DESC;">事件統計</button>
          <button data-sql="SELECT game_id, actor_team, message, created_at FROM game_events WHERE event_type='attack' ORDER BY id DESC LIMIT 20;">特殊操作紀錄</button>
          <button data-sql="SELECT * FROM system_settings;">系統設定表</button>
          <button data-sql="PRAGMA table_info(games);">games 欄位結構</button>
          <button data-sql="PRAGMA table_info(game_events);">game_events 欄位結構</button>
        </div>
        <textarea id="devSqlInput" class="dev-sql-input" placeholder="請輸入 SQL 查詢指令...">SELECT * FROM games ORDER BY updated_at DESC LIMIT 10;</textarea>
        <div class="row" style="margin-bottom:10px">
          <button class="btn sm gold" id="devSqlRunBtn">▶ 執行 SQL</button>
        </div>
        <div id="devSqlOutput"><div class="note">點擊上方範本或輸入 SQL 後點選「執行 SQL」。</div></div>
      </div>
    </div>
  `;

  container.querySelectorAll('.dev-sql-presets button').forEach(b => {
    b.onclick = () => {
      $('devSqlInput').value = b.dataset.sql;
      $('devSqlRunBtn').click();
    };
  });

  $('devSqlRunBtn').onclick = async () => {
    const sql = $('devSqlInput').value.trim();
    if(!sql){ toast('請輸入 SQL 語法', true); return; }
    const out = $('devSqlOutput');
    out.innerHTML = '<div class="note">正在執行查詢…</div>';
    try{
      const start = performance.now();
      const res = await devApi('/api/dev/sql', { method: 'POST', body: JSON.stringify({ sql }) });
      const elapsed = (performance.now() - start).toFixed(1);
      const rows = res.results || [];
      if(!rows.length){
        out.innerHTML = `<div class="note" style="color:#3fbf5a">執行成功（耗時 ${elapsed} ms）：查詢無回傳資料或受影響列數為 ${res.changes || 0}。</div>`;
        return;
      }
      const cols = Object.keys(rows[0] || {});
      out.innerHTML = `
        <div style="font-size:12px;color:#7a6a45;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
          <span>共 <b>${rows.length}</b> 筆結果（耗時 ${elapsed} ms）</span>
          <button class="btn xs ink" id="devToggleSqlJson">📋 檢視原始 JSON</button>
        </div>
        <div class="dev-table-wrap">
          <table class="dev-table">
            <thead>
              <tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>${cols.map(c => {
                  const val = r[c];
                  const str = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                  return `<td>${esc(str.length > 80 ? str.slice(0, 80) + '…' : str)}</td>`;
                }).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      $('devToggleSqlJson').onclick = () => showJsonModal('SQL 查詢結果', rows);
    }catch(e){
      out.innerHTML = `<div class="note warn">SQL 執行錯誤：${esc(e.message)}</div>`;
    }
  };
}

async function renderDevTools(container){
  container.innerHTML = '<div class="note">正在載入系統設定…</div>';
  const data = await devApi('/api/dev/overview');
  const doEnabled = Boolean(data.doEnabled);
  const idleHours = data.idleTimeoutHours || 3;
  const isPreset = [0.5, 1, 2, 3, 4, 6, 8, 12, 24].includes(idleHours);

  container.innerHTML = `
    <div class="card">
      <div class="ch">★ Durable Object 伺服器開關</div>
      <div class="cb">
        <p style="font-size:13px;line-height:1.6">
          當關閉 DO 伺服器時，系統會立即拒絕新活動的建立與所有 WebSocket 即時連線。這可以用於活動結束後鎖定伺服器、維護更新或防止未授權操作。
        </p>
        <div style="margin:12px 0">
          目前狀態：<span class="dev-badge ${doEnabled ? 'green' : 'red'}">${doEnabled ? '🟢 運行中' : '🔴 已鎖定停用'}</span>
        </div>
        <button class="btn sm ${doEnabled ? 'dark' : 'green'}" id="toolsToggleDoBtn">
          ${doEnabled ? '🔴 立即關閉 DO 服務' : '🟢 立即開啟 DO 服務'}
        </button>
      </div>
    </div>

    <div class="card">
      <div class="ch">★ 活動閒置自動關閉時間設定</div>
      <div class="cb">
        <p style="font-size:13px;line-height:1.6">
          當活動無任何操作或隊伍離線達到設定時長後，系統將自動結束活動並儲存 D1 記錄，釋放伺服器資源。<br>
          <b>目前設定：<span class="dev-badge gold">超過 ${idleHours} 小時</span></b>
        </p>
        <div class="row wrap" style="align-items:flex-end;margin-top:10px;gap:8px">
          <label class="fl" style="margin:0;flex:1;min-width:200px">
            <span>選擇時限（小時）</span>
            <select id="idleTimeoutSelect" style="border:3px solid #14110f;padding:7px;width:100%">
              <option value="0.5" ${idleHours===0.5?'selected':''}>0.5 小時（30 分鐘 - 測試用）</option>
              <option value="1" ${idleHours===1?'selected':''}>1 小時</option>
              <option value="2" ${idleHours===2?'selected':''}>2 小時</option>
              <option value="3" ${idleHours===3?'selected':''}>3 小時（預設值）</option>
              <option value="4" ${idleHours===4?'selected':''}>4 小時</option>
              <option value="6" ${idleHours===6?'selected':''}>6 小時</option>
              <option value="8" ${idleHours===8?'selected':''}>8 小時</option>
              <option value="12" ${idleHours===12?'selected':''}>12 小時</option>
              <option value="24" ${idleHours===24?'selected':''}>24 小時</option>
              <option value="custom" ${!isPreset?'selected':''}>自訂小時數...</option>
            </select>
          </label>
          <input type="number" id="customIdleHoursInput" min="0.1" max="168" step="0.5" placeholder="自訂小時" value="${idleHours}" style="width:110px;border:3px solid #14110f;padding:7px;${isPreset?'display:none;':''}">
          <button class="btn sm gold" id="saveIdleTimeoutBtn" style="width:auto;margin:0">儲存時限設定</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="ch">★ 歷史資料批次清理</div>
      <div class="cb">
        <p style="font-size:13px;line-height:1.6">
          批次清理 D1 中舊活動與關聯事件記錄，釋放資料庫空間。
        </p>
        <label class="fl" style="margin-bottom:10px">
          <span>清理範圍</span>
          <select id="cleanupRetainDays" style="width:100%;max-width:360px;border:3px solid #14110f;padding:7px">
            <option value="0">🗑️ 清理全部「已結束」活動（清除所有已結束場次）</option>
            <option value="1">⏱️ 清理超過 1 天前的已結束活動</option>
            <option value="7">⏱️ 清理超過 7 天前的已結束活動</option>
            <option value="30">⏱️ 清理超過 30 天前的已結束活動</option>
            <option value="wipe_all">⚠️ 強制清空「全部」活動與事件（含未結束/卡住場次）</option>
          </select>
        </label>
        <button class="btn sm dark" id="btnRunCleanup">執行資料清理</button>
      </div>
    </div>

    <div class="card">
      <div class="ch">★ D1 資料表檢查</div>
      <div class="cb">
        <button class="btn sm gold" id="btnCheckSchema">檢查 D1 資料表與索引狀態</button>
        <div id="schemaCheckResult" style="margin-top:10px"></div>
      </div>
    </div>
  `;

  $('toolsToggleDoBtn').onclick = () => {
    const nextState = !doEnabled;
    ask(nextState ? '開啟 DO 服務？' : '關閉 DO 服務？', nextState ? '確定要開啟 DO 服務嗎？' : '確定要關閉 DO 服務嗎？', async () => {
      try{
        await devApi('/api/dev/settings', { method: 'POST', body: JSON.stringify({ doEnabled: nextState }) });
        toast(nextState ? 'DO 服務已開啟' : 'DO 服務已關閉');
        renderDevTools(container);
      }catch(e){ toast('操作失敗：' + e.message, true); }
    });
  };

  $('idleTimeoutSelect').onchange = () => {
    const isCustom = $('idleTimeoutSelect').value === 'custom';
    $('customIdleHoursInput').style.display = isCustom ? 'block' : 'none';
  };

  $('saveIdleTimeoutBtn').onclick = async () => {
    const sel = $('idleTimeoutSelect').value;
    const hours = sel === 'custom' ? Number($('customIdleHoursInput').value) : Number(sel);
    if(!Number.isFinite(hours) || hours <= 0 || hours > 168){
      toast('請輸入大於 0 且合理的小時數（0.1 到 168 小時）', true);
      return;
    }
    try{
      await devApi('/api/dev/settings', { method: 'POST', body: JSON.stringify({ idleTimeoutHours: hours }) });
      toast(`已成功將閒置自動關閉時間設定為 ${hours} 小時`);
      renderDevTools(container);
    }catch(e){
      toast('儲存失敗：' + e.message, true);
    }
  };

  $('btnRunCleanup').onclick = () => {
    const val = $('cleanupRetainDays').value;
    const isWipeAll = val === 'wipe_all';
    const days = isWipeAll ? 0 : Number(val);
    const title = isWipeAll ? '⚠️ 強制清空所有活動？' : '確定執行清理？';
    const promptMsg = isWipeAll
      ? '此操作將徹底清空 D1 資料庫中的所有活動（包含未結束、進行中與已結束）以及全部事件日誌！'
      : (days === 0 ? '將永久刪除 D1 資料庫中所有「已結束」活動的紀錄與關聯事件！' : `將刪除 ${days} 天前所有已結束活動的紀錄！`);

    ask(title, promptMsg, async () => {
      try{
        const payload = isWipeAll ? { wipeAll: true } : { retainDays: days };
        const res = await devApi('/api/dev/cleanup', { method: 'POST', body: JSON.stringify(payload) });
        toast(`清理完成，已刪除 ${res.deletedGamesCount || 0} 場活動記錄`);
        renderDevTools(container);
      }catch(e){ toast('清理失敗：' + e.message, true); }
    });
  };

  $('btnCheckSchema').onclick = async () => {
    const resultBox = $('schemaCheckResult');
    resultBox.innerHTML = '<div class="note">正在檢查資料表結構…</div>';
    try{
      const tables = await devApi('/api/dev/sql', { method: 'POST', body: JSON.stringify({ sql: "SELECT type, name FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name;" }) });
      resultBox.innerHTML = `
        <div class="note" style="color:#3fbf5a;margin-bottom:8px">✓ D1 資料庫連線正常，共有 ${tables.results?.length || 0} 個資料表與索引。</div>
        <div class="dev-json-viewer">${esc(JSON.stringify(tables.results, null, 2))}</div>
      `;
    }catch(e){
      resultBox.innerHTML = `<div class="note warn">檢查失敗：${esc(e.message)}</div>`;
    }
  };
}
async function renderTeamHome(){
  if(!App.access.team) return renderGate('team');
  $('app').innerHTML=`${entryBackHomeHTML()}<div class="hd"><div class="t1">隊輔入口</div><div class="t2">正在取得目前活動與隊伍狀態</div></div><div class="card"><div class="cb" id="teamEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div>${campFooterHTML()}`;
  bindEntryBackHome();
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
  $('app').innerHTML=`${entryBackHomeHTML()}<div class="hd"><div class="t1">主持人主控台</div><div class="t2">單一活動的建立、開始、暫停、結束與隊伍管理</div></div><div class="card"><div class="cb" id="adminEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="adminLogout">主持人登出</button></div></div>${campFooterHTML()}`;
  bindEntryBackHome();
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
  $('app').innerHTML=`${entryBackHomeHTML()}<div class="hd team-pick-head"><div class="t1">選擇你的隊伍</div><div class="t2">${esc(game.name||'目前活動')} · ${esc(phaseNames[game.status]||game.status)}</div></div><div class="card"><div class="ch">★ 點一下直接加入</div><div class="cb"><div class="note team-pick-note">共用密碼已通過。請確認隊名與顏色；標示「已有裝置」的隊伍仍可加入，但會先再次確認。</div><div class="team-pick-grid">${teams.map((t,i)=>`<button type="button" class="team-pick ${t.joined?'occupied':''}" data-i="${i}"><span class="team-pick-color" style="background:${esc(t.color)};color:${G.LIGHT_FG.includes(i)?'#14110f':'#fff'}">${i+1}</span><span class="team-pick-main"><b>${esc(t.name)}</b><small>第 ${i+1} 組</small></span><span class="team-pick-status ${t.joined?'online':''}">${t.joined?'已有裝置':'可以加入'}</span></button>`).join('')}</div><div class="team-pick-actions"><button class="btn sm outline" id="refreshTeams">更新隊伍狀態</button><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div></div>${campFooterHTML()}`;
  bindEntryBackHome();

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
  return `<div class="board-hud"><div class="hud-kicker">LIFE GAME</div><div class="hud-round"><span>ROUND</span><b>${S.round}</b></div><div class="hud-phase">${esc(S.paused?'已暫停':(phaseNames[S.phase]||S.phase))}</div><div class="hud-market"><span>房市 ${esc(marketName)}</span><b>×${marketRate}</b></div><div class="hud-bank"><span>🏦 銀行庫存</span><b>${G.money(S.bank||0)}</b></div><div class="hud-roll"><div class="hud-dice ${dice?.rolling?'rolling':''}">${diceValue}</div><div><small>${S.settings.diceCount||1} 顆骰子 · 最近行動</small><strong>${esc(diceTeam)}</strong></div></div></div>`;
}
function activeTurnHTML(){
  const S=App.state;if(S.phase!=='roll')return '';
  const active=S.activeTeamId!==null&&S.activeTeamId!==undefined?S.teams[S.activeTeamId]:null,p=S.pendingBattle;
  if(p){const attacker=S.teams[p.attackerId],defender=S.teams[p.defenderId];return `<div class="active-turn-banner battle"><i>⚔️</i><div><small>基地事件處理中</small><b>${esc(attacker?.name||'攻方')} vs ${esc(defender?.name||'守方')}</b></div><span>${p.status==='awaiting_host'?'等待主持裁決':'等待攻方選擇'}</span></div>`;}
  return `<div class="active-turn-banner ${active?'active':'waiting'}"><i>${active?'🎲':'⏳'}</i><div><small>現在操作隊伍</small><b>${active?esc(active.name):'等待主持人指定'}</b></div><span>${active?`${S.settings.diceCount||1} 顆骰子已解鎖`:'尚未開放擲骰'}</span></div>`;
}
function boardHTML(){
  const S=App.state,cell=46,gap=4,W=11*(cell+gap),H=10*(cell+gap),attackKind=App.fx.attack?.kind||App.fx.aftershock?.kind||'',attackHit=App.fx.aftershock?.hit||[],cameraPos=App.fx.camera?.pos,upgradeIdx=App.fx.upgrade?.tileIndex,sellIdx=App.fx.sell?.tileIndex;
  let out=`<div class="bwrap fit ${App.fx.camera?'camera-active':''}" id="bwrap"><div class="board ${attackKind?`fx-attack fx-${attackKind}`:''}" id="board" style="width:${W}px;height:${H}px">`;
  G.TRACK.forEach((t,i)=>{
    const [kind,c,r]=t,T=G.TILE[kind],own=G.ownerOf(S,i),here=S.teams.filter(x=>App.fx.positions[x.id]===undefined&&x.pos===i),shieldHere=here.some(x=>Number(x.buffs?.shield||0)>0),attackHot=attackHit.includes(i),stepHot=App.highlight.includes(i),radarHot=App.radarFocus===i,upgradeHot=upgradeIdx===i,sellHot=sellIdx===i,hot=attackHot||stepHot||radarHot||upgradeHot||sellHot,locked=kind==='stage'&&!S.unlocked.includes(i),garrison=here[0];
    out+=`<div class="tile ${attackHot?`fx-hit fx-hit-${attackKind}`:stepHot?'fx-step':''} ${cameraPos===i?'camera-focus':''} ${radarHot?'radar-beacon':''} ${upgradeHot?'fx-upgrade':''} ${sellHot?'fx-sell':''} ${here.length?'has-garrison':''} ${shieldHere?'has-shield':''}" data-i="${i}" style="left:${c*(cell+gap)}px;top:${r*(cell+gap)}px;background:${hot?'#ffdcdc':T.bg};border-color:${hot?'#e23b3b':'#14110f'};--garrison:${garrison?.color||'#f2c12e'}">${kind==='base'&&own?baseBuildingHTML(own):sprite(kind,22)}<div class="tl" style="color:${T.fg}">${kind==='base'&&own?esc(S.settings.levels[own.level-1]?.name||T.n):T.n}</div>${locked?'<div class="lock"></div>':''}${own?`<div class="ow" style="background:${own.color};color:${G.LIGHT_FG.includes(own.id)?'#14110f':'#fff'}">🚩${own.id+1}</div>`:''}${here.length?`<div class="garrison-aura" aria-hidden="true"></div>${shieldHere?'<div class="shield-aura" aria-label="防災卡護盾">🛡️</div>':''}<div class="pins">${here.slice(0,3).map(h=>`<i class="${App.teamId===h.id?'is-me':''} ${Number(h.buffs?.shield||0)>0?'shielded':''}" style="background:${h.color};color:${G.LIGHT_FG.includes(h.id)?'#14110f':'#fff'}">${h.id+1}</i>`).join('')}${here.length>3?`<i class="more">+${here.length-3}</i>`:''}</div>`:''}${upgradeHot?`<div class="upgrade-frame-3d"></div><div class="upgrade-badge">▲ 基地升級 LV${App.fx.upgrade.level} ▲</div>`:''}${sellHot?`<div class="sell-frame-3d"></div><div class="sell-badge">💰 變賣基地 💰</div>`:''}</div>`;

  });
  S.teams.filter(team=>App.fx.positions[team.id]!==undefined).forEach(team=>{const point=movementPoint(App.fx.positions[team.id]);out+=`<div class="moving-token ${Number(team.buffs?.shield||0)>0?'shielded':''}" data-moving-team="${team.id}" style="--token-x:${point.x}px;--token-y:${point.y}px;--token-color:${team.color};--token-fg:${G.LIGHT_FG.includes(team.id)?'#14110f':'#fff'}"><span>${team.id+1}</span></div>`;});
  if(App.fx.stepText)out+=`<div class="step-progress-badge">${esc(App.fx.stepText)}</div>`;
  return out+boardAftermathHTML(attackKind)+boardHUD()+'</div></div>';
}

function assignmentFxHTML(){
  const fx=App.fx.assignment;if(!fx)return '';
  const cards=fx.teams.map((team,i)=>`<div class="draft-result" style="--draft-delay:${1050+i*380}ms;--team:${team.color}"><div class="draft-result-inner"><span class="draft-team-no">TEAM ${team.id+1}</span><b>${esc(team.name)}</b><i>→</i><strong>第 ${team.baseIdx+1} 格基地</strong></div></div>`).join('');
  return `<div class="assignment-overlay" style="--draft-duration:${fx.duration}ms;--draft-complete-delay:${1200+fx.teams.length*380}ms" aria-live="assertive"><div class="assignment-scan"></div><div class="assignment-stage"><div class="assignment-kicker">LIFE START // LIVE DRAW</div><h2>人生起點抽籤</h2><p>道路洗牌完成，依序公布各隊的人生基地</p><div class="draft-machine"><i></i><i></i><i></i><b>抽籤中</b></div><div class="draft-results">${cards}</div><div class="draft-complete">★ 人生起點分配完成 ★</div></div></div>`;
}
function fitBoard(){
  if(App.screen!=='game')return;
  const wrap=$('bwrap'),bd=$('board');
  if(!wrap||!bd)return;
  if(App.fx.camera){
    const height=Math.min(580,Math.max(390,window.innerHeight-wrap.getBoundingClientRect().top-18)),
          scale=window.innerWidth<600?1.35:window.innerWidth<1000?1.55:1.75,
          point=pos=>{const tile=G.TRACK[pos]||G.TRACK[0];return {x:tile[1]*50+23,y:tile[2]*50+23};},
          from=point(App.fx.camera.from ?? App.fx.camera.pos),to=point(App.fx.camera.pos),
          centerX=wrap.clientWidth*.5,centerY=height*.52,
          dx=to.x-from.x,dy=to.y-from.y,

          rotX=32,
          rotY=dx>0?-4:dx<0?4:0,
          rotZ=dx>0?-1.5:dx<0?1.5:0,
          tx=centerX-to.x,ty=centerY-to.y;
    wrap.style.height=`${height}px`;
    wrap.classList.remove('compact-board');
    bd.style.transformOrigin='275px 250px';
    bd.style.transform=`translate3d(${tx}px, ${ty}px, 0) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
    return;
  }
  const max=Math.max(240,wrap.clientWidth-4),stage=window.innerWidth>=860,mobileTeam=App.role==='team'&&!stage,teamPreview=mobileTeam&&App.tab!=='main',viewerMax=App.role==='viewer'?1.65:stage?1.35:1,mobileBoardHeight=window.innerHeight*(teamPreview?0.28:0.46),availableHeight=mobileTeam?mobileBoardHeight:stage?Math.max(380,window.innerHeight-wrap.getBoundingClientRect().top-24):Infinity,scale=Math.min(viewerMax,max/bd.offsetWidth,availableHeight/bd.offsetHeight);
  bd.style.transformOrigin='top left';
  const centerOffset=App.role==='viewer'?Math.max(0,(wrap.clientWidth-bd.offsetWidth*scale)/2):0;
  bd.style.transform=`translateX(${centerOffset}px) scale(${scale})`;
  wrap.style.height=`${bd.offsetHeight*scale}px`;
  wrap.classList.toggle('compact-board',scale<.78);
  wrap.classList.toggle('team-board-preview',teamPreview);
}




function tileDesc(i){ const S=App.state,kind=G.TRACK[i][0],own=G.ownerOf(S,i); const descriptions={base:'基地：可持有、升級、出售或收取過夜費。',safe:'安全格：沒有額外效果。',tax:'稅收格：支付稅金給銀行。',fate:'命運格：請抽取現場準備的實體命運卡，再由主持人調整結果。',black:'黑市：下一次商店消費折扣。',casino:'賭場：支付賭資並依規則抽獎。',bank:`銀行密道：取得銀行池的一部分（現有庫存 ${G.money(S.bank||0)}）。`,worm:'蟲洞：傳送到另一個蟲洞。',jail:'監獄：下一回合停留。',exch:`房市情報：目前房產倍率 ×${(S.settings.market[S.market]||100)/100}（影響過夜費、通行費、房屋稅與賣價）。`,stage:'關卡：由主持人解封後觸發。',start:'起點：經過或停留可取得繞圈獎勵。'}; return `${descriptions[kind]||''}${own?`<br>目前領地：${esc(own.name)}（過夜費 ${G.money(G.stayFee(S,own))} ｜ 通行費 ${G.money(G.passFee(S,own))}，付給地主）`:''}`; }
function rankingHTML(){
  const S=App.state, money=n=>`$${Number(n||0).toLocaleString()}`;
  const ranked = G.rankTeams(S);
  return `<div class="card ranking-card">
    <div class="ch">★ 即時戰力排行榜 · 點擊定位</div>
    <div class="cb ranking-card-body">
      <div class="rank-legend"><span>點擊隊伍棋盤定位</span><span>總資產 ｜ 現金 · 房產 · 點數</span></div>
      <div class="ranking-grid">
        ${ranked.map((t, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
          const isTop3 = i < 3;
          return `<div class="rk ${isTop3 ? `rk-top-${i+1}` : ''}" data-team="${t.originalIndex}" title="點擊在棋盤定位 ${esc(t.name)}">
            <div class="rk-main">
              <div class="rk-rn">${medal}</div>
              <div class="sw" style="background:${t.color};color:${G.LIGHT_FG.includes(t.originalIndex)?'#14110f':'#fff'}">${t.originalIndex+1}</div>
              <div class="rk-name-box">
                <div class="rk-name">${esc(t.name)}</div>
                <div class="rk-pos">第 ${t.pos+1} 格 · ${t.joined?'在線':'離線'}</div>
              </div>
              <div class="rk-worth">${money(t.worth)}</div>
            </div>
            <div class="rk-details">
              <span>💰 ${money(t.cash)}</span>
              <span>🏰 ${money(t.prop)}</span>
              <span>✨ ${t.pts}點</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function logHTML(){ return `<div class="card"><div class="ch">★ 遊戲紀錄</div><div class="cb">${(App.state.log||[]).slice(0,80).map(x=>`<div class="lg">${esc(x)}</div>`).join('')||'<div class="note">尚無紀錄</div>'}</div></div>`; }
function receiptRows(receipts){
  return receipts.map(r=>{const team=App.state.teams?.[r.teamId],cash=Number(r.cashDelta||0),pts=Number(r.ptsDelta||0),positive=cash>0||(!cash&&pts>0),kind=cash?'cash':'points';return `<div class="receipt-item ${positive?'credit':'debit'}"><div class="receipt-icon">${kind==='cash'?'💰':'✨'}</div><div class="receipt-stamp">${positive?'已入帳':'已扣款'}</div><div class="receipt-main"><b>${esc(team?.name||`第 ${Number(r.teamId)+1} 組`)}<em>#${String(r.id||0).padStart(4,'0')}</em></b><span>${esc(r.reason)}</span><small>ROUND ${r.round} · ${esc(phaseNames[r.phase]||r.phase||'')}</small></div><div class="receipt-amount">${cash?`<strong>${cash>0?'+':''}${G.money(cash)}</strong><small>交易後 ${G.money(r.afterCash)}</small>`:''}${pts?`<strong>${pts>0?'+':''}${pts} 點</strong><small>交易後 ${r.afterPts} 點</small>`:''}</div></div>`;}).join('');
}
function purchaseFxHTML(){const fx=App.fx.purchase;if(!fx)return '';const info=BUFF_INFO[fx.kind],unit=fx.kind==='physical'?'個':'張';return `<div class="purchase-overlay" aria-live="assertive"><div class="purchase-card" style="--purchase-color:${fx.color||'#f2c12e'}"><div class="purchase-kicker">LIFE SUPPLY ACQUIRED</div><div class="life-supply-box" aria-hidden="true"><i></i><b>${info?.icon||(fx.kind==='physical'?'🎁':'🛍️')}</b></div><h2>人生補給入袋</h2><strong>${esc(fx.name)}</strong><p>${esc(fx.teamName)} · 消耗 ${Number(fx.cost||0)} 點 · 背包共有 ${Number(fx.count||1)} ${unit}</p></div></div>`;}
function teamMomentFxHTML(){
  const fx=App.fx.teamMoment;if(!fx)return '';
  const particles=Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('');
  return `<div class="team-moment team-moment-${fx.tone}" style="--team:${fx.color||'#f2c12e'}" aria-live="assertive"><div class="team-moment-rays" aria-hidden="true">${particles}</div><div class="team-moment-card"><small>${esc(fx.kicker)}</small><div class="team-moment-icon">${esc(fx.icon)}</div><h2>${esc(fx.title)}</h2>${fx.amount?`<strong>${esc(fx.amount)}</strong>`:''}<p>${esc(fx.teamName)} · ${esc(fx.detail)}</p></div></div>`;
}
function battleEncounterHTML(){
  if(App.role!=='team'||App.teamId===null)return '';
  const S=App.state,pending=App.fx.battlePrompt?.battle||S?.pendingBattle;
  if(!pending||pending.status!=='awaiting_choice'||Number(pending.attackerId)!==Number(App.teamId))return '';
  if(!App.fx.battlePrompt&&App.isFxRunning)return '';
  const attacker=S.teams?.[pending.attackerId],defender=S.teams?.[pending.defenderId],battles=Number(attacker?.battles||0);
  return `<div class="battle-encounter-overlay" aria-live="assertive" style="--attacker:${attacker?.color||'#e23b3b'};--defender:${defender?.color||'#3f86e0'}"><div class="battle-encounter-rays" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="battle-encounter-card"><small>BASE ENCOUNTER // DECISION REQUIRED</small><div class="battle-versus"><div style="--team:${attacker?.color||'#e23b3b'}"><i>${Number(pending.attackerId)+1}</i><b>${esc(attacker?.name||'本隊')}</b><span>挑戰者</span></div><em>VS</em><div style="--team:${defender?.color||'#3f86e0'}"><i>${Number(pending.defenderId)+1}</i><b>${esc(defender?.name||'基地持有者')}</b><span>基地持有者</span></div></div><h2>抵達對手基地！</h2><p>過夜費 <strong>${G.money(pending.amount)}</strong> 目前仍未扣款。選擇直接付款，或消耗一次 BATTLE 等待主持人裁決。</p><div class="battle-encounter-actions"><button type="button" class="btn gold" id="battlePayNow" ${App.busy?'disabled':''}><span>💰</span><b>直接付款</b><small>支付 ${G.money(pending.amount)}</small></button><button type="button" class="btn dark" id="battleFightNow" ${battles<=0||App.busy?'disabled':''}><span>⚔️</span><b>發動 BATTLE</b><small>${battles>0?`剩餘 ${battles} 次`:'次數已用完'}</small></button></div></div></div>`;
}
function audioWakeHTML(){
  if(!['viewer','team'].includes(App.role)||!App.sound||App.audioReady)return '';
  return `<div class="audio-wake"><button type="button" id="bAudioWake"><i>♪</i><span><b>${App.role==='viewer'?'點燃祭典之聲':'喚醒小隊音效'}</b><small>點一下開啟像素短音效</small></span></button></div>`;
}
function receiptsHTML(compact=false){
  const S=App.state,all=Array.isArray(S.receipts)?S.receipts:[],canFilter=App.role==='team'&&App.teamId!==null,scope=canFilter?App.receiptScope:'all',rows=scope==='mine'?all.filter(r=>Number(r.teamId)===App.teamId):all,credit=rows.filter(r=>Number(r.cashDelta)>0).reduce((n,r)=>n+Number(r.cashDelta),0),debit=Math.abs(rows.filter(r=>Number(r.cashDelta)<0).reduce((n,r)=>n+Number(r.cashDelta),0));
  return `<div class="card receipts-card ${compact?'compact-ledger':''}"><div class="ch">🧾 電子收據 · ADVENTURER LEDGER</div><div class="cb"><div class="receipt-ledger-head"><div><small>TRANSACTION ARCHIVE</small><b>${scope==='mine'?'本隊金流帳本':'全場金流帳本'}</b><span>每筆現金與諂媚點數異動都會留下交易後餘額。</span></div>${canFilter?`<div class="receipt-filter" role="group" aria-label="收據顯示範圍"><button class="receipt-scope ${scope==='mine'?'on':''}" data-scope="mine">只看本隊</button><button class="receipt-scope ${scope==='all'?'on':''}" data-scope="all">全場款項</button></div>`:''}</div><div class="receipt-summary"><div><small>RECORDS</small><b>${rows.length}</b><span>筆交易</span></div><div class="gain"><small>CASH IN</small><b>+${G.money(credit)}</b><span>現金收入</span></div><div class="loss"><small>CASH OUT</small><b>−${G.money(debit)}</b><span>現金支出</span></div></div><div class="receipt-list">${receiptRows(rows.slice(0,100))||'<div class="receipt-empty"><i>🧾</i><b>尚無交易紀錄</b><span>發生款項或點數異動後會顯示在這裡。</span></div>'}</div></div></div>`;
}
function stagePanelHTML(){const S=App.state,last=S.lastRoll,lastTeam=last?S.teams[last.team]:null;return `<div class="stage-panel"><div class="stage-live"><i></i> LIFE JOURNEY LIVE</div><div class="stage-round"><small>ROUND</small><b>${S.round}</b></div><div class="stage-phase">${esc(S.paused?'活動暫停':(phaseNames[S.phase]||S.phase))}</div><div class="stage-stats"><span>房市<b>${esc(S.settings.marketNames[S.market]||S.market)} ×${(S.settings.market[S.market]||100)/100}</b></span><span>🏦 銀行<b>${G.money(S.bank||0)}</b></span><span>最近骰點<b>${last?`${esc(lastTeam?.name||'')} · ${last.n}`:'等待開局'}</b></span></div></div>`;}
function stageTickerHTML(){if(App.role!=='viewer')return '';const message=App.state.log?.[0]||'活動即將開始，請各隊做好準備';return `<div class="stage-ticker"><span>● LIVE</span><div><b>現場快報</b>${esc(message)}</div></div>`;}
function viewerActivityHTML(){
  const S=App.state,logs=(S.log||[]).slice(0,4),receipts=(S.receipts||[]).slice(0,4);
  const logRows=logs.map((message,index)=>`<div class="viewer-feed-row"><i>${index===0?'●':'›'}</i><span>${esc(message)}</span></div>`).join('')||'<div class="viewer-feed-empty">等待第一筆現場事件</div>';
  const moneyRows=receipts.map(r=>{const team=S.teams?.[r.teamId],cash=Number(r.cashDelta||0),pts=Number(r.ptsDelta||0),positive=cash>0||(!cash&&pts>0),amount=cash?`${cash>0?'+':''}${G.money(cash)}`:`${pts>0?'+':''}${pts} 點`;return `<div class="viewer-money-row ${positive?'credit':'debit'}"><span>${esc(team?.name||`第 ${Number(r.teamId)+1} 組`)}</span><small>${esc(r.reason)}</small><b>${amount}</b></div>`;}).join('')||'<div class="viewer-feed-empty">尚無金流異動</div>';
  return `<div class="viewer-activity"><section><div class="viewer-feed-title"><span>⚡ 即時通知</span><small>LIVE FEED</small></div>${logRows}</section><section><div class="viewer-feed-title"><span>🧾 最新款項</span><small>TRANSACTIONS</small></div>${moneyRows}</section></div>`;
}
function teamStatusHTML(){
  if(App.role!=='team'||App.teamId===null)return '';
  const S=App.state,me=S.teams?.[App.teamId];if(!me)return '';
  const ranked=G.rankTeams(S),mine=ranked.find(t=>t.originalIndex===me.id),active=S.activeTeamId===me.id;
  return `<div class="team-command-hud" style="--team-color:${me.color}"><div class="team-command-id"><i>${me.id+1}</i><span><small>YOU ARE CONTROLLING</small><b>${esc(me.name)}</b></span></div><div class="team-command-stat"><small>現金</small><b>${G.money(me.cash)}</b></div><div class="team-command-stat"><small>房產</small><b>${G.money(mine?.prop||0)}</b></div><div class="team-command-stat"><small>諂媚</small><b>${me.pts} 點</b></div><div class="team-command-stat"><small>🏦 銀行</small><b>${G.money(S.bank||0)}</b></div><div class="team-command-turn ${active?'active':''}"><small>${phaseNames[S.phase]||S.phase}</small><b>${active?'輪到本組操作':S.phase==='roll'?'等待主持人':'進行中'}</b></div></div>`;
}
const BUFF_INFO={pass:{icon:'🎫',title:'通行證',rarity:'RARE',desc:'經過或停在他人基地時，自動抵銷一次通行費或過夜費。'},reroll:{icon:'🎲',title:'重骰卡',rarity:'MAGIC',desc:'本回合擲完後使用，重新取得一次擲骰權限。'},shield:{icon:'🛡️',title:'防災卡',rarity:'EPIC',desc:'遭受地震、飛彈、颱風或野火時，自動抵銷一次修繕費。'}};
const PHYSICAL_ITEM_INFO=[{icon:'🧧',rarity:'COMMON',desc:'實體紅包或獎項憑證，由關主現場交付。'},{icon:'🎯',rarity:'COMMON',desc:'實體戳戳樂遊戲券，請向關主兌換。'},{icon:'🎟️',rarity:'RARE',desc:'實體樂透券，保留至現場開獎或兌換。'},{icon:'💎',rarity:'EPIC',desc:'高風險實體獎項憑證，請妥善保管。'}];
const ATTACK_ART={quake:'./assets/fx-quake-v1.png',missile:'./assets/fx-missile-v1.png',typhoon:'./assets/fx-typhoon-v1.png',wildfire:'./assets/fx-wildfire-v1.png'};
function preloadAttackArt(){if(navigator.connection?.saveData)return;const load=()=>Object.values(ATTACK_ART).forEach(src=>{const image=new Image();image.decoding='async';image.src=src;});if('requestIdleCallback'in window)requestIdleCallback(load,{timeout:4500});else setTimeout(load,1800);}
function rpgSlot({icon,name,count,desc,rarity='COMMON',active=false}){const owned=Number(count)>0||active;return `<div class="rpg-slot rarity-${rarity.toLowerCase()} ${owned?'owned':'empty'} ${active?'active':''}"><div class="slot-icon"><i>${icon}</i>${Number(count)>0?`<b>×${Number(count)}</b>`:''}</div><div class="slot-copy"><small>${rarity}</small><strong>${esc(name)}</strong><span>${esc(desc)}</span></div></div>`;}
function backpackHTML(me){const S=App.state,physical=S.settings.gambles.map((g,i)=>{const info=PHYSICAL_ITEM_INFO[i]||{icon:'🎁',rarity:'COMMON',desc:'活動現場發放的實體物品。'};return rpgSlot({icon:info.icon,name:g.name,count:me.items?.[`g${i}`]||0,desc:info.desc,rarity:info.rarity});}).join(''),buffs=Object.entries(BUFF_INFO).map(([k,info])=>rpgSlot({icon:info.icon,name:info.title,count:me.buffs?.[k]||0,desc:info.desc,rarity:info.rarity,active:k==='shield'&&Number(me.buffs?.shield)>0})).join(''),usedSlots=Object.values(me.buffs||{}).filter(n=>Number(n)>0).length+Object.values(me.items||{}).filter(n=>Number(n)>0).length+(me.battles>0?1:0)+(me.discount?1:0);return `<div class="card backpack-card rpg-backpack"><div class="ch">🎒 PIXEL ADVENTURER INVENTORY</div><div class="cb"><div class="bag-hero" style="--team-color:${me.color}"><div class="bag-avatar">${me.id+1}</div><div><small>PARTY INVENTORY</small><b>${esc(me.name)}</b><span>LV${me.level} · 第 ${S.round} 回合</span></div><div class="bag-wallet"><span>💰 ${G.money(me.cash)}</span><span>✨ ${me.pts} 點</span><span>▦ ${usedSlots}/10 格</span></div></div><div class="bag-section"><div class="bag-section-title"><span>◆ 冒險道具</span><small>BUFF & SKILL</small></div><div class="rpg-grid">${buffs}${rpgSlot({icon:'⚔️',name:'BATTLE',count:me.battles,desc:'踩到他人基地時發動；攻方勝免付，守方勝支付原過夜費。',rarity:'LEGEND'})}${rpgSlot({icon:'🏴',name:'黑市折扣',count:0,active:Boolean(me.discount),desc:me.discount?'下一次商店消費會自動套用折扣。':'目前沒有啟用中的黑市折扣。',rarity:'RARE'})}</div></div><div class="bag-section physical"><div class="bag-section-title"><span>◆ 實體物品</span><small>PHYSICAL LOOT</small></div><div class="rpg-grid">${physical}</div></div><div class="inventory-note">所有購買紀錄會立即進背包；增益卡跨回合保留，實體物品請配合現場發放與兌換。</div></div></div>`;}
function teamControls(){
  const S=App.state, me=App.teamId!==null?S.teams[App.teamId]:null; if(App.role==='viewer') return stagePanelHTML(); if(!me) return `<div class="viewer-note">目前沒有可操作的隊伍。</div>`;
  if(S.phase==='setup')return `<div class="viewer-note">隊伍已連線，請等待主持人抽籤並開始遊戲。</div>`;
  if(S.phase==='settle')return `<div class="viewer-note" style="border-left:4px solid #ffd700;background:#fffdf0;color:#7c5800;">🏆 <strong>活動已進入最終結算！</strong><br>請點選上方「🏆 結算頒獎」頁籤查看全場名次與頒獎典禮。</div>`;
  if(S.phase==='ended')return `<div class="viewer-note">活動已結束，操作功能已關閉。請點選上方「🏆 結算頒獎」頁籤瀏覽最終成績。</div>`;
  if(S.paused)return `<div class="viewer-note">主持人已暫停活動，恢復後才能繼續操作。</div>`;

  let h=`<div class="card"><div class="ch">★ ${esc(me.name)} 的操作</div><div class="cb">`;
  if(S.phase==='market'){h+='<div class="note">正在公布本回合房市，請等待主持人進入下一階段。</div>';}
  if(S.phase==='roll'){
    const pending=S.pendingBattle,myPending=pending&&Number(pending.attackerId)===me.id;
    if(myPending&&pending.status==='awaiting_choice'){
      const defender=S.teams[pending.defenderId];
      h+=`<div class="battle-choice"><div class="battle-kicker">BASE ENCOUNTER</div><h3>抵達 ${esc(defender?.name||'對手')} 的基地</h3><p>過夜費 <b>${G.money(pending.amount)}</b> 尚未扣款；移動演出完成後會出現付款或 BATTLE 選擇視窗。</p></div>`;
    }else if(myPending&&pending.status==='awaiting_host'){
      h+=`<div class="battle-choice waiting"><div class="battle-kicker">BATTLE IN PROGRESS</div><h3>⚔️ 等待主持人裁決</h3><p>過夜費 ${G.money(pending.amount)} 仍未扣款；攻方勝免付，守方勝才會正式付款。</p></div>`;
    }else if(me.jail>0){
      h+=`<div class="dice-result-panel"><div style="font-size:28px;line-height:1.2;margin-bottom:6px;">⛓️</div><b style="color:#e23b3b">目前在監獄中服刑，本回合停留跳過行動</b></div>`;
    }else{
      const mine=App.fx.dice?.teamId===me.id,lastMine=(typeof me.lastRoll==='number'?me.lastRoll:(S.lastRoll?.team===me.id?S.lastRoll.n:(mine?App.fx.dice?.value:null))),displayVal=lastMine!==null?lastMine:(mine?App.fx.dice?.value:1),diceValues=mine?App.fx.dice?.values:(Array.isArray(me.lastDice)&&me.lastDice.length?me.lastDice:[displayVal]),diceCount=Math.max(1,Number(S.settings.diceCount)||1);
      if(me.rolled||App.busy)h+=`<div class="dice-result-panel ${mine&&App.fx.dice?.rolling?'rolling':''}">${diceSetHTML(diceValues,displayVal)}<b>${App.busy?'骰子飛行中…':(lastMine!==null?`本回合總點數 ${lastMine}`:'本回合已完成擲骰')}</b></div>`;
      else if(S.activeTeamId===me.id)h+=`<div class="turn-ready">主持人已允許你們擲骰！</div><div class="dice-throw-pad" id="diceThrow" role="button" tabindex="0" aria-label="向上滑動擲骰子"><div class="throw-lane"><span>FLICK ${diceCount} DICE</span><div class="dice-set preview">${Array.from({length:diceCount},()=>diceCubeHTML(1)).join('')}</div><i class="throw-arrow">↑</i><i class="throw-status">向上甩動</i></div><strong>按住骰子向上滑動，放手擲出 ${diceCount} 顆骰子</strong><small>所有骰點加總後前進；必須先由主持人允許本組操作。</small></div>`;
      else h+=`<div class="turn-waiting"><i>⏳</i><b>等待主持人允許本組擲骰</b><span>目前操作：${S.activeTeamId===null||S.activeTeamId===undefined?'尚未指定':esc(S.teams[S.activeTeamId]?.name||'其他隊伍')}</span></div>`;
    }
  }

  if(S.phase==='shop'){ h+=`<div class="note">目前是商店階段；增益卡與實體物品購買後都會放入上方「背包」頁籤。</div>${S.settings.gambles.map((g,i)=>`<div class="shop-item"><button class="btn sm purple gam" data-i="${i}">${PHYSICAL_ITEM_INFO[i]?.icon||'🎁'} ${g.name}　${G.costWithDiscount(S,me,g.cost)} 點</button><span>${esc(PHYSICAL_ITEM_INFO[i]?.desc||'購買後放入背包，並由關主現場發放實體物品。')}</span></div>`).join('')}${Object.entries(S.settings.buffs).map(([k,b])=>`<div class="shop-item"><button class="btn sm blue buf" data-k="${k}">${BUFF_INFO[k]?.icon||'🎒'} ${b.name}　${G.costWithDiscount(S,me,b.cost)} 點</button><span>${esc(BUFF_INFO[k]?.desc||'購買後放入背包。')}</span></div>`).join('')}`; }
  if(S.phase==='roll'){ h+=`<div class="seg">特殊操作・每招每回合限一次</div><div class="attack-list">${Object.entries(S.settings.attacks).map(([k,a])=>{const used=Boolean(S.attackUsage?.[`${Number(S.round)}:${me.id}:${k}`])||Number(me.attackRounds?.[k])===Number(S.round),cost=G.costWithDiscount(S,me,a.cost),lack=me.pts<cost;return `<div class="attack-action"><button class="btn sm dark atk ${used?'used':lack?'lack':''}" data-k="${k}" ${used||lack?'disabled':''}><span>${a.name}</span><b>${used?'本回合已使用':lack?`還差 ${cost-me.pts} 點`:cost+' 點'}</b></button><div class="attack-help">${esc(attackDescription(S,k,a))}</div></div>`;}).join('')}</div>`; }
  if(S.phase==='sell'){
    const maxLevel = S.settings.levels.length;
    let upLabel = '升級基地', upDisabled = false;
    if (me.sold || me.baseIdx === null) {
      upLabel = '升級基地（已賣出）';
      upDisabled = true;
    } else if (me.level >= maxLevel) {
      upLabel = `升級基地（已滿級 LV${me.level}）`;
      upDisabled = true;
    } else {
      const upCost = S.settings.levels[me.level]?.up || 0;
      upLabel = `升級基地（消耗 ${upCost} 點）`;
      if (me.pts < upCost) upDisabled = true;
    }

    let sellLabel = '賣出基地', sellDisabled = false;
    if (me.sold || me.baseIdx === null) {
      sellLabel = '賣出基地（未持有）';
      sellDisabled = true;
    } else {
      const sellVal = G.sellValue(S, me);
      sellLabel = `賣出基地（+${G.money(sellVal)}）`;
    }

    let buyBackLabel = '買回基地', buyBackDisabled = false;
    if (!me.sold) {
      buyBackLabel = '買回基地（已持有）';
      buyBackDisabled = true;
    } else if (S.round <= me.soldRound) {
      buyBackLabel = '買回基地（下回合開放）';
      buyBackDisabled = true;
    } else {
      const buyCost = G.sellValue(S, me);
      buyBackLabel = `買回基地（${G.money(buyCost)}）`;
      if (me.cash < buyCost) buyBackDisabled = true;
    }

    h+=`<div class="seg">基地操作（目前：${me.sold ? '已賣出（無基地）' : `LV${me.level} ${S.settings.levels[me.level-1]?.name || '營地'}`}）</div><div class="small-grid"><button class="btn sm green" id="bUp" ${upDisabled?'disabled':''}>${esc(upLabel)}</button><button class="btn sm gold" id="bSell" ${sellDisabled?'disabled':''}>${esc(sellLabel)}</button><button class="btn sm blue" id="bBuyBack" ${buyBackDisabled?'disabled':''}>${esc(buyBackLabel)}</button></div>`;
  }

  if(S.phase==='roll'){h+=`<div class="seg">快捷道具</div><button class="btn sm outline" id="bReroll" ${me.buffs.reroll<=0||!me.rolled||S.pendingBattle?'disabled':''}>🎲 使用重骰卡（${me.buffs.reroll}）</button>`;}
  h+='</div></div>';return h;
}
function attackDescription(S,k,a){const m={quake:`隨機震央，7×7 範圍基地支付 ${G.money(a.repair)} 修繕費；震央為 1.5 倍。`,missile:`鎖定排行榜相鄰隊伍，使其支付 ${G.money(a.repair)} 修繕費。`,typhoon:`隨機 7×7 暴風圈；外圈支付 ${G.money(a.repair)}，颱風眼反而獲得 ${G.money(a.eyeBonus)}。`,wildfire:`隨機延燒 1–2 個橫排，範圍基地支付 ${G.money(a.repair)} 修繕費。`};return m[k]||'發動特殊操作。';}
function attackSceneHTML(kind, attack){
  if(kind==='quake')return `<div class="attack-scene quake-scene"><img class="attack-art quake-art" src="${ATTACK_ART.quake}" alt="" aria-hidden="true"><div class="seismic-ring"></div><div class="quake-debris">${Array.from({length:16},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div></div>`;
  if(kind==='missile'){
    const targetName = attack?.targetTeamName || (attack?.targetTeam !== undefined ? App.state?.teams?.[attack.targetTeam]?.name : '');
    return `<div class="attack-scene missile-scene"><div class="target-reticle">${targetName ? `<div class="reticle-lock-badge">🎯 LOCK: ${esc(targetName)}</div>` : ''}<i></i><i></i><i></i></div><div class="missile-strike"><img class="attack-art missile-art" src="${ATTACK_ART.missile}" alt="" aria-hidden="true"></div><div class="impact-flash"></div>${Array.from({length:16},(_,i)=>`<i class="blast" style="--i:${i}"></i>`).join('')}</div>`;
  }
  if(kind==='typhoon')return `<div class="attack-scene typhoon-scene"><div class="typhoon-vortex"><img class="attack-art typhoon-art" src="${ATTACK_ART.typhoon}" alt="" aria-hidden="true"></div><div class="storm-rain">${Array.from({length:24},(_,i)=>`<span style="--i:${i}"></span>`).join('')}</div></div>`;
  return `<div class="attack-scene wildfire-scene"><div class="wildfire-surge"><img class="attack-art wildfire-art" src="${ATTACK_ART.wildfire}" alt="" aria-hidden="true"></div><div class="fire-embers">${Array.from({length:24},(_,i)=>`<span style="--i:${i}"></span>`).join('')}</div></div>`;
}
function cfgHTML(){
  const S=App.state,f=(label,path,val,suf='')=>`<label class="fl"><span>${label}</span><input class="cfg" data-p="${path}" type="number" min="0" value="${val}"><span class="u">${suf}</span></label>`;
  let h='<div class="cfgbox"><div class="note">修改完成後請按最下方的「儲存全部遊戲設定」，所有數值會一次驗證並套用。</div>';
  h+=f('繞圈獎勵','lapBonus',S.settings.lapBonus)+f('稅收扣款','taxAmount',S.settings.taxAmount)+f('賭場花費','casinoCost',S.settings.casinoCost)+f('黑市折扣','blackDiscount',S.settings.blackDiscount,'%')+f('銀行密道取走','bankShare',S.settings.bankShare,'%')+f('每顆骰子面數','diceSides',S.settings.diceSides,'面')+f('每次骰子顆數','diceCount',S.settings.diceCount||1,'顆')+f('通行費佔過夜費','passRatio',S.settings.passRatio,'%');
  h+='<div class="sub">特殊操作費用與修繕費</div>';
  Object.entries(S.settings.attacks).forEach(([k,a])=>{h+=`<div class="grp"><b>${esc(a.name)}</b>`+f('所需諂媚點數',`attacks.${k}.cost`,a.cost,'點')+f('修繕費',`attacks.${k}.repair`,a.repair,'元')+(k==='typhoon'?f('颱風眼獎勵',`attacks.${k}.eyeBonus`,a.eyeBonus,'元'):'')+'</div>';});
  h+='<div class="sub">增益道具價格</div><div class="grp">';Object.entries(S.settings.buffs).forEach(([k,b])=>{h+=f(`${b.name}所需諂媚點數`,`buffs.${k}.cost`,b.cost,'點');});h+='</div><div class="sub">基地等級</div>';
  S.settings.levels.forEach((lv,i)=>{h+=`<div class="grp"><b>Lv${i+1}「${lv.name}」</b>`+f('過夜費',`levels.${i}.stay`,lv.stay)+f('每輪房屋稅',`levels.${i}.tax`,lv.tax||0,'元')+f('升級點數',`levels.${i}.up`,lv.up)+f('賣出價值',`levels.${i}.sell`,lv.sell)+'</div>';});
  return h+'<button class="btn sm green" id="bSaveCfg">儲存全部遊戲設定</button></div>';
}
function settleHTML(){
  const S=App.state;
  if(!S||!S.teams||!S.teams.length) return '<div class="card"><div class="cb">尚無隊伍資料</div></div>';
  const ranked = G.rankTeams(S);
  const top1 = ranked[0], top2 = ranked[1], top3 = ranked[2];

  const highestCash = [...ranked].sort((a,b)=>b.cash-a.cash)[0];
  const highestProp = [...ranked].sort((a,b)=>b.prop-a.prop)[0];
  const highestPts = [...ranked].sort((a,b)=>b.pts-a.pts)[0];

  let h = `<div class="settle-view">
    <div class="settle-hero">
      <div class="settle-kicker">★ VICTORY CEREMONY ★</div>
      <h2 class="settle-title">🏆 人生里程碑 · 最終成果典禮 🏆</h2>
      <p class="settle-subtitle">《${esc(CAMP_NAME)}》・ 第 ${S.round} 回合總成績公布</p>
    </div>`;

  h += `<div class="podium-wrap">`;
  if(top2){
    h += `<div class="podium-card rank-2">
      <div class="podium-badge">🥈</div>
      <div class="podium-rank-label">2ND 亞軍</div>
      <div class="podium-team-swatch" style="background:${top2.color};color:${G.LIGHT_FG.includes(top2.originalIndex)?'#14110f':'#fff'}">${top2.originalIndex+1}</div>
      <div class="podium-name">${esc(top2.name)}</div>
      <div class="podium-worth">${G.money(top2.worth)}</div>
      <div class="podium-breakdown">現金 ${G.money(top2.cash)}<br>房產 ${G.money(top2.prop)} ｜ 點數 ${top2.pts}</div>
    </div>`;
  }
  if(top1){
    h += `<div class="podium-card rank-1">
      <div class="podium-badge">👑 🥇</div>
      <div class="podium-rank-label">1ST 總冠軍</div>
      <div class="podium-team-swatch" style="background:${top1.color};color:${G.LIGHT_FG.includes(top1.originalIndex)?'#14110f':'#fff'}">${top1.originalIndex+1}</div>
      <div class="podium-name">${esc(top1.name)}</div>
      <div class="podium-worth" style="font-size:15px;color:#d35400;">${G.money(top1.worth)}</div>
      <div class="podium-breakdown">現金 ${G.money(top1.cash)}<br>房產 ${G.money(top1.prop)} ｜ 點數 ${top1.pts}</div>
    </div>`;
  }
  if(top3){
    h += `<div class="podium-card rank-3">
      <div class="podium-badge">🥉</div>
      <div class="podium-rank-label">3RD 季軍</div>
      <div class="podium-team-swatch" style="background:${top3.color};color:${G.LIGHT_FG.includes(top3.originalIndex)?'#14110f':'#fff'}">${top3.originalIndex+1}</div>
      <div class="podium-name">${esc(top3.name)}</div>
      <div class="podium-worth">${G.money(top3.worth)}</div>
      <div class="podium-breakdown">現金 ${G.money(top3.cash)}<br>房產 ${G.money(top3.prop)} ｜ 點數 ${top3.pts}</div>
    </div>`;
  }
  h += `</div>`;

  h += `<div class="settle-highlights">
    <div class="highlight-card">
      <div class="highlight-icon">💰</div>
      <div class="highlight-content">
        <h4>現金富豪</h4>
        <strong>${esc(highestCash.name)}</strong>
        <small>手握現金 ${G.money(highestCash.cash)}</small>
      </div>
    </div>
    <div class="highlight-card">
      <div class="highlight-icon">🏰</div>
      <div class="highlight-content">
        <h4>地產大亨</h4>
        <strong>${esc(highestProp.name)}</strong>
        <small>房產市值 ${G.money(highestProp.prop)}</small>
      </div>
    </div>
    <div class="highlight-card">
      <div class="highlight-icon">✨</div>
      <div class="highlight-content">
        <h4>諂媚之王</h4>
        <strong>${esc(highestPts.name)}</strong>
        <small>累積點數 ${highestPts.pts} 點</small>
      </div>
    </div>
  </div>`;

  h += `<div class="settle-table-wrap">
    <div class="ch" style="margin-bottom:10px;">★ 全體隊伍最終總排名表</div>
    <table class="settle-table">
      <thead>
        <tr>
          <th style="width:44px;text-align:center;">名次</th>
          <th>隊伍</th>
          <th>基地狀態</th>
          <th style="text-align:right;">現金</th>
          <th style="text-align:right;">房產價值</th>
          <th style="text-align:right;">諂媚點數</th>
          <th style="text-align:right;">總資產</th>
        </tr>
      </thead>
      <tbody>
        ${ranked.map((t, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}`;
          const baseName = t.sold || t.baseIdx === null ? '無（已賣出）' : `LV${t.level} ${S.settings.levels[t.level-1]?.name || '營地'}`;
          return `<tr>
            <td class="rank-num">${medal}</td>
            <td>
              <div class="team-cell">
                <span class="sw" style="background:${t.color};color:${G.LIGHT_FG.includes(t.originalIndex)?'#14110f':'#fff'};width:22px;height:22px;font-size:9px;">${t.originalIndex+1}</span>
                <span>${esc(t.name)}</span>
              </div>
            </td>
            <td>${esc(baseName)}</td>
            <td style="text-align:right;">${G.money(t.cash)}</td>
            <td style="text-align:right;">${G.money(t.prop)}</td>
            <td style="text-align:right;">${t.pts} 點</td>
            <td class="worth-cell">${G.money(t.worth)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  h += `</div>`;
  return h;
}

function hostPanel(){
  const S=App.state,section=App.hostSection||'flow',fxStat=activeFxStatus(),active=S.activeTeamId!==null&&S.activeTeamId!==undefined?S.teams[S.activeTeamId]:null;
  const marketName=S.settings.marketNames[S.market]||S.market;
  let h=`<div class="host-console"><div class="host-command-deck"><div><small>GAME MASTER CONSOLE</small><b>${esc(phaseNames[S.phase]||S.phase)} · ROUND ${S.round}</b><span>${App.connected?'即時控制連線正常':'控制連線中斷'}</span></div><div class="host-command-actions">${S.phase==='setup'?'<button class="btn sm gold" id="bAssign">重新抽籤</button><button class="btn sm green" id="bStart">開始遊戲</button>':''}${!['setup','settle','ended'].includes(S.phase)?`<button class="btn sm blue" id="bNext">下一階段</button>${S.paused?'<button class="btn sm green" id="bResume">恢復活動</button>':'<button class="btn sm gold" id="bPause">暫停活動</button>'}`:''}</div></div>`;
  h+=`<nav class="host-console-nav" aria-label="主持人工作區">${[['flow','🎮 流程'],['teams','👥 隊伍'],['rules','⚙️ 規則'],['history','🗂️ 紀錄']].map(([key,label])=>`<button class="host-section ${section===key?'on':''}" data-section="${key}">${label}</button>`).join('')}</nav>`;
  h+=`<div class="host-workspace" data-section="${section}">`;
  if(section==='flow'){
    h+=`<div class="host-status-grid"><div><small>目前階段</small><b>${esc(phaseNames[S.phase]||S.phase)}</b></div><div><small>房市倍率</small><b>${esc(marketName)} ×${(S.settings.market[S.market]||100)/100}</b></div><div><small>🏦 銀行庫房</small><b>${G.money(S.bank||0)}</b></div><div><small>現在操作</small><b>${active?esc(active.name):'尚未指定'}</b></div><div><small>隊輔連線</small><b>${S.teams.filter(t=>t.joined).length}/${S.teams.length} 隊</b></div></div>`;
    if(fxStat)h+=`<div class="host-queue-alert"><span>⏳ ${esc(fxStat.text)}</span><button type="button" class="btn xs outline" id="bSkipFx">略過視覺</button></div>`;
    if(S.phase==='roll')h+=`<section class="host-work-card priority"><div class="host-work-title"><span>🎲 指定擲骰隊伍</span><small>每隊都必須由主持人允許</small></div><div class="host-turn-status ${active?'active':''}">${active?`現在輪到 <b>${esc(active.name)}</b> 操作`:'點選下方隊伍開放擲骰'}</div><div class="host-roll-grid">${S.teams.map((t,i)=>`<button class="btn sm allow-roll ${S.activeTeamId===i?'green':'outline'}" data-i="${i}" ${t.rolled||t.jail>0||t.jailedThisTurn||S.pendingBattle?'disabled':''}><span>${i+1}</span>${esc(t.name)}<small>${t.rolled?'已完成':S.activeTeamId===i?'操作中':'允許擲骰'}</small></button>`).join('')}</div></section>`;
    if(S.pendingBattle){const p=S.pendingBattle,attacker=S.teams[p.attackerId],defender=S.teams[p.defenderId];h+=`<div class="host-battle-panel"><div class="sub">⚔️ BATTLE 待裁決</div><p><b>${esc(attacker?.name||'攻方')}</b> 挑戰 <b>${esc(defender?.name||'守方')}</b>，過夜費 ${G.money(p.amount)}。</p>${p.status==='awaiting_host'?`<div class="battle-actions"><button class="btn sm green battle-result" data-outcome="attacker">攻方勝 · 免付</button><button class="btn sm dark battle-result" data-outcome="defender">守方勝 · 收費</button></div>`:'<div class="note">等待攻方選擇付款或 BATTLE。</div>'}</div>`;}
    h+=`<section class="host-work-card"><div class="host-work-title"><span>🏘️ 房市與關卡</span><small>現場常用控制</small></div><div class="row wrap mkrow">${S.settings.marketOrder.map(k=>`<button class="tg mk ${S.market===k?'on':''}" data-k="${k}">${S.settings.marketNames[k]}<span class="mx">×${S.settings.market[k]/100}</span></button>`).join('')}</div><div class="stage-unlock-grid">${G.STAGE_IDX.map(i=>`<button class="btn xs purple unl" data-i="${i}">${S.unlocked.includes(i)?'✓ 已解封':'解封'}第 ${i+1} 格</button>`).join('')}</div></section>`;
    if(S.phase!=='ended')h+=`<section class="host-work-card finish"><div class="host-work-title"><span>🏆 結算控制</span><small>活動尾聲才使用</small></div><div class="host-finish-actions">${S.phase==='settle'?'<button class="btn sm purple" id="bResume">↩ 返回遊戲</button>':'<button class="btn sm gold" id="bSettle">進行最終結算</button>'}<button class="btn sm dark" id="bEnd">結束並封存活動</button></div></section>`;
  }
  if(section==='teams'){
    h+=`<div class="host-section-intro"><b>隊伍與裝置</b><span>在隊輔連線列表直接修改隊名、查看裝置狀態並調整資源。</span></div><div class="host-team-columns"><section class="host-work-card"><div class="host-work-title"><span>隊輔連線</span><small>${S.teams.filter(t=>t.joined).length} 台在線</small></div><div class="team-connection-list">${S.teams.map((t,i)=>{const editing=App.editingTeamName===i,draft=App.hostDrafts[`name:${i}`]??t.name;return `<div class="team-connection ${editing?'editing':''}"><span class="sw" style="background:${t.color}">${i+1}</span><div class="team-connection-copy">${editing?`<input class="team-name-edit" data-i="${i}" value="${esc(draft)}" maxlength="30" aria-label="修改第 ${i+1} 組隊名">`:`<b>${esc(t.name)}</b><small>${t.joined?'● 已連線':'○ 未連線'}</small>`}</div><div class="team-connection-actions">${editing?`<button type="button" class="team-name-save" data-i="${i}" title="儲存隊名" aria-label="儲存隊名">✓</button><button type="button" class="team-name-cancel" data-i="${i}" title="取消修改" aria-label="取消修改">×</button>`:`<button type="button" class="team-name-edit-button" data-i="${i}" title="修改 ${esc(t.name)}" aria-label="修改 ${esc(t.name)}">✎</button>`}${t.joined&&!editing?`<button class="btn xs dark kick" data-i="${i}">踢出</button>`:''}</div></div>`;}).join('')}</div></section><section class="host-work-card"><div class="host-work-title"><span>快速調整</span><small>輸入正數增加、負數扣除</small></div>${S.teams.map((t,i)=>`<div class="adj2"><div class="sw" style="background:${t.color}">${i+1}</div><div class="an2">${esc(t.name)}<span class="dim">${G.money(t.cash)}／${t.pts} 點</span></div><div class="ain"><input class="cash" data-i="${i}" type="number" inputmode="numeric" placeholder="現金"><button class="btn xs gold csgo" data-i="${i}">套用</button></div><div class="ain"><input class="pts" data-i="${i}" type="number" inputmode="numeric" placeholder="點數"><button class="btn xs blue ptgo" data-i="${i}">套用</button></div></div>`).join('')}</section></div>`;
  }
  if(section==='rules')h+=`<div class="host-section-intro"><b>遊戲規則與數值</b><span>所有設定會在按下儲存後一次驗證套用。</span></div><div class="host-rules-panel">${cfgHTML()}</div>`;
  if(section==='history')h+=`<div class="host-section-intro"><b>歷史與稽核紀錄</b><span>查閱 Durable Object / D1 保存的操作事件。</span></div><section class="host-work-card"><button class="btn sm outline" id="showHistory">載入 D1 歷史紀錄</button><div id="historyBox"></div></section>`;
  return h+'</div></div>';
}
function captureHostDrafts(){
  if(App.role!=='host')return;
  document.querySelectorAll('.cash[data-i],.pts[data-i],.cfg[data-p],.team-name-edit[data-i]').forEach(el=>{let key=el.classList.contains('team-name-edit')?`name:${el.dataset.i}`:el.classList.contains('cash')?`cash:${el.dataset.i}`:el.classList.contains('pts')?`pts:${el.dataset.i}`:`cfg:${el.dataset.p}`;if(el.value!=='')App.hostDrafts[key]=el.value;});
}
function restoreHostDrafts(){
  if(App.role!=='host')return;
  document.querySelectorAll('.cash[data-i],.pts[data-i],.cfg[data-p],.team-name-edit[data-i]').forEach(el=>{const key=el.classList.contains('team-name-edit')?`name:${el.dataset.i}`:el.classList.contains('cash')?`cash:${el.dataset.i}`:el.classList.contains('pts')?`pts:${el.dataset.i}`:`cfg:${el.dataset.p}`;if(Object.prototype.hasOwnProperty.call(App.hostDrafts,key))el.value=App.hostDrafts[key];});
}
function renderGame(){
  captureHostDrafts();
  const S=App.state;if(!S){$('app').innerHTML='<div class="card"><div class="cb">正在建立即時連線…</div></div>';return;}
  const isSettled = S.phase === 'settle' || S.phase === 'ended';
  const tabs = App.role==='team'?[['main','🎮 遊戲'],['backpack','🎒 背包'],['receipts','🧾 收據']]:App.role==='host'?[['host','🎛️ 主控'],['main','🗺️ 棋盤'],['receipts','🧾 收據']]:[];
  if (isSettled) {
    tabs.push(['settle', '🏆 結算頒獎']);
  }
  if(App.role!=='viewer')tabs.push(['log', '📜 紀錄']);

  if (isSettled && App.role !== 'host' && !App._hasSwitchedSettleTab) {
    App.tab = 'settle';
    App._hasSwitchedSettleTab = true;
  }
  if (!isSettled) {
    App._hasSwitchedSettleTab = false;
    if (App.tab === 'settle') App.tab = 'main';
  }
  if (tabs.length&&!tabs.some(x => x[0] === App.tab)) App.tab = App.role==='host'?'host':'main';

  const flow=[['market','房市'],['sell','基地'],['shop','商店'],['roll','移動']];const phaseTrack=S.phase==='setup'||S.phase==='ended'||S.phase==='settle'?'':`<div class="phase-track">${flow.map(([k,n],i)=>`<div class="phase-step ${S.phase===k?'on':''} ${flow.findIndex(x=>x[0]===S.phase)>i?'done':''}"><span>${i+1}</span>${n}</div>`).join('')}</div>`;
  const boardCard=`<div class="game-primary"><div class="card board-card"><div class="ch">★ 人生道路 — 點格子查看說明</div><div class="cb">${boardHTML()}<div class="note board-legend">🚩＝領地　立體方塊＝駐留隊伍　綠色遮罩＝未解封</div></div></div></div>`;
  let body='';
  if(App.role==='viewer'&&App.tab==='main'){
    body=`<div class="viewer-dashboard">${boardCard}<aside class="viewer-live-rail">${stagePanelHTML()}${activeTurnHTML()}${rankingHTML()}${viewerActivityHTML()}</aside></div>`;
  }else if(App.role==='team'&&['main','backpack','receipts','log'].includes(App.tab)){
    body=`<div class="game-layout team-persistent-layout team-tab-${App.tab}">${boardCard}<aside class="game-sidebar team-tab-panel" data-team-tab="${App.tab}">${teamSideHTML(App.tab)}</aside></div>`;
  }else if(App.tab==='main') body=`${stageTickerHTML()}<div class="game-layout">${boardCard}<aside class="game-sidebar">${teamControls()}${rankingHTML()}</aside></div>`;
  if(App.tab==='settle') body=settleHTML();
  if(App.tab==='receipts'&&App.role!=='team') body=receiptsHTML();
  if(App.tab==='log'&&App.role!=='team') body=logHTML();
  if(App.tab==='host'&&App.role==='host') body=hostPanel();
  const phaseFx=App.fx.phase?`<div class="phase-overlay ${App.fx.phase.kind}" aria-live="assertive"><div class="phase-overlay-card"><div class="phase-symbol">${esc(App.fx.phase.symbol)}</div><div class="phase-title">${esc(App.fx.phase.title)}</div><div class="phase-subtitle">${esc(App.fx.phase.subtitle)}</div></div></div>`:'';
  const eventFx=App.fx.event?`<div class="event-flash ${App.fx.event.kind}" aria-live="polite"><span class="event-mark"></span><strong>${esc(App.fx.event.message)}</strong></div>`:'';
  const attackFx=App.fx.attack?`<div class="attack-overlay attack-${App.fx.attack.kind} ${App.role==='team'?'team-perspective':''}" aria-live="assertive">${attackSceneHTML(App.fx.attack.kind, App.fx.attack)}<div class="attack-cinematic">⚠ LIFE EVENT // SPECIAL OPERATION ⚠</div><div class="attack-card"><div class="attack-symbol">${esc(App.fx.attack.symbol)}</div><div class="attack-kicker">${App.role==='team'?(App.fx.attack.teamId===App.teamId?'本隊發動':'本隊遭遇'):'SPECIAL OPERATION'}</div><div class="attack-title">${esc(App.fx.attack.title)}</div><div class="attack-subtitle">【${esc(App.fx.attack.teamName)}】發動｜${esc(App.fx.attack.subtitle)}</div><div class="attack-message">${esc(App.fx.attack.message)}</div></div></div>`:'';
  const diceFx=App.fx.dice?`<div class="dice-flight ${App.fx.dice.rolling?'tumbling':'revealed'}" aria-live="assertive"><div class="dice-flight-name">${esc(App.fx.dice.teamName)} 擲出 ${App.fx.dice.values?.length||1} 顆骰子</div>${diceSetHTML(App.fx.dice.values||[App.fx.dice.value],App.fx.dice.value)}<strong>${App.fx.dice.rolling?'ROLLING…':`總和 ${App.fx.dice.value}`}</strong></div>`:'';
  const assignmentFx=assignmentFxHTML();
  const purchaseFx=purchaseFxHTML();
  const teamMomentFx=teamMomentFxHTML();
  const battleEncounter=battleEncounterHTML();
  const audioWake=audioWakeHTML();
  const nav=tabs.length?`<div class="game-head"><div class="row tabs">${tabs.map(([k,n])=>`<button class="tg tb ${App.tab===k?'on':''}" data-k="${k}">${n}</button>`).join('')}</div></div>`:'';
  const turnBanner=App.role==='team'?activeTurnHTML():'';
  $('app').innerHTML=`<div class="bar game-topbar"><div><span class="code2">${esc(App.gameMeta?.name||S.code)}</span><br><span class="ph">${esc(S.paused?'已暫停':(phaseNames[S.phase]||S.phase))} · 第 ${S.round} 回合</span></div><div class="connection-row"><button type="button" class="btn-sound-toggle ${App.sound?'':'muted'}" id="bSound" title="切換音效">${App.sound?'🔊 ON':'🔇 OFF'}</button><span class="role-pill">${esc(roleNames[App.role])}</span><span class="status ${App.connected?'':'off'}" aria-live="polite"><i class="status-dot"></i>${App.connected?'LIVE':'連線中'}</span><button class="btn xs ink" id="leaveGame">離開</button></div></div>${teamStatusHTML()}${turnBanner}${phaseTrack}${nav}${body}${App.role==='viewer'?'':campFooterHTML()}${audioWake}${eventFx}${phaseFx}${diceFx}${purchaseFx}${teamMomentFx}${battleEncounter}${assignmentFx}${attackFx}`;

  restoreHostDrafts();bindGame(); fitBoard();
}

function clearPendingAction(){ clearTimeout(App.pendingTimer);App.pendingTimer=null;App.pendingAction=null;App.pendingActionType=null;App.busy=false; }
function send(action,payload={},options={}){
  if(App.busy){toast('上一個操作仍在處理中');return;}
  if(!App.socket){toast('尚未連線',true);return;}
  const actionId=`${Date.now()}-${++App.actionSeq}`;
  if(!App.socket.send({type:'action',action,payload,actionId}))return;
  App.pendingAction=actionId;App.pendingActionType=action;App.busy=true;if(!options.preserveView)render(true);
  App.pendingTimer=setTimeout(()=>{if(App.pendingAction===actionId){clearPendingAction();render(true);toast('操作已完成或逾時，已恢復控制',true);}},4500);
}

function finishTeamLeave(){
  if(!App.leaving)return;clearTimeout(App.leaveTimer);App.leaveTimer=null;App.leaveActionId=null;App.leaving=false;clearSession();const socket=App.socket;App.socket=null;socket?.close();App.connected=false;App.screen='home';App.state=null;App.role=null;App.teamId=null;App.token=null;App.gameId=null;App.entry='team';history.pushState({},'','/team');render(true);
}
function requestLeaveGame(){
  if(App.role!=='team'){clearSession();go(App.entry==='admin'?'/admin':'/');return;}
  if(App.leaving)return;const actionId=`leave-${Date.now()}-${++App.actionSeq}`;App.leaving=true;App.leaveActionId=actionId;
  if(!App.socket?.send({type:'action',action:'leaveTeam',payload:{},actionId})){finishTeamLeave();return;}
  toast('正在更新隊伍裝置狀態…');App.leaveTimer=setTimeout(finishTeamLeave,1800);
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
function teamSideHTML(tab){
  const me=App.teamId!==null?App.state?.teams?.[App.teamId]:null;
  if(tab==='backpack')return me?backpackHTML(me):'<div class="viewer-note">尚未選擇隊伍</div>';
  if(tab==='receipts')return receiptsHTML(true);
  if(tab==='log')return logHTML();
  return `${teamControls()}${rankingHTML()}`;
}
function switchTeamPanel(tab){
  if(App.role!=='team'||!['main','backpack','receipts','log'].includes(tab))return false;
  const panel=document.querySelector('.team-tab-panel'),layout=document.querySelector('.team-persistent-layout');if(!panel)return false;
  App.tab=tab;panel.dataset.teamTab=tab;panel.innerHTML=teamSideHTML(tab);
  if(layout){layout.classList.remove('team-tab-main','team-tab-backpack','team-tab-receipts','team-tab-log');layout.classList.add(`team-tab-${tab}`);}
  document.querySelectorAll('.tb').forEach(b=>b.classList.toggle('on',b.dataset.k===tab));
  bindGame();fitBoard();
  if(window.innerWidth<860)requestAnimationFrame(()=>layout?.scrollIntoView({block:'start',behavior:'smooth'}));
  return true;
}
function bindGame(){
  const S=App.state, bind=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>{const tab=b.dataset.k;if(!switchTeamPanel(tab)){App.tab=tab;render(true);}});
  document.querySelectorAll('.receipt-scope').forEach(b=>b.onclick=()=>{App.receiptScope=b.dataset.scope==='all'?'all':'mine';if(!switchTeamPanel('receipts'))render(true);});
  bind('leaveGame',()=>{if(confirm('離開目前活動？'))requestLeaveGame();});
  bind('bSound',()=>{App.sound=toggleSound();if(App.sound)App.audioReady=SoundFX.unlockAudio();render(true);toast(App.sound?'🔊 音效已開啟':'🔇 音效已靜音');});
  bind('bAudioWake',()=>{App.audioReady=SoundFX.unlockAudio();if(App.audioReady)SoundFX.playFestivalIntro();render(true);toast(App.audioReady?'♪ 像素音效已啟動':'瀏覽器仍阻擋音效，請再點一次',!App.audioReady);});

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
    const me=S.teams[App.teamId];bindDiceGesture();bind('bReroll',()=>ask('使用重骰卡？','會消耗一張重骰卡，並立即重新取得本組擲骰權限。',()=>send('reroll')));bind('battlePayNow',()=>send('resolveLanding',{choice:'pay'},{preserveView:true}));bind('battleFightNow',()=>send('resolveLanding',{choice:'battle'},{preserveView:true}));bind('bUp',()=>send('upgrade'));bind('bSell',()=>send('sell'));bind('bBuyBack',()=>send('buyBack'));
    document.querySelectorAll('.atk').forEach(b=>b.onclick=()=>{const kind=b.dataset.k,a=S.settings.attacks[kind],cost=G.costWithDiscount(S,me,a.cost);ask(`發動「${a.name}」？`,`${esc(attackDescription(S,kind,a))}<br>將消耗 ${cost} 點諂媚點數，本回合不能再次發動同一招。`,()=>send('attack',{kind}));});document.querySelectorAll('.gam').forEach(b=>b.onclick=()=>send('gamble',{index:Number(b.dataset.i)}));document.querySelectorAll('.buf').forEach(b=>b.onclick=()=>send('buff',{kind:b.dataset.k}));
  }
  if(App.role==='host'){
    document.querySelectorAll('.host-section').forEach(b=>b.onclick=()=>{App.hostSection=b.dataset.section||'flow';render(true);});
    bind('bAssign',()=>ask('重新抽籤？','會重新分配所有隊伍的基地',()=>send('assignBases')));
    bind('bStart',()=>ask('開始遊戲？','開始後隊伍可以依流程進行操作',()=>send('startGame')));
    bind('bSkipFx',skipPresentationFx);
    bind('bNext',()=>{
      const fx=activeFxStatus();
      if(fx){
        if(fx.count >= 3){
          ask('動畫佇列排隊中', `${fx.text}<br>目前已有 ${fx.count} 個特效積壓，是否強制推進至下一階段？`, () => send('nextPhase'));
          return;
        }
        toast(fx.text, true);
        return;
      }
      send('nextPhase');
    });
    bind('bPause',()=>ask('暫停活動？','暫停後隊輔暫時不能操作，但觀眾仍可觀看目前狀態。',()=>send('pauseGame')));
    bind('bResume',()=>send('resumeGame'));
    bind('bSettle',()=>ask('進行最終結算？','將進入榮譽頒獎典禮畫面，向全場隊伍與觀眾公開最終排行榜。',()=>send('settleGame')));
    bind('bEnd',()=>ask('結束活動並保存紀錄？','活動將正式結束並寫入 D1 歷史資料庫，所有裝置將無法再進行遊戲操作。',()=>send('endGame')));

    document.querySelectorAll('.allow-roll').forEach(b=>b.onclick=()=>send('allowRoll',{teamId:Number(b.dataset.i)}));
    document.querySelectorAll('.battle-result').forEach(b=>b.onclick=()=>{const outcome=b.dataset.outcome,label=outcome==='attacker'?'攻方獲勝並免付過夜費':'守方獲勝並收取原過夜費';ask('確認 BATTLE 裁決？',label,()=>send('resolveBattle',{outcome}));});

    document.querySelectorAll('.kick').forEach(b=>b.onclick=()=>ask('踢出隊輔？','會關閉該隊目前的 WebSocket 連線，隊伍狀態回到未連線。',()=>send('kickTeam',{teamId:Number(b.dataset.i)})));
    document.querySelectorAll('.team-name-edit-button').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.i),team=S.teams[i];if(!team)return;App.editingTeamName=i;App.hostDrafts[`name:${i}`]=team.name;render(true);const input=document.querySelector(`.team-name-edit[data-i="${i}"]`);input?.focus();input?.select();});
    document.querySelectorAll('.team-name-edit').forEach(input=>{input.oninput=()=>{App.hostDrafts[`name:${input.dataset.i}`]=input.value;};input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();document.querySelector(`.team-name-save[data-i="${input.dataset.i}"]`)?.click();}else if(event.key==='Escape'){event.preventDefault();document.querySelector(`.team-name-cancel[data-i="${input.dataset.i}"]`)?.click();}};});
    document.querySelectorAll('.team-name-save').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.i),input=document.querySelector(`.team-name-edit[data-i="${i}"]`),name=String(input?.value||'').trim();if(!name){toast('隊伍名稱不能留白',true);input?.focus();return;}const names=S.teams.map((team,index)=>index===i?name:team.name);delete App.hostDrafts[`name:${i}`];App.editingTeamName=null;send('renameTeams',{names},{preserveView:true});});
    document.querySelectorAll('.team-name-cancel').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.i);delete App.hostDrafts[`name:${i}`];App.editingTeamName=null;render(true);});
    bind('showHistory',loadHistory);
    document.querySelectorAll('.mk').forEach(b=>b.onclick=()=>send('setMarket',{kind:b.dataset.k}));document.querySelectorAll('.unl').forEach(b=>b.onclick=()=>send('unlock',{index:Number(b.dataset.i)}));
    document.querySelectorAll('.csgo').forEach(b=>b.onclick=()=>{const input=document.querySelector(`.cash[data-i="${b.dataset.i}"]`),v=Number(input.value);if(Number.isFinite(v)){delete App.hostDrafts[`cash:${b.dataset.i}`];input.value='';send('adjustCash',{teamId:Number(b.dataset.i),amount:v},{preserveView:true});}});document.querySelectorAll('.ptgo').forEach(b=>b.onclick=()=>{const input=document.querySelector(`.pts[data-i="${b.dataset.i}"]`),v=Number(input.value);if(Number.isFinite(v)){delete App.hostDrafts[`pts:${b.dataset.i}`];input.value='';send('adjustPts',{teamId:Number(b.dataset.i),amount:v},{preserveView:true});}});
    bind('bSaveCfg',()=>{const entries=[...document.querySelectorAll('.cfg')].map(inp=>({path:inp.dataset.p,value:Number(inp.value)}));Object.keys(App.hostDrafts).filter(k=>k.startsWith('cfg:')).forEach(k=>delete App.hostDrafts[k]);send('setConfigs',{entries});});
  }
  if(App.busy)document.querySelectorAll('#app button').forEach(b=>{if(!b.matches('.tb,#leaveGame,#bSound'))b.disabled=true;});
}
async function loadHistory(){
  try{const auth=App.token||App.access.host;const data=await api(`/api/games/${encodeURIComponent(App.gameId)}/history`,{headers:{Authorization:`Bearer ${auth}`}});App.history=data.events||[];const box=$('historyBox');if(box)box.innerHTML=`<div class="history-item">共 ${App.history.length} 筆事件（台灣時間 UTC+8）</div>`+App.history.slice(0,80).map(e=>`<div class="history-item">${esc(formatTWTime(e.createdAt))}　${esc(e.actorRole)}${e.actorTeam!==null&&e.actorTeam!==undefined?'／第 '+(e.actorTeam+1)+' 組':''}<br>${esc(e.eventType)}：${esc(e.message||'')}</div>`).join('');}catch(e){toast('歷史紀錄讀取失敗：'+e.message,true);}
}
function render(force=false){ syncChrome(); if(App.screen==='home'){renderHome();return;}if(App.screen==='join')return;if(App.screen==='game')renderGame(); }

function bootApp(){
  try{
    loadAccess(); App.entry=routeEntry();
    $('modalClose').onclick=()=>{$('modal').style.display='none';}; $('modal').onclick=e=>{if(e.target.id==='modal')$('modal').style.display='none';};
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


