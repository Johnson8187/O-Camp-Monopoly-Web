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
  if(['phase','assignment','event'].includes(task.type))return true;
  if(['upgrade','sell','purchase'].includes(task.type))return Number(task.team?.id)===mine;
  if(task.type==='roll')return Number(task.teamId)===mine;
  if(['teamMoment','rank','teamTurn'].includes(task.type))return Number(task.team?.id??task.teamId)===mine;
  if(task.type==='attack'){
    const attack=task.attack||{},myPos=state?.teams?.[mine]?.pos;
    if(Number(attack.team)===mine||Number(attack.targetTeam)===mine)return true;
    return myPos!==undefined&&Array.isArray(attack.hit)&&attack.hit.includes(myPos);
  }
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
