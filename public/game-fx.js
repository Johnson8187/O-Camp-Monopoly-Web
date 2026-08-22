export const PHASE_FX = {
  setup:  {symbol:'READY', title:'人生廣場集結', subtitle:'等待所有隊伍抵達人生起點', kind:'setup'},
  market: {symbol:'🏠', title:'城市房市快報', subtitle:'注意本回合房產倍率', kind:'market'},
  sell:   {symbol:'＄', title:'基地發展階段', subtitle:'升級、出售或買回人生基地', kind:'sell'},
  shop:   {symbol:'◆', title:'人生補給站', subtitle:'購買旅途道具與實體物品', kind:'shop'},
  roll:   {symbol:'⚄', title:'踏上人生道路', subtitle:'隊輔可以擲骰前進', kind:'roll'},
  settle: {symbol:'🏆', title:'人生里程碑', subtitle:'最終成果與頒獎典禮', kind:'settle'},
  paused: {symbol:'Ⅱ', title:'遊戲暫停', subtitle:'請等待主持人恢復活動', kind:'paused'},
  ended:  {symbol:'★', title:'旅途告一段落', subtitle:'每一隊都留下自己的城市與故事', kind:'ended'},
};


export const ATTACK_FX = {
  quake:    {symbol:'⚡', title:'地裂震央', subtitle:'7×7 範圍強烈地震衝擊波'},
  missile:  {symbol:'🎯', title:'戰術飛彈', subtitle:'瞄準鎖定排行榜相鄰隊伍'},
  typhoon:  {symbol:'🌀', title:'超級颱風', subtitle:'雙層暴風圈橫掃，注意颱風眼'},
  wildfire: {symbol:'🔥', title:'野火焚城', subtitle:'漫天烈焰沿橫排火速蔓延'},
};

export const CEREMONY_STEPS = [
  {step:0,key:'ready',label:'典禮準備'},
  {step:1,key:'third',label:'揭曉季軍'},
  {step:2,key:'second',label:'揭曉亞軍'},
  {step:3,key:'champion',label:'揭曉總冠軍'},
  {step:4,key:'awards',label:'頒發特別獎'},
  {step:5,key:'standings',label:'公布全體排名'},
];

export function ceremonyStep(value=0){
  const parsed=Math.floor(Number(value)||0);
  return Math.max(0,Math.min(CEREMONY_STEPS.length-1,parsed));
}

export function classifyEvent(message=''){
  const text=String(message);
  if(/發動|地震|飛彈|颱風|野火|攻擊|踢出/.test(text))return 'danger';
  if(/監獄|稅收|過夜費|通行費|扣|−|崩盤|離線/.test(text))return 'loss';
  if(/升級|賣出基地|取得|\+|獎勵|抽籤完成/.test(text))return 'reward';
  if(/買了|買回|商店|道具|重骰卡|BATTLE/.test(text))return 'item';
  if(/房市|股市|回合開始|遊戲開始|暫停|恢復|解封|活動結束/.test(text))return 'phase';
  return 'info';
}

export function movementPath(from,steps,finalPosition,trackLength){
  const length=Math.max(1,Number(trackLength)||1);
  const start=((Number(from)||0)%length+length)%length;
  const count=Math.max(0,Math.floor(Number(steps)||0));
  const path=[];
  for(let i=1;i<=count;i++)path.push((start+i)%length);
  const final=((Number(finalPosition)||0)%length+length)%length;
  if(path.length===0&&final!==start)path.push(final);
  else if(path.length>0&&path.at(-1)!==final&&final!==start)path.push(final);
  return path;
}

export function pawnFacingForStep(fromTile,toTile,fallback='front'){
  const safeFallback=['front','back','left','right'].includes(fallback)?fallback:'front';
  if(!Array.isArray(fromTile)||!Array.isArray(toTile))return safeFallback;
  const dx=Number(toTile[1])-Number(fromTile[1]),dy=Number(toTile[2])-Number(fromTile[2]);
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||(dx===0&&dy===0))return safeFallback;
  if(Math.abs(dx)>=Math.abs(dy))return dx>=0?'right':'left';
  return dy>=0?'front':'back';
}

export function battlePresentationTransition(previous,next){
  const before=previous?.pendingBattle,after=next?.pendingBattle;
  if(before?.status==='awaiting_choice'&&after?.status==='awaiting_host'
    && Number(before.attackerId)===Number(after.attackerId)
    && Number(before.defenderId)===Number(after.defenderId)){
    return {type:'battleDuel',battle:after};
  }
  if(before?.status==='awaiting_host'&&!after){
    const message=String(next?.log?.[0]||'');
    const outcome=/獲勝，免付/.test(message)?'attacker':/守住基地/.test(message)?'defender':null;
    if(outcome)return {type:'battleResult',battle:before,outcome,message};
  }
  return null;
}

