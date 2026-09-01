const G = (function(){
/* ===== 人生大富翁 — 遊戲核心邏輯（可獨立測試） ===== */

const TRACK = [
  ["black",5,0],["safe",6,0],["base",7,0],["tax",7,1],
  ["stage",8,1],["chance",8,2],["base",9,2],["casino",9,3],
  ["safe",10,3],["fate",10,4],["base",10,5],["stage",10,6],
  ["worm",10,7],["exch",10,8],["tax",9,8],["base",9,9],
  ["safe",8,9],["base",7,9],["chance",7,8],["casino",6,8],
  ["bank",6,7],["base",5,7],["black",4,7],["safe",4,8],
  ["stage",4,9],["safe",3,9],["casino",2,9],["safe",1,9],
  ["base",0,9],["tax",0,8],["fate",0,7],["start",0,6],
  ["chance",0,5],["exch",1,5],["stage",2,5],["base",2,4],
  ["fate",3,4],["worm",4,4],["base",5,4],["chance",6,4],
  ["stage",6,3],["base",6,2],["jail",5,2],["fate",5,1],
];
const N = TRACK.length;
const START_IDX = TRACK.findIndex(t => t[0] === "start");
const BASE_IDX = TRACK.map((t,i)=>t[0]==="base"?i:-1).filter(i=>i>=0);
const STAGE_IDX = TRACK.map((t,i)=>t[0]==="stage"?i:-1).filter(i=>i>=0);
const WORM_IDX = TRACK.map((t,i)=>t[0]==="worm"?i:-1).filter(i=>i>=0);

const TILE = {
  base:{n:"基地",bg:"#3fbf5a",fg:"#0f3d18"}, fate:{n:"命運",bg:"#9450d8",fg:"#ffffff"}, chance:{n:"機會",bg:"#f2c12e",fg:"#5a3d05"},
  tax:{n:"稅收",bg:"#3f86e0",fg:"#0b2c55"},  black:{n:"黑市",bg:"#6d72b0",fg:"#141033"},
  casino:{n:"賭場",bg:"#9450d8",fg:"#ffffff"},stage:{n:"關卡",bg:"#ffffff",fg:"#1f7a2e"},
  worm:{n:"蟲洞",bg:"#2a0a0a",fg:"#f0908a"}, exch:{n:"情報局",bg:"#57a3a3",fg:"#0d2e2e"},
  jail:{n:"監獄",bg:"#5f5f5f",fg:"#ffffff"}, bank:{n:"銀行",bg:"#2bb0b0",fg:"#0a3838"},
  start:{n:"起點",bg:"#141414",fg:"#ffe14d"},safe:{n:"安全",bg:"#e4d8ad",fg:"#5a4d1f"},
};

const TEAM_COLORS = ["#e23b3b","#3f86e0","#3fbf5a","#f2c12e","#9450d8",
                     "#e6832a","#17a2a2","#d13f8c","#6b7fd0","#8a6a2a"];
const LIGHT_FG = [3];

const DEFAULTS = {
  economyVersion:2,
  startCash:2000, lapBonus:300, taxAmount:200,
  casinoCost:150, casinoPayouts:[0,150,300,600],
  blackDiscount:50, bankShare:25, round1Fraction:3,
  levels:[{name:"空地",stay:0,up:0,sell:200,tax:50},
          {name:"商店",stay:300,up:20,sell:500,tax:100},
          {name:"賭場",stay:800,up:35,sell:1000,tax:200}],
  passRatio:20,
  market:{bubble:250,hot:150,flat:100,slump:70,crash:40},
  marketOrder:["bubble","hot","flat","slump","crash"],
  marketNames:{bubble:"泡沫",hot:"熱絡",flat:"平穩",slump:"低迷",crash:"崩盤"},
  attacks:{
    quake:{name:"地震",cost:25,repair:350},
    missile:{name:"飛彈",cost:22,repair:450},
    typhoon:{name:"颱風",cost:22,repair:300,eyeBonus:0},
    wildfire:{name:"野火",cost:18,repair:250},
  },
  gambles:[{name:"紅包",cost:5},{name:"戳戳樂",cost:10},
           {name:"樂透",cost:15},{name:"全押",cost:25}],
  buffs:{pass:{name:"通行證",cost:12},reroll:{name:"重骰卡",cost:10},shield:{name:"防災卡",cost:15}},
  stages:[
    {key:"night",name:"夜教",cash:500,pts:0,icon:"🌙",story:"在夜教時反殺警長成功，成功解救所有警察同胞，獲得蔡英文頒獎。"},
    {key:"land",name:"陸大",cash:-600,pts:0,icon:"🌾",story:"吹麵粉吹到關主頭上，關主很開心給你一拳。"},
    {key:"water",name:"水大",cash:1000,pts:0,icon:"💧",story:"在水球大戰中佔據優良地理位置，在水桶底部發現獎金。"},
    {key:"rpg",name:"RPG",cash:0,pts:10,icon:"⚔️",story:"獲得所有物資穿越回現代，並成為校園中的男神／女神。"},
    {key:"bbq",name:"烤肉",cash:2000,pts:0,icon:"🍖",story:"因為烤的肉太美味，獲得隔壁奶奶的挖角費。"},
  ],
  battlesPerTeam:2, battleLossMultiplier:150, inflateThreshold:5, diceSides:6, diceCount:1,
};

const CARD_REWARD_LEVELS = Object.freeze({
  1:{success:400,failure:150},2:{success:600,failure:200},
  3:{success:800,failure:250},4:{success:1000,failure:300},
});
const card=(id,name,task,difficulty)=>Object.freeze({id,name,task,difficulty,...CARD_REWARD_LEVELS[difficulty]});

const FATE_CARDS = Object.freeze([
  card(1,"伏地挺身","4 人接力完成 20 下伏地挺身。",2),
  card(2,"原地旋轉","1 人蒙眼原地轉 5 圈，全隊只能用拍手聲引導回到指定位置。",3),
  card(3,"深蹲挑戰","全隊依序深蹲、定格，再以單腳跳完成指定動作。",4),
  card(4,"含水憋笑","兩兩含水對視 15 秒，過程中不能笑場。",1),
  card(5,"單腳平衡","全隊單腳站立，依右、上、左、下同步拍手兩組。",2),
  card(6,"圖形大挑戰","6 人合作排出指定圖形並完成拍照。",1),
  card(7,"肢體傳聲筒","全隊用手指在背上傳遞三位數字，最後一人說出答案。",3),
  card(8,"棒式撐體","4 人同時棒式撐體 20 秒。",2),
  card(9,"假想運動會","5 人分別模仿不同球類運動，讓觀眾猜出全部項目。",3),
  card(10,"極限靜止","7 人完成指定姿勢並維持 15 秒，不能移動或笑場。",2),
  card(11,"開合跳唱歌","8 人邊做開合跳，邊接力唱完中英文生日快樂歌。",3),
  card(12,"圖形大挑戰Ⅱ","全隊分組排出指定英文字母與雙人動作。",2),
  card(13,"指定範圍原地踏步","全隊閉眼原地踏步 20 秒，結束時仍需留在指定圓圈內。",3),
  card(14,"背對背","兩兩背對背坐下並站起，連續完成 3 次。",2),
  card(15,"比手畫腳","1 人猜題，其餘隊員不出聲、同時用動作提示同一個詞。",1),
  card(16,"人體波浪舞","全隊合作完成兩輪連續人體波浪。",1),
  card(17,"憋氣訓練","全隊捏鼻憋氣 15 秒，再完成 5 次蹲下起立。",2),
  card(18,"限時抬腿","5 人在 15 秒內各完成 20 下原地抬腿。",2),
  card(19,"老師說","全隊進行 5 題老師說，至少 3 題全員零失誤。",3),
  card(20,"反應力測試","全隊依口令做出相反的大小西瓜動作，所有人都要成功。",4),
]);

const CHANCE_CARDS = Object.freeze([
  card(1,"金雞獨立","全隊單腳站立並維持指定姿勢 20 秒。",3),
  card(2,"全體大合唱","20 秒內選歌，全隊同步唱完副歌 5 句。",2),
  card(3,"盲眼大風吹","全隊閉眼轉 3 圈，不能說話，在 30 秒內牽手圍成一圈。",4),
  card(4,"心有靈犀一條線","聽到題目後同時做動作，至少 5 人做出相同動作。",1),
  card(5,"你學我猜","以動物走路動作接力傳遞，最後一人猜出動物。",2),
  card(6,"模仿大挑戰","1 人模仿 3 種動物叫聲，其餘隊員全部猜中。",1),
  card(7,"人體打字機","全隊接力說出「一起賭一把」並接續指定動作，不能中斷。",2),
  card(8,"全員暈眩大作戰","全隊原地轉 5 圈後用屁股寫名字，過程中不能跌倒。",3),
  card(9,"記憶大考驗","全隊進行超市記憶接龍，依序完整複誦並新增品項。",4),
  card(10,"急速列車出發","全隊依快速節奏輪流回答同一主題，不能停頓或重複。",3),
  card(11,"快問快答","由不同隊員連續回答 5 題宿營題目，過程中不能結巴。",3),
  card(12,"全員倒著說","全隊在 10 秒內把指定 3～4 字詞語倒著說出來。",3),
  card(13,"小隊無聲密碼","以眨眼傳遞兩位數密碼，最後一人用拍手還原，限時 2 分鐘。",4),
  card(14,"小隊密碼解鎖","隊員同時比出 1～5 根手指，指定者在 30 秒內算出總和。",1),
  card(15,"倫敦鐵橋垮下來","兩兩搭橋，隊尾單腳跳穿越並重組，依實體卡限時完成一輪。",4),
  card(16,"水果大聲公挑戰","每人用生氣語氣大喊一種水果，全隊不能笑場。",2),
  card(17,"大家好","全隊依節奏完成累加姓名口號，過程中不能中斷或喊錯。",3),
  card(18,"全員同心節奏跳","全隊閉眼聽同一節奏同步起跳，5 次機會內成功。",3),
  card(19,"小隊疊羅漢口令挑戰","依序報數，遇到 3 的倍數或含 3 的數字改拍手，全隊完成一輪。",3),
  card(20,"假想全員密室逃脫","全隊在 10 秒內同步演出破解機關、開門與逃脫動作。",2),
]);
const CARD_DECKS = Object.freeze({fate:FATE_CARDS,chance:CHANCE_CARDS});

/* ---------- 工具 ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const money = n => "$" + Number(n).toLocaleString();
function cardById(kind,id){return CARD_DECKS[kind]?.find(item=>Number(item.id)===Number(id))||null;}
function previewCards(s,kind,count=3){
  const deck=CARD_DECKS[kind]||[],cursor=Math.max(0,Number(s?.cardCursors?.[kind])||0);
  return Array.from({length:Math.min(Math.max(0,Number(count)||0),deck.length)},(_,offset)=>deck[(cursor+offset)%deck.length]);
}
function drawCard(s,kind){
  const deck=CARD_DECKS[kind]||[];if(!deck.length)return null;
  s.cardCursors={fate:0,chance:0,...(s.cardCursors||{})};
  const cursor=Math.max(0,Number(s.cardCursors[kind])||0),picked=deck[cursor%deck.length];
  s.cardCursors[kind]=(cursor+1)%deck.length;
  return picked;
}

// A transaction is recorded only while the Worker opens an action ledger.
// Core rules remain independently testable when no ledger is active.
function recordTransaction(s, transaction) {
  if (!Array.isArray(s?._transactions)) return;
  const entries=(transaction?.entries||[]).map(entry=>({
    teamId:Number(entry.teamId),cashDelta:Number(entry.cashDelta)||0,ptsDelta:Number(entry.ptsDelta)||0,
    reason:String(entry.reason||transaction.reason||"資源異動"),counterpartyTeamId:entry.counterpartyTeamId!==null&&entry.counterpartyTeamId!==undefined&&Number.isInteger(Number(entry.counterpartyTeamId))?Number(entry.counterpartyTeamId):null,
  })).filter(entry=>Number.isInteger(entry.teamId)&&(entry.cashDelta||entry.ptsDelta));
  const bankDelta=Number(transaction?.bankDelta)||0;
  if(!entries.length&&!bankDelta)return;
  s._transactions.push({
    category:String(transaction.category||"other"),entries,bankDelta,
    tileIndex:transaction.tileIndex!==null&&transaction.tileIndex!==undefined&&Number.isInteger(Number(transaction.tileIndex))?Number(transaction.tileIndex):null,
    attackKind:transaction.attackKind?String(transaction.attackKind):null,
  });
}

function creditCash(s,teamId,amount,reason,details={}){
  const value=Math.max(0,Number(amount)||0),team=s.teams?.[teamId];if(!team||!value)return 0;
  team.cash+=value;
  recordTransaction(s,{...details,entries:[{teamId,cashDelta:value,reason,counterpartyTeamId:details.counterpartyTeamId}]});
  return value;
}

function creditFromBank(s,teamId,amount,reason,details={}){
  const value=Math.max(0,Math.min(Number(s.bank)||0,Number(amount)||0)),team=s.teams?.[teamId];if(!team||!value)return 0;
  s.bank-=value;team.cash+=value;
  recordTransaction(s,{...details,bankDelta:-value,entries:[{teamId,cashDelta:value,reason}]});
  return value;
}

function changePoints(s,teamId,amount,reason,details={}){
  const team=s.teams?.[teamId];if(!team)return 0;
  const before=Number(team.pts)||0;team.pts=Math.max(0,before+(Number(amount)||0));const delta=team.pts-before;
  if(delta)recordTransaction(s,{...details,entries:[{teamId,ptsDelta:delta,reason}]});
  return delta;
}

function freshState(code, teamCount, names) {
  return {
    rev:1, code, phase:"setup", round:1,
    teams: Array.from({length:teamCount}, (_,i) => ({
      id:i, name:(names && names[i]) || `第 ${i+1} 組`, color:TEAM_COLORS[i%TEAM_COLORS.length],
      cash:DEFAULTS.startCash, pts:0, pos:START_IDX, baseIdx:null, level:1,
      jail:0, jailedThisTurn:false, battles:DEFAULTS.battlesPerTeam, sold:false, soldRound:0,
      buffs:{pass:0,reroll:0,shield:0}, items:{}, attackRounds:{}, discount:false, rolled:false, lastRoll:null, lastDice:null, joined:false, cardIntel:null,
    })),
    bank:0, market:"flat", disasters:0, unlocked:[], attackUsage:{}, log:[], publicFeed:[], ceremonyStep:0,
    stageNotices:[], stageNoticeSeq:0,
    settings: clone(DEFAULTS), lastRoll:null, activeTeamId:null, pendingBattle:null, pendingCard:null, lastCardResult:null, cardCursors:{fate:0,chance:0}, cardSeq:0, rollDiceCounts:{},
    receipts:[], receiptSeq:0, lastPurchase:null, viewers:[],
  };
}

// 過夜費：停在別人基地要付（受房市倍率影響，第 1 回合依比例打折）
function stayFee(s, team) {
  let fee = s.settings.levels[team.level-1].stay;
  const marketRate = (s.settings.market[s.market] ?? 100) / 100;
  fee = Math.round(fee * marketRate);
  if (s.round === 1) fee = Math.round(fee / Math.max(1, s.settings.round1Fraction));
  return fee;
}
// 通行費：僅經過，為過夜費的一定比例（同樣受房市倍率影響）
function passFee(s, team) {
  return Math.round(stayFee(s, team) * s.settings.passRatio / 100);
}
// 房屋稅：每輪持有基地需繳納給銀行的稅金（受房市倍率影響）
function propertyTax(s, team) {
  if (team.sold || team.baseIdx === null) return 0;
  const lv = s.settings.levels[team.level-1];
  const baseTax = lv?.tax ?? 0;
  const marketRate = (s.settings.market[s.market] ?? 100) / 100;
  return Math.round(baseTax * marketRate);
}
function collectPropertyTaxes(s) {
  let totalTax = 0;
  const paidTeams = [];
  s.teams.forEach(t => {
    if (t.sold || t.baseIdx === null) return;
    const tax = propertyTax(s, t);
    if (tax > 0) {
      const paid = pay(s, t.id, "bank", tax,{category:"property_tax",fromReason:`第 ${s.round} 回合房屋稅`,tileIndex:t.baseIdx});
      if (paid > 0) {
        totalTax += paid;
        paidTeams.push(`${t.name} −${money(paid)}`);
      }
    }
  });
  if (paidTeams.length > 0) {
    s.log.unshift(`各隊繳納第 ${s.round} 回合房屋稅共 +${money(totalTax)} 入銀行庫房（${paidTeams.join("、")}）`);
  }
  return totalTax;
}
function sellValue(s, team) {
  const lv = s.settings.levels[team.level-1];
  return Math.round(lv.sell * (s.settings.market[s.market]/100));
}
function propertyValue(s, t) {
  return (t.sold || t.baseIdx === null) ? 0 : sellValue(s, t);
}
function netWorth(s, t) {
  return t.cash + propertyValue(s, t);
}
function ownerOf(s, idx) {
  return s.teams.find(t => t.baseIdx === idx && !t.sold) || null;
}
function pay(s, from, to, amt, details={}) {
  if (amt <= 0) return 0;
  const debtor = s.teams[from];
  if (!debtor) return 0;
  const actualAmt = Math.max(0, Math.min(debtor.cash, amt));
  debtor.cash -= actualAmt;
  if (to === "bank") {
    s.bank += actualAmt;
  } else if (to !== null && s.teams[to]) {
    s.teams[to].cash += actualAmt;
  }
  if(actualAmt){
    const entries=[{teamId:from,cashDelta:-actualAmt,reason:details.fromReason||details.reason||"支付款項",counterpartyTeamId:Number.isInteger(Number(to))?Number(to):null}];
    if(Number.isInteger(Number(to))&&s.teams[to])entries.push({teamId:Number(to),cashDelta:actualAmt,reason:details.toReason||details.reason||"收到款項",counterpartyTeamId:from});
    recordTransaction(s,{...details,entries,bankDelta:to==="bank"?actualAmt:0});
  }
  return actualAmt;
}

/* ---------- 抽籤 ---------- */
function assignBases(s, rnd = Math.random) {
  const pool = [...BASE_IDX];
  for (let i = pool.length-1; i > 0; i--) {
    const j = Math.floor(rnd()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  s.teams.forEach((t,i) => { t.baseIdx = pool[i % pool.length]; t.level = 1; });
  s.log.unshift("抽籤完成，各隊領地已分配");
  return s;
}

/* ---------- 移動 ---------- */
function applyMove(s, ti, steps, rnd = Math.random, diceValues = null) {
  const t = s.teams[ti];
  const notes = [];
  if (t.jail > 0 || t.jailedThisTurn) {
    if (t.jail > 0) t.jail -= 1;
    t.rolled = true;
    t.lastRoll = 0;
    t.lastDice = [];
    t.jailedThisTurn = false;
    s.lastRoll = {seq:(s.lastRoll?.seq || 0)+1, team:ti, n:0, dice:[], from:t.pos, landPos:t.pos, targetPos:t.pos, note:"在監獄服刑，本回合暫停擲骰"};
    s.log.unshift(`${t.name} 在監獄服刑，暫停本回合行動`);
    return s;
  }
  const from = t.pos;

  // 經過的格子（不含終點）
  for (let k = 1; k < steps; k++) {
    const p = (from + k) % N;
    if (p === START_IDX) { creditCash(s,ti,s.settings.lapBonus,"經過起點獎勵",{category:"lap_bonus",tileIndex:p}); notes.push(`經過起點 +${money(s.settings.lapBonus)}`); }
    const own = ownerOf(s, p);
    if (own && own.id !== ti) {
      const amt = passFee(s, own);
      if (amt > 0) {
        if (t.buffs.pass > 0) {
          t.buffs.pass -= 1;
          notes.push(`通行證抵銷通行費 ${money(amt)}（剩餘 ${t.buffs.pass} 張）`);
        } else {
          const paid=pay(s, ti, own.id, amt,{category:"pass_fee",tileIndex:p,fromReason:`支付 ${own.name} 通行費`,toReason:`${t.name} 經過本隊基地，收到通行費`});
          notes.push(`通行費 ${money(paid)} → ${own.name}${paid<amt?'（現金不足）':''}`);
        }
      }
    }
  }
  // 終點
  const dest = (from + steps) % N;
  if (dest === START_IDX && steps > 0) { creditCash(s,ti,s.settings.lapBonus,"停在起點獎勵",{category:"lap_bonus",tileIndex:dest}); notes.push(`停在起點 +${money(s.settings.lapBonus)}`); }
  t.pos = dest;

  landEffect(s, ti, notes, rnd);

  t.rolled = true;
  t.lastRoll = steps;
  t.lastDice = Array.isArray(diceValues) ? [...diceValues] : [steps];
  s.lastRoll = {seq:(s.lastRoll?.seq || 0)+1, team:ti, n:steps, dice:[...t.lastDice], from, landPos:dest, targetPos:t.pos, note:notes.join("；") || "平安無事"};

  s.log.unshift(`${t.name} 骰出 ${steps} → ${TILE[TRACK[t.pos][0]].n}${notes.length ? "：" + notes.join("；") : ""}`);
  return s;
}

function landEffect(s, ti, notes = [], rnd = Math.random) {
  const t = s.teams[ti];
  const S = s.settings;
  const kind = TRACK[t.pos][0];

  if (kind === "base") {
    const own = ownerOf(s, t.pos);
    if (own && own.id !== ti) {
      const amt = stayFee(s, own);
      if (amt > 0) {
        if (t.buffs.pass > 0) {
          t.buffs.pass -= 1;
          notes.push(`通行證抵銷過夜費 ${money(amt)}（剩餘 ${t.buffs.pass} 張）`);
        } else {
          s.pendingBattle={attackerId:ti,defenderId:own.id,amount:amt,tileIndex:t.pos,round:s.round,status:"awaiting_choice"};
          notes.push(`抵達 ${own.name} 基地：等待選擇付款或 BATTLE（${money(amt)}）`);
        }
      }
    } else if (own) notes.push("回到自己的基地");
    else notes.push("無主空地");

  } else if (kind === "tax") {
    const paid=pay(s, ti, "bank", S.taxAmount,{category:"tax",tileIndex:t.pos,fromReason:"停在稅收格繳納稅金"}); notes.push(`稅收 −${money(paid)}${paid<S.taxAmount?'（現金不足）':''}`);

  } else if (kind === "fate" || kind === "chance") {
    const drawn=drawCard(s,kind),label=kind==="fate"?"命運":"機會";
    if(drawn){
      s.pendingBattle={kind:"card",attackerId:ti,defenderId:null,cardType:kind,cardId:drawn.id,tileIndex:t.pos,round:s.round,status:"awaiting_choice"};
      notes.push(`${label}格：抽到「${drawn.name}」，請選擇接受挑戰或發動 BATTLE`);
    }else notes.push(`${label}格：牌堆目前沒有可用卡片`);

  } else if (kind === "black") {
    t.discount = true; notes.push(`黑市：下次商店消費打 ${S.blackDiscount/10} 折`);

  } else if (kind === "casino") {
    // 賭資先進銀行池，獎金再從池中支付；池子不足則只能領到池中餘額
    const cost = Math.max(0, Math.min(t.cash, S.casinoCost));
    pay(s,ti,"bank",cost,{category:"casino_bet",tileIndex:t.pos,fromReason:"賭場下注"});
    const draw = S.casinoPayouts[Math.floor(rnd()*S.casinoPayouts.length)];
    const win = Math.min(draw, s.bank);
    creditFromBank(s,ti,win,"賭場獎金",{category:"casino_prize",tileIndex:t.pos});
    notes.push(`賭場：押 ${money(cost)}，${win ? `拿回 ${money(win)}` : "全數落空"}${win < draw ? "（銀行餘額不足）" : ""}`);

  } else if (kind === "bank") {
    const take = Math.max(0, Math.round(s.bank * S.bankShare/100));
    creditFromBank(s,ti,take,`銀行密道取得庫房 ${S.bankShare}%`,{category:"bank_tunnel",tileIndex:t.pos});
    notes.push(`銀行密道：幹走 ${money(take)}`);

  } else if (kind === "worm") {
    const other = WORM_IDX.find(i => i !== t.pos);
    if (other !== undefined) {
      if ((t.pos < START_IDX && other >= START_IDX) || (t.pos > other && (START_IDX > t.pos || START_IDX <= other))) {
        creditCash(s,ti,S.lapBonus,"蟲洞躍遷經過起點獎勵",{category:"lap_bonus",tileIndex:START_IDX});
        notes.push(`蟲洞躍遷經過起點 +${money(S.lapBonus)}`);
      }
      t.pos = other;
      notes.push("蟲洞傳送");
    } else {
      notes.push("蟲洞共振中（無其他對應蟲洞）");
    }

  } else if (kind === "jail") {
    t.jail = 1; notes.push("滾進監獄，下回合停留");

  } else if (kind === "exch") {
    t.cardIntel={round:s.round,revealedAtCursor:{...s.cardCursors},fate:previewCards(s,"fate",3).map(item=>item.id),chance:previewCards(s,"chance",3).map(item=>item.id)};
    notes.push("情報局：已取得機會與命運牌堆各自接下來三張的情報");

  } else if (kind === "stage") {
    const stageIndex=STAGE_IDX.indexOf(t.pos),stage=S.stages?.[stageIndex];
    if(!s.unlocked.includes(t.pos)||!stage){notes.push("關卡尚未解封");}
    else{
      const effects=[];
      if(Number(stage.cash)>0){creditCash(s,ti,Number(stage.cash),`完成「${stage.name}」獲得獎勵`,{category:"stage_reward",tileIndex:t.pos});effects.push(`現金 +${money(stage.cash)}`);}
      else if(Number(stage.cash)<0){const paid=pay(s,ti,"bank",Math.abs(Number(stage.cash)),{category:"stage_penalty",tileIndex:t.pos,fromReason:`完成「${stage.name}」支付款項`});effects.push(`現金 −${money(paid)}`);}
      if(Number(stage.pts)){const delta=changePoints(s,ti,Number(stage.pts),`完成「${stage.name}」點數變動`,{category:"stage_points",tileIndex:t.pos});effects.push(`諂媚點 ${delta>=0?"+":""}${delta}`);}
      notes.push(`${stage.name}：${effects.join("、")||"完成關卡"}`);
    }
  }
  return notes;
}

function queuePendingCard(s,pending,executorId,battleOutcome=null){
  s.cardSeq=Number(s.cardSeq||0)+1;
  s.pendingCard={seq:s.cardSeq,cardType:pending.cardType,cardId:pending.cardId,originalTeamId:pending.attackerId,executorId:Number(executorId),tileIndex:pending.tileIndex,round:pending.round,status:"awaiting_result",battleOutcome};
  return s.pendingCard;
}

function resolvePendingBattle(s, ti, choice, options={}) {
  const pending=s.pendingBattle;
  if(!pending||pending.attackerId!==ti)return {ok:false,msg:"目前沒有待處理的停留事件"};
  const attacker=s.teams[pending.attackerId],isCard=pending.kind==="card";
  if(!attacker){s.pendingBattle=null;return {ok:false,msg:"BATTLE 隊伍資料不存在"};}
  if(isCard){
    const drawn=cardById(pending.cardType,pending.cardId),label=pending.cardType==="fate"?"命運":"機會";
    if(!drawn){s.pendingBattle=null;return {ok:false,msg:"卡片資料不存在"};}
    if(choice==="accept"||choice==="pay"){
      queuePendingCard(s,pending,attacker.id);s.pendingBattle=null;
      s.log.unshift(`${attacker.name} 接受${label}卡「${drawn.name}」挑戰，等待主持人判定結果`);
      return {ok:true};
    }
    if(choice==="battle"){
      if(attacker.battles<=0)return {ok:false,msg:"BATTLE 次數已用完"};
      const targetId=Number(options?.targetTeamId),defender=s.teams[targetId];
      if(!Number.isInteger(targetId)||!defender||targetId===attacker.id)return {ok:false,msg:"請選擇另一隊作為卡片 BATTLE 對手"};
      attacker.battles-=1;pending.defenderId=targetId;pending.status="awaiting_host";
      s.log.unshift(`${attacker.name} 發動${label}卡 BATTLE 挑戰 ${defender.name}，等待主持人裁決`);
      return {ok:true};
    }
    return {ok:false,msg:"請選擇接受卡片挑戰或發動 BATTLE"};
  }
  const defender=s.teams[pending.defenderId];
  if(!defender){s.pendingBattle=null;return {ok:false,msg:"BATTLE 隊伍資料不存在"};}
  if(choice==="pay"){
    const paid=pay(s,attacker.id,defender.id,pending.amount,{category:"stay_fee",tileIndex:pending.tileIndex,fromReason:`支付 ${defender.name} 過夜費`,toReason:`${attacker.name} 支付本隊過夜費`});
    s.pendingBattle=null;
    s.log.unshift(`${attacker.name} 選擇直接支付過夜費 ${money(paid)} → ${defender.name}`);
    return {ok:true,paid};
  }
  if(choice==="battle"){
    if(attacker.battles<=0)return {ok:false,msg:"BATTLE 次數已用完"};
    attacker.battles-=1;pending.status="awaiting_host";
    s.log.unshift(`${attacker.name} 發動 BATTLE 挑戰 ${defender.name}，等待主持人裁決`);
    return {ok:true};
  }
  return {ok:false,msg:"請選擇直接付款或發動 BATTLE"};
}

function adjudicateBattle(s, outcome) {
  const pending=s.pendingBattle;
  if(!pending||pending.status!=="awaiting_host")return {ok:false,msg:"目前沒有等待裁決的 BATTLE"};
  const attacker=s.teams[pending.attackerId],defender=s.teams[pending.defenderId];
  if(!attacker||!defender){s.pendingBattle=null;return {ok:false,msg:"BATTLE 隊伍資料不存在"};}
  const isCard=pending.kind==="card";
  if(isCard){
    const drawn=cardById(pending.cardType,pending.cardId),label=pending.cardType==="fate"?"命運":"機會";
    if(!drawn){s.pendingBattle=null;return {ok:false,msg:"卡片資料不存在"};}
    if(outcome==="attacker"){
      queuePendingCard(s,pending,defender.id,"attacker");s.pendingBattle=null;
      s.log.unshift(`BATTLE 裁決：${attacker.name} 獲勝，${label}卡「${drawn.name}」轉交 ${defender.name} 執行`);
      return {ok:true,executorId:defender.id};
    }
    if(outcome==="defender"){
      queuePendingCard(s,pending,attacker.id,"defender");s.pendingBattle=null;
      s.log.unshift(`BATTLE 裁決：${defender.name} 防守成功，${label}卡「${drawn.name}」仍由 ${attacker.name} 執行`);
      return {ok:true,executorId:attacker.id};
    }
    return {ok:false,msg:"BATTLE 裁決結果錯誤"};
  }
  if(outcome==="attacker"){
    s.pendingBattle=null;
    s.log.unshift(`BATTLE 裁決：${attacker.name} 獲勝，免付 ${money(pending.amount)} 過夜費`);
    return {ok:true,paid:0};
  }
  if(outcome==="defender"){
    const multiplier=Math.max(100,Number(s.settings.battleLossMultiplier)||150),penalty=Math.max(0,Math.round((pending.amount*multiplier/100)/50)*50);
    const paid=pay(s,attacker.id,defender.id,penalty,{category:"battle_fee",tileIndex:pending.tileIndex,fromReason:`BATTLE 落敗，支付 ${defender.name} ${multiplier}% 過夜費`,toReason:`BATTLE 守住基地，收到 ${attacker.name} ${multiplier}% 過夜費`});
    s.pendingBattle=null;
    s.log.unshift(`BATTLE 裁決：${defender.name} 守住基地，${attacker.name} 支付 ${multiplier}% 懲罰 ${money(paid)}`);
    return {ok:true,paid,penalty,multiplier};
  }
  return {ok:false,msg:"BATTLE 裁決結果錯誤"};
}

function resolveCard(s,outcome){
  const pending=s.pendingCard;
  if(!pending||pending.status!=="awaiting_result")return {ok:false,msg:"目前沒有等待結算的機會／命運卡"};
  if(!["success","failure"].includes(outcome))return {ok:false,msg:"卡片結果錯誤"};
  const drawn=cardById(pending.cardType,pending.cardId),team=s.teams[pending.executorId],label=pending.cardType==="fate"?"命運":"機會";
  if(!drawn||!team){s.pendingCard=null;return {ok:false,msg:"卡片或隊伍資料不存在"};}
  const amount=Number(drawn[outcome])||0,resultLabel=outcome==="success"?"成功":"失敗安慰獎";
  creditCash(s,team.id,amount,`${label}卡「${drawn.name}」${resultLabel}`,{category:`${pending.cardType}_card_${outcome}`,tileIndex:pending.tileIndex});
  s.lastCardResult={seq:pending.seq,cardType:pending.cardType,cardId:pending.cardId,teamId:team.id,outcome,amount,round:s.round};
  s.pendingCard=null;
  s.log.unshift(`${team.name} 完成${label}卡「${drawn.name}」：${resultLabel} +${money(amount)}`);
  return {ok:true,teamId:team.id,amount};
}

/* ---------- 商店 ---------- */
function costWithDiscount(s, t, base) {
  return t.discount ? Math.max(1, Math.ceil(base * s.settings.blackDiscount/100)) : base;
}
function buyGamble(s, ti, gi) {
  const t = s.teams[ti];
  if (!t) return {ok:false, msg:"隊伍不存在"};
  const g = s.settings.gambles?.[gi];
  if (!g) return {ok:false, msg:"找不到此抽獎項目"};
  const cost = costWithDiscount(s, t, g.cost);
  if (t.pts < cost) return {ok:false, msg:"諂媚之點不足"};
  changePoints(s,ti,-cost,`購買實體物品「${g.name}」`,{category:"physical_item"}); if (t.discount) t.discount = false;
  const itemKey=`g${gi}`;t.items=t.items||{};t.items[itemKey]=(t.items[itemKey]||0)+1;
  s.lastPurchase={seq:(s.lastPurchase?.seq||0)+1,team:ti,name:g.name,kind:"physical",itemKey,cost,count:t.items[itemKey]};
  s.log.unshift(`${t.name} 買了實體物品「${g.name}」（扣 ${cost} 點，背包共有 ${t.items[itemKey]} 個）`);
  return {ok:true};
}
function buyBuff(s, ti, bk) {
  const t = s.teams[ti];
  if (!t) return {ok:false, msg:"隊伍不存在"};
  const b = s.settings.buffs?.[bk];
  if (!b) return {ok:false, msg:"找不到此道具卡"};
  const cost = costWithDiscount(s, t, b.cost);
  if (t.pts < cost) return {ok:false, msg:"諂媚之點不足"};
  changePoints(s,ti,-cost,`購買增益卡「${b.name}」`,{category:"buff"}); t.buffs[bk] = (t.buffs[bk] || 0) + 1; if (t.discount) t.discount = false;
  s.lastPurchase={seq:(s.lastPurchase?.seq||0)+1,team:ti,name:b.name,kind:bk,cost,count:t.buffs[bk]};
  s.log.unshift(`${t.name} 取得「${b.name}」`);
  return {ok:true};
}
function upgradeBase(s, ti) {
  const t = s.teams[ti];
  if (!t) return {ok:false, msg:"隊伍不存在"};
  if (t.baseIdx === null) return {ok:false, msg:"尚未分配基地"};
  if (t.sold) return {ok:false, msg:"基地已賣出"};
  if (t.level >= s.settings.levels.length) return {ok:false, msg:"已達最高等級"};
  const need = s.settings.levels[t.level].up;
  if (t.pts < need) return {ok:false, msg:"諂媚之點不足"};
  changePoints(s,ti,-need,`基地升級為「${s.settings.levels[t.level].name}」`,{category:"upgrade",tileIndex:t.baseIdx}); t.level += 1;
  s.log.unshift(`${t.name} 基地升級為「${s.settings.levels[t.level-1].name}」`);
  return {ok:true};
}
function sellBase(s, ti) {
  const t = s.teams[ti];
  if (t.sold || t.baseIdx === null) return {ok:false, msg:"沒有可賣的基地"};
  const v = sellValue(s, t);
  creditCash(s,ti,v,"出售基地所得",{category:"sell_base",tileIndex:t.baseIdx}); t.sold = true; t.soldRound = s.round;
  s.log.unshift(`${t.name} 賣出基地 +${money(v)}`);
  return {ok:true};
}
function buyBackBase(s, ti) {
  const t = s.teams[ti];
  if (!t.sold) return {ok:false, msg:"目前持有基地"};
  if (s.round <= t.soldRound) return {ok:false, msg:"須繞完一圈才可買回"};
  const v = sellValue(s, t);
  if (t.cash < v) return {ok:false, msg:"現金不足"};
  t.cash -= v;recordTransaction(s,{category:"buy_back",tileIndex:t.baseIdx,entries:[{teamId:ti,cashDelta:-v,reason:"買回基地"}]});t.sold = false;
  s.log.unshift(`${t.name} 買回基地 −${money(v)}`);
  return {ok:true};
}

/* ---------- 災害 ---------- */
function tilesInSquare(col, row, half) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const [,c,r] = TRACK[i];
    if (Math.abs(c-col) <= half && Math.abs(r-row) <= half) out.push(i);
  }
  return out;
}
function playAttack(s, ti, kind, options = {}, rnd = Math.random) {
  if(typeof options === "function"){rnd=options;options={};}
  const t = s.teams[ti], A = s.settings.attacks[kind];
  if (!A) return {ok:false, msg:"找不到這個特殊操作"};
  const useKey = `${Number(s.round)}:${ti}:${kind}`;
  if (s.attackUsage?.[useKey] || Number(t.attackRounds?.[kind]) === Number(s.round)) return {ok:false, msg:`「${A.name}」本回合已使用過`};
  const cost = costWithDiscount(s, t, A.cost);
  if (t.pts < cost) return {ok:false, msg:"諂媚之點不足"};
  changePoints(s,ti,-cost,`發動「${A.name}」`,{category:"attack_cost",attackKind:kind}); if (t.discount) t.discount = false;
  s.disasters += 1;
  let hit = [], msg = "", targetInfo = {}, shielded = [];

  const damage = (idx, amt) => {
    const o = ownerOf(s, idx);
    if (!o) return;
    if (s.teams[o.id].buffs.shield > 0) { s.teams[o.id].buffs.shield -= 1; if(!shielded.includes(o.id))shielded.push(o.id); return; }
    pay(s, o.id, "bank", amt,{category:"attack_repair",attackKind:kind,tileIndex:idx,fromReason:`受到 ${t.name} 的「${A.name}」，支付修繕費`});
  };

  if (kind === "quake") {
    const ep = Math.floor(rnd()*N); const [,c,r] = TRACK[ep];
    hit = tilesInSquare(c, r, 3);
    msg = `震央第 ${ep+1} 格`;
    hit.forEach(i => damage(i, i === ep ? Math.round(A.repair*1.5) : A.repair));

  } else if (kind === "typhoon") {
    const ep = Math.floor(rnd()*N); const [,c,r] = TRACK[ep];
    const eye = tilesInSquare(c, r, 1);
    hit = tilesInSquare(c, r, 3);
    msg = `颱風眼第 ${ep+1} 格`;
    hit.forEach(i => {
      const o = ownerOf(s, i); if (!o) return;
      if (eye.includes(i)) { if(Number(A.eyeBonus)>0)creditCash(s,o.id,A.eyeBonus,"位於颱風眼安全區，獲得補助",{category:"typhoon_eye",attackKind:kind,tileIndex:i}); return; }
      damage(i, A.repair);
    });

  } else if (kind === "wildfire") {
    const rows = [...new Set([Math.floor(rnd()*10), Math.floor(rnd()*10)])];
    hit = TRACK.map((tt,i) => rows.includes(tt[2]) ? i : -1).filter(i => i>=0);
    msg = `延燒第 ${rows.map(x=>x+1).join("、")} 排`;
    hit.forEach(i => damage(i, A.repair));

  } else if (kind === "missile") {
    const targetId=Number(options?.targetTeamId),target=s.teams[targetId];
    if(!Number.isInteger(targetId)||!target||targetId===ti||target.sold||target.baseIdx===null){changePoints(s,ti,cost,`「${A.name}」未成功發動，退還點數`,{category:"attack_refund",attackKind:kind});s.disasters-=1;return {ok:false,msg:"請選擇仍持有基地的其他隊伍"};}
    msg = `鎖定 ${target.name}`;
    if (s.teams[target.id].buffs.shield > 0) { s.teams[target.id].buffs.shield -= 1; shielded.push(target.id); }
    else pay(s, target.id, "bank", A.repair,{category:"attack_repair",attackKind:kind,tileIndex:target.baseIdx,fromReason:`受到 ${t.name} 的「${A.name}」，支付修繕費`});
    hit = target.baseIdx !== null ? [target.baseIdx] : [];
    targetInfo = { targetTeam: target.id, targetPos: target.pos, targetName: target.name };
  }
  s.attackUsage = {...(s.attackUsage || {}), [useKey]:true};
  t.attackRounds = {...(t.attackRounds || {}), [kind]:s.round};
  if(shielded.length)msg+=`；${shielded.map(id=>s.teams[id].name).join("、")} 的防災卡啟動護盾`;
  s.lastAttack = {seq:(s.lastAttack?.seq || 0)+1, team:ti, kind, name:A.name, hit, shielded, ...(targetInfo||{}), round:s.round};
  s.log.unshift(`${t.name} 發動「${A.name}」— ${msg}`);
  return {ok:true, hit};
}

/* ---------- 回合流程 ---------- */
const PHASES = ["market","sell","shop","roll"];
function nextPhase(s) {
  const i = PHASES.indexOf(s.phase);
  if (i < 0) return s;
  if (i < PHASES.length-1) {
    s.phase = PHASES[i+1];
    s.activeTeamId = null;
    if (s.phase === "roll") {
      s.teams.forEach(t => {
        if (t.jail > 0) {
          t.jail -= 1;
          t.rolled = true;
          t.lastRoll = 0;
          t.jailedThisTurn = true;
          s.log.unshift(`${t.name} 在監獄服刑，本回合暫停擲骰`);
        } else {
          t.jailedThisTurn = false;
        }
      });
    }
    return s;
  }
  const d = s.disasters, th = s.settings.inflateThreshold;
  s.market = d >= th+3 ? "crash" : d > th ? "slump" : d === th ? "flat" : d >= Math.max(1,th-2) ? "hot" : "bubble";
  s.round += 1; s.disasters = 0; s.attackUsage = {}; s.rollDiceCounts = {}; s.phase = "market";
  s.activeTeamId = null;
  s.teams.forEach(t => { t.rolled = false; t.lastRoll = null; t.lastDice = null; t.attackRounds = {}; t.jailedThisTurn = false; });
  s.log.unshift(`── 第 ${s.round} 回合開始（房市：${s.settings.marketNames[s.market]}）──`);
  collectPropertyTaxes(s);
  return s;
}

function rankTeams(s) {

  return [...s.teams]
    .map((t, idx) => ({ ...t, originalIndex: idx, prop: propertyValue(s, t), worth: netWorth(s, t) }))
    .sort((a, b) => b.worth - a.worth || b.cash - a.cash || b.pts - a.pts);
}

function rankBases(s){
  return [...s.teams]
    .map((t,idx)=>({...t,originalIndex:idx,pass:passFee(s,t),stay:stayFee(s,t)}))
    .sort((a,b)=>Number(Boolean(a.sold||a.baseIdx===null))-Number(Boolean(b.sold||b.baseIdx===null))||Number(b.level||0)-Number(a.level||0)||a.originalIndex-b.originalIndex);
}

return {TRACK,N,START_IDX,BASE_IDX,STAGE_IDX,WORM_IDX,TILE,TEAM_COLORS,LIGHT_FG,DEFAULTS,CARD_REWARD_LEVELS,CARD_DECKS,FATE_CARDS,CHANCE_CARDS,PHASES,clone,money,cardById,previewCards,drawCard,freshState,stayFee,passFee,sellValue,propertyValue,propertyTax,collectPropertyTaxes,netWorth,ownerOf,assignBases,applyMove,landEffect,resolvePendingBattle,adjudicateBattle,resolveCard,buyGamble,buyBuff,upgradeBase,sellBase,buyBackBase,playAttack,nextPhase,tilesInSquare,costWithDiscount,rankTeams,rankBases,recordTransaction,creditCash,changePoints};
})();



