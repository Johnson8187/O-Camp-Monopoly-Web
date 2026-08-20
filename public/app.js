const BUILD_VERSION = '2026.08.21.23';
import { G } from './game-core.js?v=2026.08.21.23';
import { PHASE_FX, ATTACK_FX, SoundFX, isSoundEnabled, toggleSound, classifyEvent, movementPath } from './game-fx.js?v=2026.08.21.23';














const App = {
  screen: 'home', entry: 'home', role: null, gameId: null, state: null, teamId: null,
  token: null, gameMeta: null, socket: null, connected: false,
  tab: 'main', zoom: false, dice: null, rolling: false, busy: false,
  highlight: [], cfg: false, history: [], lobbyTimer: null,
  access: {host: '', team: ''}, installPrompt: null,
  pendingAction: null, pendingTimer: null, actionSeq: 0, updateReady: false, applyingUpdate: false,
  sound: isSoundEnabled(), radarFocus: null, _radarTimer: null,
  fxQueue: [], isFxRunning: false,
  fx: {phase:null,event:null,attack:null,aftershock:null,upgrade:null,assignment:null,dice:null,camera:null,positions:{},timers:{},stepText:''},
};





const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CAMP_NAME = '不「管」別人「工」蝦毀 都來「電」惦賭「醫」把';
function campFooterHTML(){ return `<footer class="camp-footer">© 2026 ${esc(CAMP_NAME)} 版權所有</footer>`; }
const phaseNames = {setup:'準備中', lobby:'準備中', running:'進行中', market:'公布股市', sell:'出售基地', shop:'商店與道具', roll:'擲骰移動', settle:'最終結算', ended:'已結束', paused:'已暫停'};

const roleNames = {host:'主持人', team:'隊輔', viewer:'觀眾'};