const LANDING_REACTIONS = {
  start:  {kind:'start',symbol:'🏁',title:'回到人生起點',pose:'celebrate',tone:'reward'},
  tax:    {kind:'tax',symbol:'💸',title:'人生帳單來襲',pose:'hit',tone:'loss'},
  fate:   {kind:'fate',symbol:'🃏',title:'命運就在手中',pose:'ready',tone:'mystery'},
  black:  {kind:'black',symbol:'◆',title:'黑市交易開張',pose:'ready',tone:'item'},
  casino: {kind:'casino',symbol:'🎰',title:'人生豪賭時刻',pose:'battle',tone:'danger'},
  bank:   {kind:'bank',symbol:'💰',title:'找到銀行密道',pose:'celebrate',tone:'reward'},
  worm:   {kind:'worm',symbol:'◎',title:'穿越人生蟲洞',pose:'warp',tone:'mystery'},
  jail:   {kind:'jail',symbol:'⛓',title:'人生暫時受困',pose:'hit',tone:'loss'},
  exch:   {kind:'market',symbol:'⌂',title:'房市情報更新',pose:'ready',tone:'info'},
  stage:  {kind:'stage',symbol:'★',title:'抵達人生關卡',pose:'celebrate',tone:'reward'},
  safe:   {kind:'safe',symbol:'✓',title:'平安抵達',pose:'land',tone:'info'},
};

export function landingReactionForTile(tileKind='',note=''){
  const kind=String(tileKind||'safe'),detail=String(note||'平安無事');
  if(kind==='base'){
    if(/自己的基地/.test(detail))return {kind:'home',symbol:'🏠',title:'回到人生據點',pose:'celebrate',tone:'reward',detail};
    if(/付款|BATTLE|對手基地|抵達.+基地/.test(detail))return {kind:'rival-base',symbol:'⚔',title:'闖入他人基地',pose:'battle',tone:'danger',detail};
    return {kind:'base',symbol:'🚩',title:'人生基地停靠',pose:'land',tone:'info',detail};
  }
  const preset=LANDING_REACTIONS[kind]||LANDING_REACTIONS.safe;
  return {...preset,detail};
}

export function attackCharacterTargets(attack={},teams=[]){
  const caster=Number(attack?.team),hitTiles=new Set((Array.isArray(attack?.hit)?attack.hit:[]).map(Number));
  const targetIds=new Set();
  const add=id=>{if(id===null||id===undefined||id==='')return;const value=Number(id);if(Number.isInteger(value)&&value>=0&&value!==caster)targetIds.add(value);};
  add(attack?.targetTeam);
  (Array.isArray(attack?.shielded)?attack.shielded:[]).forEach(add);
  (Array.isArray(teams)?teams:[]).forEach((team,index)=>{
    const id=team?.id??index;
    if(team?.baseIdx!==null&&team?.baseIdx!==undefined&&hitTiles.has(Number(team.baseIdx)))add(id);
  });
  return (Array.isArray(teams)?teams:[]).map((team,index)=>Number(team?.id??index)).filter(id=>targetIds.has(id));
}

export function presentationTier({role='',width=0,reducedMotion=false,hardwareConcurrency=8,deviceMemory=8}={}){
  if(reducedMotion)return 'reduced';
  const constrained=Number(hardwareConcurrency||8)<=4||Number(deviceMemory||8)<=4;
  if(role==='viewer'&&Number(width)>=900&&!constrained)return 'cinematic';
  if(role==='team'&&Number(width)>=700&&!constrained)return 'party';
  return constrained?'lite':'compact';
}

export function isPresentationTaskRelevant(task,{role='',teamId=null,state=null}={}){
  if(!task)return false;
  if(role!=='team')return true;
  const mine=Number(teamId);
  if(!Number.isInteger(mine))return false;
  if(['phase','assignment','event','roll','landingReaction','upgrade','sell','attack','battleDuel','battleResult'].includes(task.type))return true;
  if(['purchase'].includes(task.type))return Number(task.team?.id)===mine;
  if(['teamMoment','rank','teamTurn'].includes(task.type))return Number(task.team?.id??task.teamId)===mine;
  if(task.type==='battlePrompt')return Number(task.battle?.attackerId)===mine;
  return true;
}

export function isPurchaseReceipt(receipt,purchase){
  if(!receipt||!purchase)return false;
  const action=String(receipt.action||'');
  const cost=Math.max(0,Number(purchase.cost)||0);
  return Number(receipt.teamId)===Number(purchase.team)
    && ['gamble','buff'].includes(action)
    && Number(receipt.ptsDelta||0)===-cost;
}