G.SPR = {
base:["....oooo....","...oRRRRo...","..oRRRRRRo..",".oRRRRRRRRo.","oRRRRRRRRRRo","oooooooooooo",".owwwwwwwwo.",".owWWWWWWwo.",".owwddwwwwo.",".owwddwwGwo.",".owwddwwwwo.",".oooooooooo."],
fate:["oooooooooooo","oyyyyyyyyyyo","oyyqqqqqqyyo","oyqqyyyyqqyo","oyyyyyyyqqyo","oyyyyyyqqyyo","oyyyyyqqyyyo","oyyyyqqyyyyo","oyyyyqqyyyyo","oyyyyyyyyyyo","oyyyyqqyyyyo","oooooooooooo"],
chance:["oooooooooooo","occcccccccco","occwwwwwwcco","ocwwccccwwco","ocwwwwwwwwco","occccwwccccco","occccwwccccco","occcccccccco","occccwwccccco","occccwwccccco","occcccccccco","oooooooooooo"],
bag:["....oooo....","...ottttto..","..obbbbbbbo.",".obbbBBbbbbo","obbbBBBBbbbo","obbbbssbbbbo","obbbsssssbbo","obbbbssbbbbo","obbbbssbbbbo","obbbsssssbbo",".obbbbbbbbo.","..oooooooo.."],
casino:["oooooooooooo","owwwwwwwwwwo","owppwwwwppwo","owppwwwwppwo","owwwwwwwwwwo","owwwwppwwwwo","owwwwppwwwwo","owwwwwwwwwwo","owppwwwwppwo","owppwwwwppwo","owwwwwwwwwwo","oooooooooooo"],
stage:[".....oo.....","....oBbo....","....oBbo....","....oBbo....","....oBbo....","....oBbo....","..oggggggo..","....ohho....","....ohho....","....oyyo....",".....oo.....","............"],
worm:["...oooooo...",".oommmmmmoo.","ommPPPPPPmmo","omPPccccPPmo","omPccPPccPmo","omPcPmmPcPmo","omPcPmmPcPmo","omPccPPccPmo","omPPccccPPmo","ommPPPPPPmmo",".oommmmmmoo.","...oooooo..."],
exch:[".....oo.....","....oggo....","...oggggo...","..oggggggo..",".oggggggggo.","............",".orrrrrrrro.","..orrrrrro..","...orrrro...","....orro....",".....oo.....","............"],
jail:["oooooooooooo","oBBBBBBBBBBo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","obb..bb..bbo","oBBBBBBBBBBo","oooooooooooo"],
bank:[".....oo.....","....owwo....","...owwwwo...","..owwwwwwo..",".owwwwwwwwo.","oooooooooooo","owwwwwwwwwwo","owcwcwcwcwwo","owcwcwcwcwwo","owcwcwcwcwwo","owwwwwwwwwwo","oooooooooooo"],
start:[".oooooooo...",".opwkwkwko..",".opkwkwkwo..",".opwkwkwko..",".opkwkwkwo..",".oooooooo...",".op.........",".op.........",".op.........",".op.........",".opp........",".oooo......."],
safe:[".oooooooooo.","osSSSSSSSSso","osssssssssso","ossssccsssso","ossssccsssso","osccccccccso","osccccccccso","ossssccsssso","ossssccsssso",".osssssssso.","..osssssso..","...oooooo..."]
};
G.PAL = {
base:{o:"#3a2a1a",R:"#d0473a",w:"#e6d4a8",W:"#f2e6c8",d:"#7a5230",G:"#5b8fc4"},
  fate:{o:"#3a2a1a",y:"#f2c12e",q:"#6b4a05"},
  chance:{o:"#3a2a1a",c:"#f2c12e",w:"#fffef5"},
tax:{o:"#3a2a1a",t:"#8a6a2a",b:"#caa24e",B:"#e6c072",s:"#f5ead0"},
black:{o:"#241a2e",t:"#2a2545",b:"#33305e",B:"#4a4680",s:"#f2c12e"},
casino:{o:"#3a2a1a",w:"#f2ead2",p:"#b83232"},
stage:{o:"#2b2118",B:"#dfe8f0",b:"#9aabbb",g:"#8a6a2a",h:"#7a5230",y:"#f2c12e"},
worm:{o:"#4a1010",m:"#c0392b",P:"#f0908a",c:"#2a0808"},
exch:{o:"#2b2118",g:"#3fbf5a",r:"#e23b3b"},
jail:{o:"#2b2118",b:"#8f8f8f",B:"#c4c4c4"},
bank:{o:"#3a2a1a",w:"#e6d8b0",c:"#b0a078"},
start:{o:"#2b2118",p:"#7a5230",w:"#f2f2f2",k:"#222222"},
safe:{o:"#2b2118",s:"#3fbf5a",S:"#63d67a",c:"#ffffff"}
};
G.SPRKEY = {base:"base",fate:"fate",chance:"chance",tax:"bag",black:"bag",casino:"casino",stage:"stage",worm:"worm",exch:"exch",jail:"jail",bank:"bank",start:"start",safe:"safe"};

export { G };