function accessKey(role){ return role === 'host' ? 'preview:admin-access' : 'preview:team-access'; }
function loadAccess(){ try{ App.access.host=sessionStorage.getItem(accessKey('host'))||''; App.access.team=sessionStorage.getItem(accessKey('team'))||''; }catch{} }
function saveAccess(role,password){ App.access[role]=password; try{ sessionStorage.setItem(accessKey(role),password); }catch{} }
function clearAccess(role){ App.access[role]=''; try{ sessionStorage.removeItem(accessKey(role)); }catch{} }

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
  App.fx={phase:null,event:null,attack:null,aftershock:null,upgrade:null,assignment:null,dice:null,camera:null,positions:{},timers:{},stepText:''};
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
  else if(App.fx.attack) currentDesc = `【${App.fx.attack.teamName || '隊伍'}】${App.fx.attack.title || '特殊操作'}`;
  else if(App.fx.aftershock) currentDesc = '特殊操作棋盤餘波';
  else if(App.fx.assignment) currentDesc = '命運基地抽籤';
  else if(App.fx.phase) currentDesc = `${App.fx.phase.title || '階段切換'}`;
  else if(App.fx.event) currentDesc = `事件公告（${App.fx.event.message || ''}）`;
  else if(App.fxQueue?.length) {
    const next = App.fxQueue[0];
    const typeNames = {roll:'隊伍擲骰移動', upgrade:'基地升級', attack:'特殊操作', event:'事件公告', assignment:'基地抽籤', phase:'階段切換'};
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
  watchdog=setTimeout(done,14000);

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

  App.fx.dice={teamId,teamName:team.name,value:rollVal,rolling:!reducedMotion};
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

  // 3. Base upgrades (queues all teams that leveled up)
  const upgradedTeams=(next.teams||[]).filter((t,i)=>previous.teams?.[i]&&t.level>previous.teams[i].level&&t.baseIdx!==null);
  upgradedTeams.forEach(team=>{
    enqueueFx({type:'upgrade',team});
  });

  // 4. Special attacks
  const attackChanged=next.lastAttack&&next.lastAttack.seq!==previous.lastAttack?.seq;
  if(attackChanged){
    enqueueFx({type:'attack',attack:next.lastAttack,message,next});
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
      const rollVal = Number(next.lastRoll.n) || 1;
      const landPos = next.lastRoll.landPos ?? ((beforePos + rollVal) % G.N);
      const targetPos = next.lastRoll.targetPos ?? team.pos;
      enqueueFx({type:'roll',teamId,team,beforePos,landPos,targetPos,rollVal});
    }
  }
  (next.teams||[]).forEach((team,i)=>{
    const before=previous.teams?.[i];
    if(before && before.pos!==team.pos && team.id!==lastRollTeam){
      const rollVal=(team.pos-before.pos+G.N)%G.N||1;
      enqueueFx({type:'roll',teamId:team.id,team,beforePos:before.pos,landPos:team.pos,targetPos:team.pos,rollVal});
    }
  });



  // 6. Announcements & Event logs in FIFO order
  if(next.log&&previous.log){
    const prevFirst=previous.log[0];
    const prevIdx=next.log.indexOf(prevFirst);
    const newLogs=prevIdx>0?next.log.slice(0,prevIdx):(next.log[0]!==prevFirst?[next.log[0]]:[]);
    newLogs.reverse().forEach(logMsg=>{
      if(!logMsg)return;
      if(/發動「/.test(logMsg)&&attackChanged)return;
      if(/抽籤/.test(logMsg)&&assignmentChanged)return;
      if(/骰出/.test(logMsg))return;
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
        if(App.pendingAction){
          if(App.role==='team' && App.teamId!==null){
            const me=m.state.teams?.[App.teamId];
            if(me?.rolled || (m.state.rev||0) > (previous?.rev||0)) clearPendingAction();
          } else if((m.state.rev||0) > (previous?.rev||0)){
            clearPendingAction();
          }
        }
        processGameFx(previous,m.state);
        App.gameMeta={...App.gameMeta,status:m.status};
        render(true);
      }
      else if(m.type==='hello_ok'){ App.connected=true; App.state=m.state; App.gameMeta={...App.gameMeta,...m.meta}; saveSession(); render(true); }
      else if(m.type==='action_ok'){ clearPendingAction();render(true); }
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
function boardAftermathHTML(kind){
  if(!kind)return '';
  if(kind==='quake')return `<div class="board-aftermath board-quake">${Array.from({length:5},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  if(kind==='missile'){
    const after = App.fx.aftershock;
    let targetPos = after?.targetPos;
    if (targetPos === null || targetPos === undefined) {
      if (after?.targetTeam !== undefined && App.state?.teams?.[after.targetTeam]?.pos !== undefined) {
        targetPos = App.state.teams[after.targetTeam].pos;
      } else if (after?.hit?.length) {
        targetPos = after.hit[0];
      } else {
        const found = App.state?.teams?.find(t => (after?.message || '').includes(t.name));
        targetPos = found ? found.pos : 0;
      }
    }
    const pt = movementPoint(targetPos || 0);
    const targetName = after?.targetTeamName || (after?.targetTeam !== undefined ? App.state?.teams?.[after.targetTeam]?.name : '');
    return `<div class="board-aftermath board-missile" style="--lock-x:${pt.x}px;--lock-y:${pt.y}px"><div class="missile-target-circle"><i></i><i></i><i></i><b>LOCK ${targetName ? esc(targetName) : ''}</b></div></div>`;
  }
  if(kind==='typhoon')return `<div class="board-aftermath board-typhoon">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  return `<div class="board-aftermath board-wildfire">${Array.from({length:14},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
}
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
  <div class="card"><div class="ch">★ 觀戰入口</div><div class="cb"><div id="lobbyList" class="lobby-list">載入中…</div><button class="btn sm gold" id="refreshLobby" style="margin-top:10px">重新整理</button></div></div>${campFooterHTML()}`;
  $('refreshLobby').onclick=refreshLobby;
  clearInterval(App.lobbyTimer); App.lobbyTimer=setInterval(refreshLobby,8000); refreshLobby(); updateNav();
}


function renderGate(role){
  const host=role==='host';
  $('app').innerHTML=`<div class="hd"><div class="t1">${host?'主持人控制台':'隊輔系統'}</div><div class="t2">${host?'請輸入控制台密碼':'輸入共用密碼後直接選隊'}</div></div><div class="card"><div class="ch">★ ${host?'主持人登入':'隊輔登入'}</div><div class="cb"><input id="accessPassword" type="password" autocomplete="current-password" placeholder="密碼"><button class="btn green" id="accessLogin">登入</button><div class="note">${host?'這台裝置會保留活動連線，方便斷線或重新整理後恢復。':'驗證成功後會直接顯示目前隊伍，不需要房號或 PIN。'}密碼不會寫入網址。</div></div></div>${campFooterHTML()}`;
  $('accessLogin').onclick=async()=>{ const p=$('accessPassword').value||''; if(!p){toast('請輸入密碼',true);return;} try{await api('/api/auth',{method:'POST',body:JSON.stringify({role,password:p})});saveAccess(role,p);render(true);toast(host?'主持人登入成功':'隊輔登入成功');}catch(e){toast('登入失敗：'+e.message,true);} };
  $('accessPassword').onkeydown=e=>{if(e.key==='Enter')$('accessLogin').click();}; updateNav();
}
async function renderTeamHome(){
  if(!App.access.team) return renderGate('team');
  $('app').innerHTML=`<div class="hd"><div class="t1">隊輔入口</div><div class="t2">正在取得目前活動與隊伍狀態</div></div><div class="card"><div class="cb" id="teamEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div>${campFooterHTML()}`;
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
  $('app').innerHTML=`<div class="hd"><div class="t1">主持人主控台</div><div class="t2">單一活動的建立、開始、暫停、結束與隊伍管理</div></div><div class="card"><div class="cb" id="adminEntryBox">正在檢查活動狀態…</div></div><div class="card"><div class="cb"><button class="btn sm ink" id="adminLogout">主持人登出</button></div></div>${campFooterHTML()}`;
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
  $('app').innerHTML=`<div class="hd team-pick-head"><div class="t1">選擇你的隊伍</div><div class="t2">${esc(game.name||'目前活動')} · ${esc(phaseNames[game.status]||game.status)}</div></div><div class="card"><div class="ch">★ 點一下直接加入</div><div class="cb"><div class="note team-pick-note">共用密碼已通過。請確認隊名與顏色；標示「已有裝置」的隊伍仍可加入，但會先再次確認。</div><div class="team-pick-grid">${teams.map((t,i)=>`<button type="button" class="team-pick ${t.joined?'occupied':''}" data-i="${i}"><span class="team-pick-color" style="background:${esc(t.color)};color:${G.LIGHT_FG.includes(i)?'#14110f':'#fff'}">${i+1}</span><span class="team-pick-main"><b>${esc(t.name)}</b><small>第 ${i+1} 組</small></span><span class="team-pick-status ${t.joined?'online':''}">${t.joined?'已有裝置':'可以加入'}</span></button>`).join('')}</div><div class="team-pick-actions"><button class="btn sm outline" id="refreshTeams">更新隊伍狀態</button><button class="btn sm ink" id="teamLogout">隊輔登出</button></div></div></div>${campFooterHTML()}`;

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
    const [kind,c,r]=t,T=G.TILE[kind],own=G.ownerOf(S,i),here=S.teams.filter(x=>App.fx.positions[x.id]===undefined&&x.pos===i),attackHot=attackHit.includes(i),stepHot=App.highlight.includes(i),radarHot=App.radarFocus===i,upgradeHot=upgradeIdx===i,hot=attackHot||stepHot||radarHot||upgradeHot,locked=kind==='stage'&&!S.unlocked.includes(i),garrison=here[0];
    out+=`<div class="tile ${attackHot?`fx-hit fx-hit-${attackKind}`:stepHot?'fx-step':''} ${cameraPos===i?'camera-focus':''} ${radarHot?'radar-beacon':''} ${upgradeHot?'fx-upgrade':''} ${here.length?'has-garrison':''}" data-i="${i}" style="left:${c*(cell+gap)}px;top:${r*(cell+gap)}px;background:${hot?'#ffdcdc':T.bg};border-color:${hot?'#e23b3b':'#14110f'};--garrison:${garrison?.color||'#f2c12e'}">${kind==='base'&&own?baseBuildingHTML(own):sprite(kind,22)}<div class="tl" style="color:${T.fg}">${kind==='base'&&own?esc(S.settings.levels[own.level-1]?.name||T.n):T.n}</div>${locked?'<div class="lock"></div>':''}${own?`<div class="ow" style="background:${own.color};color:${G.LIGHT_FG.includes(own.id)?'#14110f':'#fff'}">🚩${own.id+1}</div>`:''}${here.length?`<div class="garrison-aura" aria-hidden="true"></div><div class="pins">${here.slice(0,3).map(h=>`<i class="${App.teamId===h.id?'is-me':''}" style="background:${h.color};color:${G.LIGHT_FG.includes(h.id)?'#14110f':'#fff'}">${h.id+1}</i>`).join('')}${here.length>3?`<i class="more">+${here.length-3}</i>`:''}</div>`:''}${upgradeHot?`<div class="upgrade-frame-3d"></div><div class="upgrade-badge">▲ 基地升級 LV${App.fx.upgrade.level} ▲</div>`:''}</div>`;

  });
  S.teams.filter(team=>App.fx.positions[team.id]!==undefined).forEach(team=>{const point=movementPoint(App.fx.positions[team.id]);out+=`<div class="moving-token" data-moving-team="${team.id}" style="--token-x:${point.x}px;--token-y:${point.y}px;--token-color:${team.color};--token-fg:${G.LIGHT_FG.includes(team.id)?'#14110f':'#fff'}"><span>${team.id+1}</span></div>`;});
  if(App.fx.stepText)out+=`<div class="step-progress-badge">${esc(App.fx.stepText)}</div>`;
  return out+boardAftermathHTML(attackKind)+boardHUD()+'</div></div><button class="btn sm gold" id="bZoom">'+(App.zoom?'符合螢幕':'放大檢視')+'</button>';
}