/* ===================================================================
   WEB AUDIO API 8-BIT RETRO SYNTHESIZER
   =================================================================== */
let audioCtx = null;
let soundEnabled = true;
try {
  soundEnabled = localStorage.getItem('preview:sound') !== 'false';
} catch {}

export function isSoundEnabled() { return soundEnabled; }
export function toggleSound() {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem('preview:sound', soundEnabled ? 'true' : 'false'); } catch {}
  return soundEnabled;
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(()=>{});
  }
  return audioCtx;
}

export function unlockAudio(){
  if(!soundEnabled)return false;
  const ctx=getAudioContext();if(!ctx)return false;
  try{
    const gain=ctx.createGain();gain.gain.setValueAtTime(0.0001,ctx.currentTime);gain.connect(ctx.destination);
    const osc=ctx.createOscillator();osc.frequency.setValueAtTime(220,ctx.currentTime);osc.connect(gain);osc.start();osc.stop(ctx.currentTime+0.01);
  }catch{}
  return ctx.state==='running';
}
export function isAudioReady(){return Boolean(audioCtx&&audioCtx.state==='running');}

function playNotes(notes,type='square',volume=.16){
  if(!soundEnabled)return;
  const ctx=getAudioContext();if(!ctx)return;
  notes.forEach(({f,t=0,d=.12})=>setTimeout(()=>{
    if(!soundEnabled)return;
    try{
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(f,ctx.currentTime);gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+d);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+d);
    }catch{}
  },t*1000));
}

export const SoundFX = {
  isSoundEnabled,
  toggleSound,
  unlockAudio,
  isAudioReady,
  playFestivalIntro(){playNotes([{f:261.63,d:.15},{f:329.63,t:.12,d:.15},{f:392,t:.24,d:.18},{f:523.25,t:.38,d:.42}],'triangle',.2);},
  playPayment(){playNotes([{f:660,d:.09},{f:440,t:.08,d:.09},{f:294,t:.16,d:.18}],'square',.13);},
  playShield(){playNotes([{f:330,d:.12},{f:660,t:.08,d:.16},{f:990,t:.17,d:.3}],'triangle',.2);},
  playRankUp(){playNotes([{f:523.25,d:.12},{f:659.25,t:.1,d:.12},{f:783.99,t:.2,d:.12},{f:1046.5,t:.3,d:.34}],'square',.15);},
  playStepHop() {

    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch {}
  },
  playLanding() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.24, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  },
  playDiceTumble() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(180 + Math.random() * 220, ctx.currentTime);
            gain.gain.setValueAtTime(0.07, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
          } catch {}
        }, i * 85);
      }
    } catch {}
  },
  playDiceResult() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      [440, 554, 659, 880].forEach((freq, idx) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.16);
          } catch {}
        }, idx * 60);
      });
    } catch {}
  },
  playAttackAlert(kind) {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      if (kind === 'quake') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.28, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.65);
      } else if (kind === 'missile') {
        [580, 840, 1100].forEach((f, i) => {
          setTimeout(() => {
            if (!soundEnabled) return;
            try {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(f, ctx.currentTime);
              gain.gain.setValueAtTime(0.22, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.08);
            } catch {}
          }, i * 90);
        });
      } else if (kind === 'typhoon') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.35);
        osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.7);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
      } else {
        [280, 460, 700, 350].forEach((f, i) => {
          setTimeout(() => {
            if (!soundEnabled) return;
            try {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(f, ctx.currentTime);
              gain.gain.setValueAtTime(0.18, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.09);
            } catch {}
          }, i * 65);
        });
      }
    } catch {}
  },
  playCoinReward() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      [987.77, 1318.51].forEach((freq, idx) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.22, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.22);
          } catch {}
        }, idx * 90);
      });
    } catch {}
  },
  playPhaseChange() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } catch {}
        }, idx * 70);
      });
    } catch {}
  },
  playVictory() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      const notes = [
        { f: 523.25, d: 0.14, t: 0 },
        { f: 659.25, d: 0.14, t: 0.14 },
        { f: 783.99, d: 0.14, t: 0.28 },
        { f: 1046.50, d: 0.4, t: 0.42 },
        { f: 880.00, d: 0.18, t: 0.88 },
        { f: 1046.50, d: 0.65, t: 1.08 }
      ];
      notes.forEach(({ f, d, t }) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, ctx.currentTime);
            gain.gain.setValueAtTime(0.24, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + d);
          } catch {}
        }, t * 1000);
      });
    } catch {}
  },

  playAttackHit() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } catch {}
  },
  playUpgrade() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.22, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
          } catch {}
        }, idx * 80);
      });
    } catch {}
  },
  playSell() {
    if (!soundEnabled) return;
    const ctx = getAudioContext(); if (!ctx) return;
    try {
      [659.25, 880.00, 1174.66, 1567.98].forEach((freq, idx) => {
        setTimeout(() => {
          if (!soundEnabled) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.22, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.22);
          } catch {}
        }, idx * 65);
      });
    } catch {}
  }
};

