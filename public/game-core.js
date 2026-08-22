const G = (function(){
/* ===== 人生大富翁 — 遊戲核心邏輯（可獨立測試） ===== */

const TRACK = [
  ["black",5,0],["safe",6,0],["base",7,0],["tax",7,1],
  ["stage",8,1],["fate",8,2],["base",9,2],["casino",9,3],
  ["safe",10,3],["fate",10,4],["base",10,5],["stage",10,6],
  ["worm",10,7],["exch",10,8],["tax",9,8],["base",9,9],
  ["safe",8,9],["base",7,9],["fate",7,8],["casino",6,8],
  ["bank",6,7],["base",5,7],["black",4,7],["safe",4,8],
  ["stage",4,9],["safe",3,9],["casino",2,9],["safe",1,9],
  ["base",0,9],["tax",0,8],["fate",0,7],["start",0,6],
  ["fate",0,5],["exch",1,5],["stage",2,5],["base",2,4],
  ["fate",3,4],["worm",4,4],["base",5,4],["fate",6,4],
  ["stage",6,3],["base",6,2],["jail",5,2],["fate",5,1],
];
const N = TRACK.length;
const START_IDX = TRACK.findIndex(t => t[0] === "start");
const BASE_IDX = TRACK.map((t,i)=>t[0]==="base"?i:-1).filter(i=>i>=0);
const STAGE_IDX = TRACK.map((t,i)=>t[0]==="stage"?i:-1).filter(i=>i>=0);
const WORM_IDX = TRACK.map((t,i)=>t[0]==="worm"?i:-1).filter(i=>i>=0);

const TILE = {
  base:{n:"基地",bg:"#3fbf5a",fg:"#0f3d18"}, fate:{n:"命運",bg:"#f2c12e",fg:"#5a3d05"},
  tax:{n:"稅收",bg:"#3f86e0",fg:"#0b2c55"},  black:{n:"黑市",bg:"#6d72b0",fg:"#141033"},
  casino:{n:"賭場",bg:"#9450d8",fg:"#ffffff"},stage:{n:"關卡",bg:"#ffffff",fg:"#1f7a2e"},
  worm:{n:"蟲洞",bg:"#2a0a0a",fg:"#f0908a"}, exch:{n:"房市中心",bg:"#57a3a3",fg:"#0d2e2e"},
  jail:{n:"監獄",bg:"#5f5f5f",fg:"#ffffff"}, bank:{n:"銀行",bg:"#2bb0b0",fg:"#0a3838"},
  start:{n:"起點",bg:"#141414",fg:"#ffe14d"},safe:{n:"安全",bg:"#e4d8ad",fg:"#5a4d1f"},
};

const TEAM_COLORS = ["#e23b3b","#3f86e0","#3fbf5a","#f2c12e","#9450d8",
                     "#e6832a","#17a2a2","#d13f8c","#6b7fd0","#8a6a2a"];
const LIGHT_FG = [3];

const DEFAULTS = {
  startCash:2000, lapBonus:300, taxAmount:200,
  casinoCost:150, casinoPayouts:[0,150,300,600],
  blackDiscount:50, bankShare:50, round1Fraction:3,
  levels:[{name:"空地",stay:0,up:0,sell:200,tax:50},
          {name:"商店",stay:300,up:6,sell:500,tax:100},
          {name:"賭場",stay:800,up:12,sell:1000,tax:200}],
  passRatio:20,
  market:{bubble:250,hot:150,flat:100,slump:70,crash:40},
  marketOrder:["bubble","hot","flat","slump","crash"],
  marketNames:{bubble:"泡沫",hot:"熱絡",flat:"平穩",slump:"低迷",crash:"崩盤"},
  attacks:{
    quake:{name:"地震",cost:4,repair:300},
    missile:{name:"飛彈",cost:3,repair:400},
    typhoon:{name:"颱風",cost:4,repair:300,eyeBonus:200},
    wildfire:{name:"野火",cost:3,repair:250},
  },
  gambles:[{name:"紅包",cost:1},{name:"戳戳樂",cost:2},
           {name:"樂透",cost:4},{name:"全押",cost:6}],
  buffs:{pass:{name:"通行證",cost:3},reroll:{name:"重骰卡",cost:2},shield:{name:"防災卡",cost:4}},
  battlesPerTeam:2, inflateThreshold:5, diceSides:6, diceCount:1,
};

const FATE_CARDS = [
  {t:"關主心情好，發放獎金",cash:300,pts:0},
  {t:"被抓到偷懶，罰款",cash:-200,pts:0},
  {t:"諂媚成功，獲得點點",cash:0,pts:2},
  {t:"營服洗壞了，賠償",cash:-150,pts:0},
  {t:"撿到隊輔的零錢包",cash:250,pts:0},
  {t:"團康表現優異，加碼",cash:400,pts:1},
  {t:"遲到集合，扣款",cash:-250,pts:0},
  {t:"幫忙搬器材，工資入袋",cash:200,pts:1},
  {t:"手機沒電找不到人，罰款",cash:-100,pts:0},
  {t:"夜教勇氣獎",cash:350,pts:0},
  {t:"被關主吐槽，扣點點",cash:0,pts:-2},
  {t:"隊呼喊得最大聲",cash:150,pts:1},
];

/* ---------- 工具 ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const money = n => "$" + Number(n).toLocaleString();

function freshState(code, teamCount, names) {
  return {
    rev:1, code, phase:"setup", round:1,
    teams: Array.from({length:teamCount}, (_,i) => ({
      id:i, name:(names && names[i]) || `第 ${i+1} 組`, color:TEAM_COLORS[i%TEAM_COLORS.length],
      cash:DEFAULTS.startCash, pts:0, pos:START_IDX, baseIdx:null, level:1,
      jail:0, jailedThisTurn:false, battles:DEFAULTS.battlesPerTeam, sold:false, soldRound:0,
      buffs:{pass:0,reroll:0,shield:0}, items:{}, attackRounds:{}, discount:false, rolled:false, lastRoll:null, lastDice:null, joined:false,
    })),
    bank:0, market:"flat", disasters:0, unlocked:[], attackUsage:{}, log:[],
    settings: clone(DEFAULTS), lastRoll:null, activeTeamId:null, pendingBattle:null,
    receipts:[], receiptSeq:0, lastPurchase:null,
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
      const paid = pay(s, t.id, "bank", tax);
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
function pay(s, from, to, amt) {
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
    if (p === START_IDX) { t.cash += s.settings.lapBonus; notes.push(`經過起點 +${money(s.settings.lapBonus)}`); }
    const own = ownerOf(s, p);
    if (own && own.id !== ti) {
      const amt = passFee(s, own);
      if (amt > 0) {
        if (t.buffs.pass > 0) {
          t.buffs.pass -= 1;
          notes.push(`通行證抵銷通行費 ${money(amt)}（剩餘 ${t.buffs.pass} 張）`);
        } else {
          pay(s, ti, own.id, amt);
          notes.push(`通行費 ${money(amt)} → ${own.name}`);
        }
      }
    }
  }
  // 終點
  const dest = (from + steps) % N;
  if (dest === START_IDX && steps > 0) { t.cash += s.settings.lapBonus; notes.push(`停在起點 +${money(s.settings.lapBonus)}`); }
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
    pay(s, ti, "bank", S.taxAmount); notes.push(`稅收 −${money(S.taxAmount)}`);

  } else if (kind === "fate") {
    notes.push("命運格：請抽取實體命運卡，結果由主持人調整");

  } else if (kind === "black") {
    t.discount = true; notes.push(`黑市：下次商店消費打 ${S.blackDiscount/10} 折`);

  } else if (kind === "casino") {
    // 賭資先進銀行池，獎金再從池中支付；池子不足則只能領到池中餘額
    const cost = Math.max(0, Math.min(t.cash, S.casinoCost));
    t.cash -= cost;
    s.bank += cost;
    const draw = S.casinoPayouts[Math.floor(rnd()*S.casinoPayouts.length)];
    const win = Math.min(draw, s.bank);
    s.bank -= win; t.cash += win;
    notes.push(`賭場：押 ${money(cost)}，${win ? `拿回 ${money(win)}` : "全數落空"}${win < draw ? "（銀行餘額不足）" : ""}`);

  } else if (kind === "bank") {
    const take = Math.max(0, Math.round(s.bank * S.bankShare/100));
    s.bank -= take; t.cash += take;
    notes.push(`銀行密道：幹走 ${money(take)}`);

  } else if (kind === "worm") {
    const other = WORM_IDX.find(i => i !== t.pos);
    if (other !== undefined) {
      if ((t.pos < START_IDX && other >= START_IDX) || (t.pos > other && (START_IDX > t.pos || START_IDX <= other))) {
        t.cash += S.lapBonus;
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
    notes.push("房市中心：查看本回合房產資訊");

  } else if (kind === "stage") {
    notes.push(s.unlocked.includes(t.pos) ? "關卡已解封，觸發關卡技能" : "關卡尚未解封");
  }
  return notes;
}

function resolvePendingBattle(s, ti, choice) {
  const pending=s.pendingBattle;
  if(!pending||pending.attackerId!==ti)return {ok:false,msg:"目前沒有待處理的基地費用"};
  const attacker=s.teams[pending.attackerId],defender=s.teams[pending.defenderId];
  if(!attacker||!defender){s.pendingBattle=null;return {ok:false,msg:"BATTLE 隊伍資料不存在"};}
  if(choice==="pay"){
    const paid=pay(s,attacker.id,defender.id,pending.amount);
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
  if(outcome==="attacker"){
    s.pendingBattle=null;
    s.log.unshift(`BATTLE 裁決：${attacker.name} 獲勝，免付 ${money(pending.amount)} 過夜費`);
    return {ok:true,paid:0};
  }
  if(outcome==="defender"){
    const paid=pay(s,attacker.id,defender.id,pending.amount);
    s.pendingBattle=null;
    s.log.unshift(`BATTLE 裁決：${defender.name} 守住基地，${attacker.name} 支付 ${money(paid)}`);
    return {ok:true,paid};
  }
  return {ok:false,msg:"BATTLE 裁決結果錯誤"};
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
  t.pts -= cost; if (t.discount) t.discount = false;
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
  t.pts -= cost; t.buffs[bk] = (t.buffs[bk] || 0) + 1; if (t.discount) t.discount = false;
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
  t.pts -= need; t.level += 1;
  s.log.unshift(`${t.name} 基地升級為「${s.settings.levels[t.level-1].name}」`);
  return {ok:true};
}
function sellBase(s, ti) {
  const t = s.teams[ti];
  if (t.sold || t.baseIdx === null) return {ok:false, msg:"沒有可賣的基地"};
  const v = sellValue(s, t);
  t.cash += v; t.sold = true; t.soldRound = s.round;
  s.log.unshift(`${t.name} 賣出基地 +${money(v)}`);
  return {ok:true};
}
function buyBackBase(s, ti) {
  const t = s.teams[ti];
  if (!t.sold) return {ok:false, msg:"目前持有基地"};
  if (s.round <= t.soldRound) return {ok:false, msg:"須繞完一圈才可買回"};
  const v = sellValue(s, t);
  if (t.cash < v) return {ok:false, msg:"現金不足"};
  t.cash -= v; t.sold = false;
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
function playAttack(s, ti, kind, rnd = Math.random) {
  const t = s.teams[ti], A = s.settings.attacks[kind];
  if (!A) return {ok:false, msg:"找不到這個特殊操作"};
  const useKey = `${Number(s.round)}:${ti}:${kind}`;
  if (s.attackUsage?.[useKey] || Number(t.attackRounds?.[kind]) === Number(s.round)) return {ok:false, msg:`「${A.name}」本回合已使用過`};
  const cost = costWithDiscount(s, t, A.cost);
  if (t.pts < cost) return {ok:false, msg:"諂媚之點不足"};
  t.pts -= cost; if (t.discount) t.discount = false;
  s.disasters += 1;
  let hit = [], msg = "", targetInfo = {}, shielded = [];

  const damage = (idx, amt) => {
    const o = ownerOf(s, idx);
    if (!o) return;
    if (s.teams[o.id].buffs.shield > 0) { s.teams[o.id].buffs.shield -= 1; if(!shielded.includes(o.id))shielded.push(o.id); return; }
    pay(s, o.id, "bank", amt);
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
      if (eye.includes(i)) { s.teams[o.id].cash += A.eyeBonus; return; }
      damage(i, A.repair);
    });

  } else if (kind === "wildfire") {
    const rows = [...new Set([Math.floor(rnd()*10), Math.floor(rnd()*10)])];
    hit = TRACK.map((tt,i) => rows.includes(tt[2]) ? i : -1).filter(i => i>=0);
    msg = `延燒第 ${rows.map(x=>x+1).join("、")} 排`;
    hit.forEach(i => damage(i, A.repair));

  } else if (kind === "missile") {
    const rank = [...s.teams].sort((a,b) => netWorth(s,b) - netWorth(s,a));
    const mine = rank.findIndex(x => x.id === ti);
    let target = null;
    if (mine > 0) target = rank[mine - 1];
    else if (rank.length > 1) target = rank[1];
    if (!target) { t.pts += cost; s.disasters -= 1; return {ok:false, msg:"沒有可攻擊的對手"}; }
    msg = `鎖定 ${target.name}`;
    if (s.teams[target.id].buffs.shield > 0) { s.teams[target.id].buffs.shield -= 1; shielded.push(target.id); }
    else pay(s, target.id, "bank", A.repair);
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
  s.market = d >= th+3 ? "bubble" : d > th ? "hot" : d === th ? "flat" : d >= Math.max(1,th-2) ? "slump" : "crash";
  s.round += 1; s.disasters = 0; s.attackUsage = {}; s.phase = "market";
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

return {TRACK,N,START_IDX,BASE_IDX,STAGE_IDX,WORM_IDX,TILE,TEAM_COLORS,LIGHT_FG,DEFAULTS,FATE_CARDS,PHASES,clone,money,freshState,stayFee,passFee,sellValue,propertyValue,propertyTax,collectPropertyTaxes,netWorth,ownerOf,assignBases,applyMove,landEffect,resolvePendingBattle,adjudicateBattle,buyGamble,buyBuff,upgradeBase,sellBase,buyBackBase,playAttack,nextPhase,tilesInSquare,costWithDiscount,rankTeams};
})();



G.SPR = {
base:["....oooo....","...oRRRRo...","..oRRRRRRo..",".oRRRRRRRRo.","oRRRRRRRRRRo","oooooooooooo",".owwwwwwwwo.",".owWWWWWWwo.",".owwddwwwwo.",".owwddwwGwo.",".owwddwwwwo.",".oooooooooo."],
fate:["oooooooooooo","oyyyyyyyyyyo","oyyqqqqqqyyo","oyqqyyyyqqyo","oyyyyyyyqqyo","oyyyyyyqqyyo","oyyyyyqqyyyo","oyyyyqqyyyyo","oyyyyqqyyyyo","oyyyyyyyyyyo","oyyyyqqyyyyo","oooooooooooo"],
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
G.SPRKEY = {base:"base",fate:"fate",tax:"bag",black:"bag",casino:"casino",stage:"stage",worm:"worm",exch:"exch",jail:"jail",bank:"bank",start:"start",safe:"safe"};

export { G };