function assignmentFxHTML(){
  const fx=App.fx.assignment;if(!fx)return '';
  const cards=fx.teams.map((team,i)=>`<div class="draft-result" style="--draft-delay:${1050+i*380}ms;--team:${team.color}"><div class="draft-result-inner"><span class="draft-team-no">TEAM ${team.id+1}</span><b>${esc(team.name)}</b><i>→</i><strong>第 ${team.baseIdx+1} 格基地</strong></div></div>`).join('');
  return `<div class="assignment-overlay" style="--draft-duration:${fx.duration}ms;--draft-complete-delay:${1200+fx.teams.length*380}ms" aria-live="assertive"><div class="assignment-scan"></div><div class="assignment-stage"><div class="assignment-kicker">BASE LOTTERY // LIVE DRAW</div><h2>命運基地抽籤</h2><p>洗牌完成，依序公布各隊領地</p><div class="draft-machine"><i></i><i></i><i></i><b>抽籤中</b></div><div class="draft-results">${cards}</div><div class="draft-complete">★ 基地分配完成 ★</div></div></div>`;
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
  if(S.phase==='settle')return `<div class="viewer-note" style="border-left:4px solid #ffd700;background:#fffdf0;color:#7c5800;">🏆 <strong>活動已進入最終結算！</strong><br>請點選上方「🏆 結算頒獎」頁籤查看全場名次與頒獎典禮。</div>`;
  if(S.phase==='ended')return `<div class="viewer-note">活動已結束，操作功能已關閉。請點選上方「🏆 結算頒獎」頁籤瀏覽最終成績。</div>`;
  if(S.paused)return `<div class="viewer-note">主持人已暫停活動，恢復後才能繼續操作。</div>`;

  let h=`<div class="card"><div class="ch">★ ${esc(me.name)} 的操作</div><div class="cb">`;
  if(S.phase==='market'){h+='<div class="note">正在公布本回合股市，請等待主持人進入下一階段。</div>';}
  if(S.phase==='roll'){
    if(me.jail>0){
      h+=`<div class="dice-result-panel"><div style="font-size:28px;line-height:1.2;margin-bottom:6px;">⛓️</div><b style="color:#e23b3b">目前在監獄中服刑，本回合停留跳過行動</b></div>`;
    }else{
      const mine=App.fx.dice?.teamId===me.id,lastMine=S.lastRoll?.team===me.id?S.lastRoll.n:1;
      if(me.rolled||App.busy)h+=`<div class="dice-result-panel ${mine&&App.fx.dice?.rolling?'rolling':''}">${diceCubeHTML(mine?App.fx.dice.value:lastMine)}<b>${App.busy?'骰子飛行中…':`本回合擲出 ${lastMine} 點`}</b></div>`;
      else h+=`<div class="dice-throw-pad" id="diceThrow" role="button" tabindex="0" aria-label="向上滑動擲骰子"><div class="throw-lane"><span>FLICK TO ROLL</span>${diceCubeHTML(1)}<i class="throw-arrow">↑</i><i class="throw-status">向上甩動</i></div><strong>按住骰子向上滑動，放手擲出</strong><small>快速輕甩或拉過紅線即可；點數仍由伺服器公平決定</small></div>`;
    }
  }

  if(S.phase==='shop'){ h+=`<div class="note">目前是商店階段。</div>${S.settings.gambles.map((g,i)=>`<button class="btn sm purple gam" data-i="${i}">${g.name}　${G.costWithDiscount(S,me,g.cost)} 點</button>`).join('')}${Object.entries(S.settings.buffs).map(([k,b])=>`<button class="btn sm blue buf" data-k="${k}">${b.name}　${G.costWithDiscount(S,me,b.cost)} 點</button>`).join('')}`; }
  if(S.phase==='roll'){ h+=`<div class="seg">特殊操作・每招每回合限一次</div><div class="attack-list">${Object.entries(S.settings.attacks).map(([k,a])=>{const used=Boolean(S.attackUsage?.[`${Number(S.round)}:${me.id}:${k}`])||Number(me.attackRounds?.[k])===Number(S.round),cost=G.costWithDiscount(S,me,a.cost),lack=me.pts<cost;return `<div class="attack-action"><button class="btn sm dark atk ${used?'used':lack?'lack':''}" data-k="${k}" ${used||lack?'disabled':''}><span>${a.name}</span><b>${used?'本回合已使用':lack?`還差 ${cost-me.pts} 點`:cost+' 點'}</b></button><div class="attack-help">${esc(attackDescription(S,k,a))}</div></div>`;}).join('')}</div><button class="btn sm ink" id="bBattle">使用 BATTLE（剩 ${me.battles} 次）</button>`; }
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
      <h2 class="settle-title">🏆 最終結算 · 榮譽頒獎典禮 🏆</h2>
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
  const S=App.state; let h='<div class="card"><div class="ch">★ 主持人控制台</div><div class="cb">';
  h+=`<div class="note share-note">請讓隊輔從首頁底部導覽進入「隊輔」，隊員與觀眾直接留在首頁觀戰。</div>`;
  h+=`<div class="connection-row"><span class="role-pill">主持人控制權</span><span class="status ${App.connected?'':'off'}"><i class="status-dot"></i>${App.connected?'已連線':'未連線'}</span></div>`;
  h+='<div class="note">隊輔輸入共用密碼後即可直接選隊。若有人選錯隊，可在下方將該隊踢出後重新加入。</div>';
  const fxStat=activeFxStatus();
  if(fxStat){
    h+=`<div class="note" style="border-left:4px solid #f2c12e;background:#fff8e6;color:#8a5d00;margin:10px 0;">⏳ <strong>排隊播放中：</strong>${esc(fxStat.text)}</div>`;
  }
  h+=`<div class="sub">活動流程控制</div><div class="small-grid">${S.phase==='setup'?'<button class="btn sm gold" id="bAssign">重新抽籤</button><button class="btn sm green" id="bStart">開始遊戲</button>':''}${!['setup','settle','ended'].includes(S.phase)?'<button class="btn sm blue" id="bNext">進入下一階段</button>':''}${S.phase!=='ended'?(S.paused?'<button class="btn sm green" id="bResume">恢復活動</button>':'<button class="btn sm gold" id="bPause">暫停活動</button>'):''}</div>`;
  if(S.phase!=='ended'){
    h+=`<div class="sub">🏆 最終結算與頒獎典禮</div><div class="note">活動結束時點擊此處，將全場廣播並開啟榮譽頒獎典禮，公布 🥇🥈🥉 3D 立體頒獎台與全場最終排行榜。</div><div class="row" style="margin-top:8px;">${S.phase==='settle'?'<button class="btn sm purple" id="bResume" style="font-weight:bold;">↩️ 返回遊戲流程</button>':'<button class="btn sm gold" id="bSettle" style="font-size:12px;font-weight:bold;padding:9px 16px;">🏆 進行最終結算與頒獎</button>'}</div>`;
  }

  h+='<div class="sub">隊伍名稱</div><textarea id="teamNames">'+esc(S.teams.map(t=>t.name).join('\n'))+'</textarea><button class="btn sm green" id="saveNames">儲存隊伍名稱</button>';
  h+='<div class="sub">隊輔連線</div><div class="team-connection-list">'+S.teams.map((t,i)=>`<div class="team-connection"><span class="sw" style="background:${t.color}">${i+1}</span><span>${esc(t.name)}<small>${t.joined?'已連線':'未連線'}</small></span>${t.joined?`<button class="btn xs dark kick" data-i="${i}">踢出</button>`:''}</div>`).join('')+'</div>'; h+='<div class="sub">主持人調整</div>'; h+=S.teams.map((t,i)=>`<div class="adj2"><div class="sw" style="background:${t.color}">${i+1}</div><div class="an2">${esc(t.name)}<span class="dim">現金 ${G.money(t.cash)}／點數 ${t.pts}</span></div><div class="ain"><input class="cash" data-i="${i}" type="number" placeholder="現金"><button class="btn xs gold csgo" data-i="${i}">調整</button></div><div class="ain"><input class="pts" data-i="${i}" type="number" placeholder="點數"><button class="btn xs blue ptgo" data-i="${i}">調整</button></div></div>`).join('');
  h+='<div class="sub">股市與關卡</div><div class="row wrap mkrow">'+S.settings.marketOrder.map(k=>`<button class="tg mk" data-k="${k}">${S.settings.marketNames[k]}<span class="mx">×${S.settings.market[k]/100}</span></button>`).join('')+'</div><div class="row wrap">'+G.STAGE_IDX.map(i=>`<button class="btn xs purple unl" data-i="${i}">解封第 ${i+1} 格</button>`).join('')+'</div>';
  h+='<button class="btn sm outline" id="showHistory">查看 D1 歷史紀錄</button><div id="historyBox"></div><button class="btn sm gold" id="bCfg">'+(App.cfg?'收起設定':'展開設定')+'</button>'+(App.cfg?cfgHTML():'');

  h+=`<div class="host-danger-zone"><div class="sub">⚠️ 活動封存與結束</div><div class="note warn">結束活動將封存所有遊戲紀錄並保存至 D1 資料庫，所有隊伍將無法再進行任何操作。請確認已完成頒獎結算。</div><button class="btn sm dark" id="bEnd">結束並保存紀錄</button></div>`;

  h+='</div></div>';return h;
}
function renderGame(){
  const S=App.state;if(!S){$('app').innerHTML='<div class="card"><div class="cb">正在建立即時連線…</div></div>';return;}
  const isSettled = S.phase === 'settle' || S.phase === 'ended';
  const tabs = [['main', '遊戲']];
  if (isSettled) {
    tabs.push(['settle', '🏆 結算頒獎']);
  }
  tabs.push(['log', '紀錄']);
  if (App.role === 'host') tabs.push(['host', '主控']);

  if (isSettled && App.role !== 'host' && !App._hasSwitchedSettleTab) {
    App.tab = 'settle';
    App._hasSwitchedSettleTab = true;
  }
  if (!isSettled) {
    App._hasSwitchedSettleTab = false;
    if (App.tab === 'settle') App.tab = 'main';
  }
  if (!tabs.some(x => x[0] === App.tab)) App.tab = 'main';

  const flow=[['market','股市'],['sell','基地'],['shop','商店'],['roll','移動']];const phaseTrack=S.phase==='setup'||S.phase==='ended'||S.phase==='settle'?'':`<div class="phase-track">${flow.map(([k,n],i)=>`<div class="phase-step ${S.phase===k?'on':''} ${flow.findIndex(x=>x[0]===S.phase)>i?'done':''}"><span>${i+1}</span>${n}</div>`).join('')}</div>`;
  let body=''; if(App.tab==='main') body=`${stageTickerHTML()}<div class="game-layout"><div class="game-primary"><div class="card board-card"><div class="ch">★ 棋盤 — 點格子查看說明</div><div class="cb">${boardHTML()}<div class="note board-legend">🚩＝領地　立體方塊＝駐留隊伍　綠色遮罩＝未解封</div></div></div></div><aside class="game-sidebar">${teamControls()}${rankingHTML()}</aside></div>`;
  if(App.tab==='settle') body=settleHTML();
  if(App.tab==='log') body=logHTML();
  if(App.tab==='host'&&App.role==='host') body=hostPanel();
  const phaseFx=App.fx.phase?`<div class="phase-overlay ${App.fx.phase.kind}" aria-live="assertive"><div class="phase-overlay-card"><div class="phase-symbol">${esc(App.fx.phase.symbol)}</div><div class="phase-title">${esc(App.fx.phase.title)}</div><div class="phase-subtitle">${esc(App.fx.phase.subtitle)}</div></div></div>`:'';
  const eventFx=App.fx.event?`<div class="event-flash ${App.fx.event.kind}" aria-live="polite"><span class="event-mark"></span><strong>${esc(App.fx.event.message)}</strong></div>`:'';
  const attackFx=App.fx.attack?`<div class="attack-overlay attack-${App.fx.attack.kind}" aria-live="assertive">${attackSceneHTML(App.fx.attack.kind)}<div class="attack-cinematic">⚠ WARNING // SPECIAL ATTACK DETECTED ⚠</div><div class="attack-card"><div class="attack-symbol">${esc(App.fx.attack.symbol)}</div><div class="attack-kicker">SPECIAL ATTACK</div><div class="attack-title">${esc(App.fx.attack.title)}</div><div class="attack-subtitle">【${esc(App.fx.attack.teamName)}】發動｜${esc(App.fx.attack.subtitle)}</div><div class="attack-message">${esc(App.fx.attack.message)}</div></div></div>`:'';
  const diceFx=App.fx.dice?`<div class="dice-flight ${App.fx.dice.rolling?'tumbling':'revealed'}" aria-live="assertive"><div class="dice-flight-name">${esc(App.fx.dice.teamName)} 擲骰</div>${diceCubeHTML(App.fx.dice.value)}<strong>${App.fx.dice.rolling?'ROLLING…':App.fx.dice.value}</strong></div>`:'';
  const assignmentFx=assignmentFxHTML();
  $('app').innerHTML=`<div class="bar"><div><span class="code2">${esc(App.gameMeta?.name||S.code)}</span><br><span class="ph">${esc(S.paused?'已暫停':(phaseNames[S.phase]||S.phase))} · 第 ${S.round} 回合</span></div><div class="connection-row"><button type="button" class="btn-sound-toggle ${App.sound?'':'muted'}" id="bSound" title="切換音效">${App.sound?'🔊 音效 ON':'🔇 音效 OFF'}</button><span class="role-pill">${esc(roleNames[App.role])}</span><span class="status ${App.connected?'':'off'}" aria-live="polite"><i class="status-dot"></i>${App.connected?'即時連線':'正在重新連線'}</span></div></div>${phaseTrack}<div class="game-head"><div class="row tabs">${tabs.map(([k,n])=>`<button class="tg tb ${App.tab===k?'on':''}" data-k="${k}">${n}</button>`).join('')}</div><div class="head-actions"><button class="btn xs ink" id="leaveGame">離開</button></div></div>${body}${campFooterHTML()}${eventFx}${phaseFx}${diceFx}${assignmentFx}${attackFx}`;

  bindGame(); fitBoard();
}