/* ===================================================================
   2.5D PIXEL PAWN SPRITE SYSTEM & ADVENTURER ARCHETYPES (10 TEAMS)
   =================================================================== */

export const PAWN_ARCHETYPES = [
  { id: 0, name: 'Warrior', roleTitle: '狂戰士', color: '#e23b3b', dark: '#9e1b1b', lightFg: false },
  { id: 1, name: 'Mage', roleTitle: '大魔導', color: '#3f86e0', dark: '#1c529e', lightFg: false },
  { id: 2, name: 'Ranger', roleTitle: '神射手', color: '#3fbf5a', dark: '#1e7834', lightFg: false },
  { id: 3, name: 'Bard', roleTitle: '吟遊詩人', color: '#f2c12e', dark: '#b88a10', lightFg: true },
  { id: 4, name: 'Warlock', roleTitle: '鍊金術士', color: '#9450d8', dark: '#5a2096', lightFg: false },
  { id: 5, name: 'Engineer', roleTitle: '工程大師', color: '#e6832a', dark: '#9e4d0a', lightFg: false },
  { id: 6, name: 'Ninja', roleTitle: '疾風忍者', color: '#17a2a2', dark: '#0d5e5e', lightFg: false },
  { id: 7, name: 'Priestess', roleTitle: '聖巫女', color: '#d13f8c', dark: '#8a1854', lightFg: false },
  { id: 8, name: 'Paladin', roleTitle: '聖騎士', color: '#6b7fd0', dark: '#3b4d96', lightFg: false },
  { id: 9, name: 'Explorer', roleTitle: '冒險探家', color: '#8a6a2a', dark: '#523b12', lightFg: false }
];

export const PAWN_SIGNATURES = [
  {id:0,key:'warrior',label:'戰吼重踏'},
  {id:1,key:'mage',label:'魔力浮空'},
  {id:2,key:'ranger',label:'迅捷瞄準'},
  {id:3,key:'bard',label:'節拍旋舞'},
  {id:4,key:'warlock',label:'鍊金脈動'},
  {id:5,key:'engineer',label:'機械校準'},
  {id:6,key:'ninja',label:'殘影閃身'},
  {id:7,key:'priestess',label:'祈願漂浮'},
  {id:8,key:'paladin',label:'聖盾戒備'},
  {id:9,key:'explorer',label:'探路張望'},
];

const PAWN_POSES=['idle','ready','walk','land','battle','victory','defeat','cast','hit','shield','warp','celebrate'];

export function pawnSpriteSVG(teamId = 0, { width = 24, height = 27, pose = 'idle', direction = 'front', frame = 0 } = {}) {
  const tid = ((Number(teamId) || 0) % 10 + 10) % 10;
  const safePose=PAWN_POSES.includes(pose)?pose:'idle';
  const safeDirection=['front','back','left','right'].includes(direction)?direction:'front';
  const safeFrame=Math.abs(Math.floor(Number(frame)||0))%2;
  const svgOpen = `<svg class="pawn-svg pawn-svg-${safePose} pawn-svg-${safeDirection} pawn-svg-frame-${safeFrame}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 18" width="${width}" height="${height}" shape-rendering="crispEdges" aria-hidden="true">`;
  const svgClose = `</svg>`;

  switch (tid) {
    case 0: // Warrior / Knight (Helmet visor, red plume, heavy steel armor)
      return `${svgOpen}<path d="M7 0h2v3H7zM6 1h1v2H6z" fill="#e23b3b"/><path d="M7 1h1v1H7z" fill="#ff7a7a"/><path d="M4 3h8v5H4z" fill="#9ca8b8"/><path d="M5 3h6v2H5z" fill="#dce6f2"/><path d="M3 5h1v3H3zm12 0h1v3h-1z" fill="#687484"/><path d="M5 6h6v2H5z" fill="#1e2430"/><path d="M6 7h1v1H6zm3 0h1v1H9z" fill="#00ffff"/><path d="M5 8h6v1H5z" fill="#687484"/><path d="M3 9h10v6H3z" fill="#e23b3b"/><path d="M5 10h6v4H5z" fill="#9e1b1b"/><path d="M2 9h2v4H2zm12 0h2v4h-2z" fill="#9ca8b8"/><path d="M7 10h2v3H7z" fill="#f2c12e"/><path d="M4 14h8v1H4z" fill="#4a2a18"/><path d="M7 14h2v1H7z" fill="#f2c12e"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#687484"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#384050"/>${svgClose}`;

    case 1: // Mage / Wizard (Pointed hat with star, glowing robe, mystic beard)
      return `${svgOpen}<path d="M9 0h2v2H9z" fill="#3f86e0"/><path d="M10 0h1v1h-1z" fill="#ffd700"/><path d="M8 2h3v2H8z" fill="#3f86e0"/><path d="M6 4h5v2H6z" fill="#3f86e0"/><path d="M3 6h10v2H3z" fill="#1c529e"/><path d="M7 6h2v2H7z" fill="#ffd700"/><path d="M5 8h6v2H5z" fill="#ffdfb8"/><path d="M6 8h1v1H6zm3 0h1v1H9z" fill="#14110f"/><path d="M5 10h6v3H5zM6 13h4v1H6z" fill="#ffffff"/><path d="M3 10h2v5H3zm11 0h2v5h-2z" fill="#1c529e"/><path d="M3 11h10v4H3z" fill="#3f86e0"/><path d="M7 11h2v4H7z" fill="#ffd700"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#1c2840"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#0f1624"/>${svgClose}`;

    case 2: // Ranger / Rogue (Archer hood, yellow quill feather, leather vest)
      return `${svgOpen}<path d="M11 0h2v3h-2z" fill="#f2c12e"/><path d="M12 0h1v2h-1z" fill="#ffffff"/><path d="M4 2h8v5H4z" fill="#3fbf5a"/><path d="M5 2h6v2H5z" fill="#6be685"/><path d="M3 4h2v4H3zm10 0h2v4h-2z" fill="#1e7834"/><path d="M5 6h6v3H5z" fill="#ffdfb8"/><path d="M6 7h1v1H6zm3 0h1v1H9z" fill="#14110f"/><path d="M4 9h8v2H4z" fill="#1e7834"/><path d="M3 11h10v4H3z" fill="#3fbf5a"/><path d="M5 11h6v4H5z" fill="#7d4e24"/><path d="M7 11h2v4H7z" fill="#543214"/><path d="M4 14h8v1H4z" fill="#2c1a0c"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#5c3818"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#3a200a"/>${svgClose}`;

    case 3: // Bard / Merchant (Jaunty feather beret, golden doublet, crimson capelet)
      return `${svgOpen}<path d="M4 0h2v4H4z" fill="#ffffff"/><path d="M5 1h1v2H5z" fill="#e0e8f0"/><path d="M3 2h10v4H3z" fill="#f2c12e"/><path d="M4 2h8v2H4z" fill="#fff080"/><path d="M2 4h3v2H2zm10 0h3v2h-3z" fill="#b88a10"/><path d="M5 6h6v3H5z" fill="#ffdfb8"/><path d="M4 6h1v3H4zm11 0h1v3h-1z" fill="#8a4b18"/><path d="M6 7h1v1H6zm3 0h1v1H9z" fill="#14110f"/><path d="M4 9h8v2H4z" fill="#e23b3b"/><path d="M3 11h10v4H3z" fill="#f2c12e"/><path d="M6 11h4v4H6z" fill="#fff5a0"/><path d="M7 12h2v3H7z" fill="#b88a10"/><path d="M4 14h8v1H4z" fill="#4a2a18"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#4a2a18"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#2c1408"/>${svgClose}`;

    case 4: // Warlock / Alchemist (Occult witch hat, glowing cyan eyes, violet alchemist robe)
      return `${svgOpen}<path d="M10 0h2v2h-2z" fill="#9450d8"/><path d="M8 2h3v2H8z" fill="#9450d8"/><path d="M6 4h5v2H6z" fill="#9450d8"/><path d="M3 6h10v2H3z" fill="#5a2096"/><path d="M7 6h2v2H7z" fill="#00f0ff"/><path d="M4 8h8v2H4z" fill="#2d1248"/><path d="M6 8h1v1H6zm3 0h1v1H9z" fill="#00ffff"/><path d="M5 10h6v1H5z" fill="#ffdfb8"/><path d="M3 11h10v4H3z" fill="#9450d8"/><path d="M5 11h6v4H5z" fill="#5a2096"/><path d="M7 12h2v2H7z" fill="#00f0ff"/><path d="M4 14h8v1H4z" fill="#1c0830"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#321050"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#1c0830"/>${svgClose}`;

    case 5: // Engineer / Builder (Safety cap, steampunk goggles, wrench & overalls)
      return `${svgOpen}<path d="M4 1h8v4H4z" fill="#e6832a"/><path d="M5 1h6v2H5z" fill="#ffa64d"/><path d="M3 4h10v1H3z" fill="#9e4d0a"/><path d="M4 5h8v2H4z" fill="#4a3018"/><path d="M5 5h2v2H5zm4 0h2v2H9z" fill="#ffd700"/><path d="M6 6h1v1H6zm4 0h1v1h-1z" fill="#ffffff"/><path d="M4 7h8v3H4z" fill="#ffdfb8"/><path d="M5 8h1v1H5zm5 0h1v1h-1z" fill="#14110f"/><path d="M8 9h1v1H8z" fill="#9e4d0a"/><path d="M3 10h10v5H3z" fill="#e6832a"/><path d="M5 10h6v4H5z" fill="#2d4875"/><path d="M12 9h2v4h-2z" fill="#a0aab8"/><path d="M4 14h8v1H4z" fill="#3a2010"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#4a2810"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#281408"/>${svgClose}`;

    case 6: // Shinobi / Ninja (Teal hood, metal forehead protector, shinobi mask & red scarf)
      return `${svgOpen}<path d="M12 1h3v2h-3zm1 3h2v2h-2z" fill="#e23b3b"/><path d="M4 2h8v4H4z" fill="#17a2a2"/><path d="M3 4h10v2H3z" fill="#107070"/><path d="M6 4h4v2H6z" fill="#d0e8e8"/><path d="M4 6h8v2H4z" fill="#ffdfb8"/><path d="M5 6h2v1H5zm4 0h2v1H9z" fill="#14110f"/><path d="M4 8h8v3H4z" fill="#17a2a2"/><path d="M3 11h10v4H3z" fill="#17a2a2"/><path d="M5 11h6v4H5z" fill="#0d5e5e"/><path d="M7 11h2v3H7z" fill="#e23b3b"/><path d="M4 14h8v1H4z" fill="#0a3c3c"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#102828"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#081414"/>${svgClose}`;

    case 7: // Priestess / Shrine Maiden (Gold tiara, shrine ribbons, pink ceremonial robe)
      return `${svgOpen}<path d="M7 0h2v2H7z" fill="#ffd700"/><path d="M2 1h3v2H2zm9 0h3v2h-3z" fill="#ffffff"/><path d="M4 2h8v4H4z" fill="#2c1420"/><path d="M5 2h6v2H5z" fill="#d13f8c"/><path d="M4 6h8v3H4z" fill="#ffdfb8"/><path d="M5 7h1v1H5zm5 0h1v1h-1z" fill="#8a1854"/><path d="M7 6h2v1H7z" fill="#ffd700"/><path d="M3 9h10v2H3z" fill="#ffffff"/><path d="M2 11h12v4H2z" fill="#d13f8c"/><path d="M5 11h6v4H5z" fill="#ffffff"/><path d="M7 11h2v3H7z" fill="#ffd700"/><path d="M4 14h8v1H4z" fill="#8a1854"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#601838"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#38081c"/>${svgClose}`;

    case 8: // Paladin / Guardian (Templar greathelm with golden crest, holy tabard & sabatons)
      return `${svgOpen}<path d="M7 0h2v3H7z" fill="#ffd700"/><path d="M6 1h4v1H6z" fill="#fff080"/><path d="M4 3h8v6H4z" fill="#6b7fd0"/><path d="M5 3h6v2H5z" fill="#a4b3f0"/><path d="M3 5h2v4H3zm8 0h2v4h-2z" fill="#3b4d96"/><path d="M5 6h6v2H5z" fill="#1c2448"/><path d="M7 5h2v4H7z" fill="#ffd700"/><path d="M6 7h1v1H6zm3 0h1v1H9z" fill="#00f0ff"/><path d="M3 9h10v6H3z" fill="#6b7fd0"/><path d="M5 10h6v4H5z" fill="#3b4d96"/><path d="M2 9h2v4H2zm12 0h2v4h-2z" fill="#a4b3f0"/><path d="M7 10h2v3H7z" fill="#ffd700"/><path d="M4 14h8v1H4z" fill="#202c58"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#4a5890"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#242e54"/>${svgClose}`;

    case 9: // Explorer / Adventurer (Pith fedora, trail jacket, leather utility straps)
      return `${svgOpen}<path d="M5 1h6v3H5z" fill="#d8c898"/><path d="M6 1h4v1H6z" fill="#f0e4b8"/><path d="M4 3h8v1H4z" fill="#523b12"/><path d="M2 4h12v2H2z" fill="#8a6a2a"/><path d="M4 6h8v3H4z" fill="#ffdfb8"/><path d="M5 7h1v1H5zm5 0h1v1h-1z" fill="#14110f"/><path d="M7 8h2v1H7z" fill="#7a4218"/><path d="M3 9h10v5H3z" fill="#8a6a2a"/><path d="M5 9h6v5H5z" fill="#d8c898"/><path d="M5 9h1v5H5zm5 0h1v5h-1z" fill="#523b12"/><path d="M7 11h2v2H7z" fill="#e23b3b"/><path d="M4 14h8v1H4z" fill="#3d2808"/><path d="M4 15h3v3H4zm5 0h3v3H9z" fill="#523b12"/><path d="M3 17h4v1H3zm6 0h4v1H9z" fill="#322008"/>${svgClose}`;

    default:
      return `${svgOpen}<rect width="16" height="18" fill="#e23b3b"/>${svgClose}`;
  }
}