function clearPendingAction(){ clearTimeout(App.pendingTimer);App.pendingTimer=null;App.pendingAction=null;App.busy=false; }
function send(action,payload={},options={}){
  if(App.busy){toast('上一個操作仍在處理中');return;}
  if(!App.socket){toast('尚未連線',true);return;}
  const actionId=`${Date.now()}-${++App.actionSeq}`;
  if(!App.socket.send({type:'action',action,payload,actionId}))return;
  App.pendingAction=actionId;App.busy=true;if(!options.preserveView)render(true);
  App.pendingTimer=setTimeout(()=>{if(App.pendingAction===actionId){clearPendingAction();render(true);toast('操作已完成或逾時，已恢復控制',true);}},4500);
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
    bind('bAssign',()=>ask('重新抽籤？','會重新分配所有隊伍的基地',()=>send('assignBases')));
    bind('bStart',()=>ask('開始遊戲？','開始後隊伍可以依流程進行操作',()=>send('startGame')));
    bind('bNext',()=>{
      const fx=activeFxStatus();
      if(fx){
        toast(fx.text, true);
        return;
      }
      send('nextPhase');
    });
    bind('bPause',()=>ask('暫停活動？','暫停後隊輔暫時不能操作，但觀眾仍可觀看目前狀態。',()=>send('pauseGame')));
    bind('bResume',()=>send('resumeGame'));
    bind('bSettle',()=>ask('進行最終結算？','將進入榮譽頒獎典禮畫面，向全場隊伍與觀眾公開最終排行榜。',()=>send('settleGame')));
    bind('bEnd',()=>ask('結束活動並保存紀錄？','活動將正式結束並寫入 D1 歷史資料庫，所有裝置將無法再進行遊戲操作。',()=>send('endGame')));

    document.querySelectorAll('.kick').forEach(b=>b.onclick=()=>ask('踢出隊輔？','會關閉該隊目前的 WebSocket 連線，隊伍狀態回到未連線。',()=>send('kickTeam',{teamId:Number(b.dataset.i)})));
    bind('bCfg',()=>{App.cfg=!App.cfg;render(true);});

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