export function renderPawnSprite(teamId = 0, statusFlags = {}, { extraClass = '', isMoving = false, scale = 1.0, pose = 'idle', direction = 'front', frame = 0 } = {}) {
  const tid = ((Number(teamId) || 0) % 10 + 10) % 10;
  const arch = PAWN_ARCHETYPES[tid] || PAWN_ARCHETYPES[0];
  const signature=PAWN_SIGNATURES[tid]||PAWN_SIGNATURES[0];
  const { isMe = false, isLeader = false, isJailed = false, isShielded = false, isHopping = false } = statusFlags;
  const safePose=PAWN_POSES.includes(pose)?pose:'idle';
  const safeDirection=['front','back','left','right'].includes(direction)?direction:'front';
  const safeFrame=Math.abs(Math.floor(Number(frame)||0))%2;

  const fgColor = arch.lightFg ? '#14110f' : '#ffffff';
  const delay = ((tid * 0.16) % 1.2).toFixed(2);

  const crownHTML = isLeader ? `
    <div class="pawn-accessory pawn-crown" aria-hidden="true" title="目前榜首王者">
      <svg class="pixel-crown-svg" viewBox="0 0 16 10" width="16" height="10" shape-rendering="crispEdges">
        <path d="M1 9h14v1H1z" fill="#b8860b"/>
        <path d="M2 3h2v6H2zm5 1h2v5H7zm5-1h2v6h-2z" fill="#ffd700"/>
        <path d="M0 2h3v1H0zm6 1h4v1H6zm8-1h3v1h-3z" fill="#fff799"/>
        <circle cx="8" cy="6.5" r="1.2" fill="#e23b3b"/>
      </svg>
      <i class="crown-sparkle"></i>
    </div>` : '';

  const jailHTML = isJailed ? `
    <div class="pawn-accessory pawn-jail-overlay" aria-hidden="true" title="監獄服刑中">
      <svg class="pixel-jail-svg" viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges">
        <path d="M2 1h16v2H2zm0 16h16v2H2z" fill="#3a3a3a"/>
        <path d="M4 3h2v14H4zm5 0h2v14H9zm5 0h2v14h-2z" fill="#6a6a6a"/>
        <path d="M5 3h1v14H5zm5 0h1v14h-1zm5 0h1v14h-1z" fill="#b0b0b0"/>
        <path d="M7 10h6v5H7z" fill="#e23b3b"/>
        <circle cx="10" cy="12.5" r="1" fill="#ffffff"/>
      </svg>
    </div>` : '';

  const shieldHTML = isShielded ? `
    <div class="pawn-accessory pawn-shield-orbit" aria-hidden="true" title="防災護盾生效中">
      <div class="shield-ring"></div>
      <div class="shield-orb">🛡️</div>
    </div>` : '';

  const classes = [
    'pixel-pawn-wrapper',
    `team-${tid}`,
    isMe ? 'is-me' : '',
    isLeader ? 'is-leader' : '',
    isJailed ? 'is-jailed' : '',
    isShielded ? 'is-shielded' : '',
    isMoving ? 'is-moving' : '',
    isHopping ? 'pawn-hopping' : '',
    `pawn-facing-${safeDirection}`,
    `pawn-pose-${safePose}`,
    `pawn-frame-${safeFrame}`,
    `pawn-signature-${signature.key}`,
    extraClass
  ].filter(Boolean).join(' ');

  return `<div class="${classes}" data-team="${tid}" data-direction="${safeDirection}" data-pose="${safePose}" style="--team-color:${arch.color};--team-dark:${arch.dark};--pawn-delay:${delay}s;--pawn-scale:${scale}">
    <div class="pawn-shadow"></div>
    <div class="pawn-body-container">
      ${crownHTML}
      <div class="pawn-badge" style="background:${arch.color};color:${fgColor};">
        <span>${tid + 1}</span>
      </div>
      <div class="pawn-sprite-pixel" title="${arch.roleTitle} (${arch.name})">
        ${pawnSpriteSVG(tid, { width: 24, height: 27, pose:safePose, direction:safeDirection, frame:safeFrame })}
      </div>
      <div class="pawn-motion-pixels" aria-hidden="true"><span></span><span></span></div>
      ${jailHTML}
      ${shieldHTML}
    </div>
    <div class="pawn-dust" aria-hidden="true">${Array.from({length:6},(_,i)=>`<span style="left:${i * 18}%;--dust-delay:${(i * .025).toFixed(3)}s"></span>`).join('')}</div>
  </div>`;
}

export function renderTileGarrison(teamsOnTile = [], { meId = null, activeTeamId = null, leaderId = null, tilePos = null } = {}) {
  if (!Array.isArray(teamsOnTile) || !teamsOnTile.length) return '';

  const count = teamsOnTile.length;
  const hasMe = meId !== null && meId !== undefined && meId !== '';
  const hasActive = activeTeamId !== null && activeTeamId !== undefined && activeTeamId !== '';
  const hasLeader = leaderId !== null && leaderId !== undefined && leaderId !== '';

  // Mode A: Single Team Hero
  if (count === 1) {
    const t = teamsOnTile[0];
    const isJailed = Number(t.jail || 0) > 0 || tilePos === 42;
    const isShielded = Number(t.buffs?.shield || 0) > 0;
    const isLeader = hasLeader && Number(leaderId) === Number(t.id);
    const isMe = hasMe && Number(meId) === Number(t.id);

    return `<div class="tile-garrison garrison-single" data-count="1">
      ${renderPawnSprite(t.id, { isMe, isLeader, isJailed, isShielded }, { extraClass: 'hero-pawn' })}
    </div>`;
  }

  // Mode B: 2~3 Teams (Stair-step 2.5D staggered layer)
  if (count <= 3) {
    // Sort so that viewer's team or active team is at the front
    const sorted = [...teamsOnTile].sort((a, b) => {
      if (hasMe && Number(a.id) === Number(meId)) return 1;
      if (hasMe && Number(b.id) === Number(meId)) return -1;
      if (hasActive && Number(a.id) === Number(activeTeamId)) return 1;
      if (hasActive && Number(b.id) === Number(activeTeamId)) return -1;
      return 0;
    });

    const pawnsHTML = sorted.map((t, idx) => {
      const isJailed = Number(t.jail || 0) > 0 || tilePos === 42;
      const isShielded = Number(t.buffs?.shield || 0) > 0;
      const isLeader = hasLeader && Number(leaderId) === Number(t.id);
      const isMe = hasMe && Number(meId) === Number(t.id);
      const stairClass = `stair-step-${idx + 1}-of-${count}`;

      return renderPawnSprite(t.id, { isMe, isLeader, isJailed, isShielded }, { extraClass: stairClass });
    }).join('');

    return `<div class="tile-garrison garrison-stair garrison-${count}" data-count="${count}">
      ${pawnsHTML}
    </div>`;
  }

  // Mode C: 4+ Teams (Cluster Aggregation)
  // Find primary representative pawn
  let primaryTeam = (hasMe ? teamsOnTile.find(t => Number(t.id) === Number(meId)) : null)
    || (hasActive ? teamsOnTile.find(t => Number(t.id) === Number(activeTeamId)) : null)
    || (hasLeader ? teamsOnTile.find(t => Number(t.id) === Number(leaderId)) : null)
    || teamsOnTile[0];

  const others = teamsOnTile.filter(t => t.id !== primaryTeam.id);
  const isJailed = Number(primaryTeam.jail || 0) > 0 || tilePos === 42;
  const isShielded = Number(primaryTeam.buffs?.shield || 0) > 0;
  const isLeader = hasLeader && Number(leaderId) === Number(primaryTeam.id);
  const isMe = hasMe && Number(meId) === Number(primaryTeam.id);

  const dotsHTML = others.slice(0, 5).map(o => {
    const col = o.color || PAWN_ARCHETYPES[o.id % 10]?.color || '#ffd700';
    return `<span class="cluster-dot" style="background:${col};" title="第 ${o.id + 1} 組"></span>`;
  }).join('');

  return `<div class="tile-garrison garrison-cluster" data-count="${count}">
    ${renderPawnSprite(primaryTeam.id, { isMe, isLeader, isJailed, isShielded }, { extraClass: 'cluster-lead' })}
    <div class="pawn-cluster-pill" title="此格共有 ${count} 隊停留">
      <span class="cluster-count">+${count - 1}</span>
      <div class="cluster-dots">${dotsHTML}</div>
    </div>
  </div>`;
}
