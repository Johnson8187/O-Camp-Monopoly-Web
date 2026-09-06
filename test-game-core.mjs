import { G } from './public/game-core.js';

const state = G.freshState('smoke-test', 7);
if (state.teams.length !== 7) throw new Error('隊伍數量未正確建立');
if (state.ceremonyStep !== 0) throw new Error('頒獎典禮初始進度錯誤');
if (state.teams.some(t => t.baseIdx !== null)) throw new Error('初始基地狀態錯誤');
G.assignBases(state);
if (state.teams.some(t => t.baseIdx === null)) throw new Error('基地分配失敗');
state.phase = 'market';
G.nextPhase(state);
if (!['sell','shop','roll'].includes(state.phase)) throw new Error(`階段切換結果錯誤：${state.phase}`);

const assets = G.freshState('assets-test', 2);
G.assignBases(assets,()=>0);
const firstTeam = assets.teams[0];
if (G.propertyValue(assets,firstTeam) !== G.sellValue(assets,firstTeam)) throw new Error('房產價值拆分錯誤');
if (G.netWorth(assets,firstTeam) !== firstTeam.cash + G.propertyValue(assets,firstTeam)) throw new Error('總資產計算錯誤');

const jailIndex = G.TRACK.findIndex(tile => tile[0] === 'jail');
for (const [level, expectedLevel, expectedSold, expectedOutcome] of [[3,2,false,'downgrade'],[2,1,false,'downgrade'],[1,1,true,'foreclosed']]) {
  const foreclosure = G.freshState(`foreclosure-lv${level}`, 2);
  foreclosure.round = 3;
  foreclosure.teams[0].baseIdx = G.BASE_IDX[0];
  foreclosure.teams[0].level = level;
  foreclosure.teams[0].pos = jailIndex;
  const cashBefore = foreclosure.teams[0].cash;
  const result=G.applyJailForeclosure(foreclosure,0);
  if (foreclosure.teams[0].level !== expectedLevel || foreclosure.teams[0].sold !== expectedSold) throw new Error(`監獄法拍處分錯誤：LV${level}`);
  if (foreclosure.teams[0].cash !== cashBefore) throw new Error(`監獄法拍不得返還現金：LV${level}`);
  if (foreclosure.teams[0].jail !== 0 || foreclosure.teams[0].jailedThisTurn) throw new Error('監獄不得再扣留隊伍一回合');
  if (foreclosure.lastForeclosure?.outcome !== expectedOutcome || !/逃漏稅/.test(result.detail)) throw new Error(`監獄法拍紀錄錯誤：LV${level}`);
  if (expectedSold && foreclosure.teams[0].soldRound !== foreclosure.round) throw new Error('法拍後必須沿用繞圈後買回規則');
}
const jailBattleWin=G.freshState('jail-battle-win',2);
jailBattleWin.round=3;jailBattleWin.phase='roll';jailBattleWin.teams[0].baseIdx=G.BASE_IDX[0];jailBattleWin.teams[0].level=1;jailBattleWin.teams[0].pos=jailIndex;
const winCash=jailBattleWin.teams[0].cash,winBattles=jailBattleWin.teams[0].battles;
G.landEffect(jailBattleWin,0,[]);
if(jailBattleWin.pendingBattle?.kind!=='jail'||jailBattleWin.teams[0].sold)throw new Error('踩監獄後應先等待選擇，不能立即法拍');
if(!G.resolvePendingBattle(jailBattleWin,0,'battle').ok||jailBattleWin.teams[0].battles!==winBattles-1)throw new Error('監獄挑戰主持人應扣除一次 BATTLE 額度');
if(!G.adjudicateBattle(jailBattleWin,'attacker').ok||jailBattleWin.teams[0].sold||jailBattleWin.teams[0].cash!==winCash||jailBattleWin.lastForeclosure)throw new Error('監獄 BATTLE 獲勝應完全免除法拍處分');
const jailBattleLoss=G.freshState('jail-battle-loss',2);
jailBattleLoss.round=3;jailBattleLoss.phase='roll';jailBattleLoss.teams[0].baseIdx=G.BASE_IDX[0];jailBattleLoss.teams[0].level=1;jailBattleLoss.teams[0].pos=jailIndex;
G.landEffect(jailBattleLoss,0,[]);G.resolvePendingBattle(jailBattleLoss,0,'battle');
if(!G.adjudicateBattle(jailBattleLoss,'defender').ok||!jailBattleLoss.teams[0].sold||jailBattleLoss.lastForeclosure?.outcome!=='foreclosed')throw new Error('監獄 BATTLE 落敗應執行原法拍處分');
const jailAccept=G.freshState('jail-accept',2);
jailAccept.round=3;jailAccept.teams[0].baseIdx=G.BASE_IDX[0];jailAccept.teams[0].level=3;jailAccept.teams[0].pos=jailIndex;
G.landEffect(jailAccept,0,[]);
if(!G.resolvePendingBattle(jailAccept,0,'accept').ok||jailAccept.teams[0].level!==2||jailAccept.pendingBattle)throw new Error('接受監獄處分應立即降低一級並結束等待');
const jailNoQuota=G.freshState('jail-no-quota',2);
jailNoQuota.teams[0].baseIdx=G.BASE_IDX[0];jailNoQuota.teams[0].pos=jailIndex;jailNoQuota.teams[0].battles=0;G.landEffect(jailNoQuota,0,[]);
if(G.resolvePendingBattle(jailNoQuota,0,'battle').ok||!jailNoQuota.pendingBattle||jailNoQuota.teams[0].sold)throw new Error('BATTLE 額度不足時不得挑戰，也不能提前法拍');
const noPropertyForeclosure = G.freshState('foreclosure-none', 2);
noPropertyForeclosure.teams[0].pos = jailIndex;
const noPropertyCash = noPropertyForeclosure.teams[0].cash;
G.landEffect(noPropertyForeclosure, 0, []);
if (noPropertyForeclosure.pendingBattle || noPropertyForeclosure.lastForeclosure?.outcome !== 'no_property' || noPropertyForeclosure.teams[0].cash !== noPropertyCash) throw new Error('無房產者踩監獄不應進入 BATTLE 或產生額外處分');

const attacks = G.freshState('attack-limit-test', 3);
G.assignBases(attacks,()=>0);
attacks.phase = 'roll';
attacks.teams[0].pts = 100;
const firstAttack = G.playAttack(attacks,0,'quake',()=>0);
if (!firstAttack.ok) throw new Error(`首次特殊操作失敗：${firstAttack.msg}`);
const pointsAfterFirst = attacks.teams[0].pts;
const repeatedAttack = G.playAttack(attacks,0,'quake',()=>0);
if (repeatedAttack.ok || !/本回合已使用過/.test(repeatedAttack.msg)) throw new Error('未限制同一回合重複使用同一特殊操作');
if (attacks.teams[0].pts !== pointsAfterFirst) throw new Error('被拒絕的重複特殊操作不應扣點');
if (!G.playAttack(attacks,0,'wildfire',()=>0).ok) throw new Error('同回合應允許使用不同特殊操作');
attacks.round += 1;
if (!G.playAttack(attacks,0,'quake',()=>0).ok) throw new Error('下一回合應重置特殊操作額度');

const physicalFate = G.freshState('physical-fate-test', 2);
const fateIndex = G.TRACK.findIndex(tile => tile[0] === 'fate');
physicalFate.teams[0].pos = (fateIndex - 1 + G.TRACK.length) % G.TRACK.length;
const fateCash = physicalFate.teams[0].cash;
const fatePts = physicalFate.teams[0].pts;
G.applyMove(physicalFate, 0, 1, () => 0, [1]);
if (physicalFate.teams[0].cash !== fateCash || physicalFate.teams[0].pts !== fatePts) throw new Error('實體命運卡模式不應自動更動資源');
if (!physicalFate.pendingBattle || physicalFate.pendingBattle.kind !== 'card' || !/命運格/.test(physicalFate.lastRoll.note)) throw new Error('命運格應鎖定實體卡並等待隊伍選擇');
if (!G.resolvePendingBattle(physicalFate,0,'accept').ok || !physicalFate.pendingCard) throw new Error('接受命運卡挑戰失敗');
const acceptedCard=G.cardById(physicalFate.pendingCard.cardType,physicalFate.pendingCard.cardId),acceptedBefore=physicalFate.teams[0].cash;
if (!G.resolveCard(physicalFate,'success').ok || physicalFate.teams[0].cash !== acceptedBefore + acceptedCard.success) throw new Error('命運卡成功獎金結算錯誤');

if (G.TRACK.filter(tile=>tile[0]==='chance').length !== 4 || G.TRACK.filter(tile=>tile[0]==='fate').length !== 4) throw new Error('棋盤應平均配置四格機會與四格命運');
const intelligence=G.freshState('intel-test',2),intelIndex=G.TRACK.findIndex(tile=>tile[0]==='exch');
intelligence.teams[0].pos=intelIndex;G.landEffect(intelligence,0,[]);
if (intelligence.teams[0].cardIntel.chance.join(',')!=='1,2,3' || intelligence.teams[0].cardIntel.fate.join(',')!=='1,2,3') throw new Error('情報局沒有保存兩個牌堆前三張');
G.drawCard(intelligence,'chance');
if (intelligence.teams[0].cardIntel.chance.join(',')!=='1,2,3' || G.previewCards(intelligence,'chance',3).map(card=>card.id).join(',')!=='2,3,4') throw new Error('情報應為快照，牌堆則需獨立推進');

const cardBattle=G.freshState('card-battle-test',3),chanceIndex=G.TRACK.findIndex(tile=>tile[0]==='chance');
cardBattle.teams[0].pos=chanceIndex;cardBattle.teams[0].battles=1;G.landEffect(cardBattle,0,[]);
if (!G.resolvePendingBattle(cardBattle,0,'battle',{targetTeamId:2}).ok || cardBattle.teams[0].battles!==0) throw new Error('機會卡 BATTLE 發動或次數扣除錯誤');
if (!G.adjudicateBattle(cardBattle,'attacker').ok || cardBattle.pendingCard?.executorId!==2) throw new Error('卡片 BATTLE 攻方獲勝時應由守方執行');
const failedCard=G.cardById(cardBattle.pendingCard.cardType,cardBattle.pendingCard.cardId),targetBefore=cardBattle.teams[2].cash;
if (!G.resolveCard(cardBattle,'failure').ok || cardBattle.teams[2].cash!==targetBefore+failedCard.failure) throw new Error('卡片失敗安慰獎結算錯誤');

const multiDice = G.freshState('multi-dice-test', 2);
G.applyMove(multiDice, 0, 7, () => 0, [3, 4]);
if (multiDice.teams[0].lastRoll !== 7 || multiDice.teams[0].lastDice.join(',') !== '3,4') throw new Error('多骰結果與總和未正確保存');

const battle = G.freshState('battle-payment-test', 2);
const battleBase = G.TRACK.findIndex(tile => tile[0] === 'base');
battle.teams[1].baseIdx = battleBase;
battle.teams[1].level = 2;
battle.teams[0].pos = (battleBase - 1 + G.TRACK.length) % G.TRACK.length;
const attackerCash = battle.teams[0].cash;
const defenderCash = battle.teams[1].cash;
G.applyMove(battle, 0, 1, () => 0, [1]);
if (!battle.pendingBattle || battle.teams[0].cash !== attackerCash || battle.teams[1].cash !== defenderCash) throw new Error('踩到他人基地時應凍結費用，等待玩家選擇');
const pendingAmount = battle.pendingBattle.amount;
if (!G.resolvePendingBattle(battle, 0, 'pay').ok) throw new Error('直接付款選項失敗');
if (battle.teams[0].cash !== attackerCash - pendingAmount || battle.teams[1].cash !== defenderCash + pendingAmount) throw new Error('直接付款金流錯誤');

const adjudication = G.freshState('battle-adjudication-test', 2);
adjudication.teams[1].baseIdx = battleBase;
adjudication.teams[1].level = 2;
adjudication.teams[0].pos = (battleBase - 1 + G.TRACK.length) % G.TRACK.length;
adjudication.teams[0].battles = 1;
const cashBeforeBattle = adjudication.teams[0].cash;
G.applyMove(adjudication, 0, 1, () => 0, [1]);
if (!G.resolvePendingBattle(adjudication, 0, 'battle').ok || adjudication.teams[0].battles !== 0) throw new Error('BATTLE 發動或次數扣除失敗');
if (!G.adjudicateBattle(adjudication, 'attacker').ok || adjudication.teams[0].cash !== cashBeforeBattle) throw new Error('攻方勝時應免除原過夜費');

const battleLoss = G.freshState('battle-loss-multiplier-test', 2);
battleLoss.round=2;battleLoss.teams[1].baseIdx=battleBase;battleLoss.teams[1].level=2;battleLoss.teams[0].pos=(battleBase-1+G.TRACK.length)%G.TRACK.length;battleLoss.teams[0].battles=1;
const lossAttackerBefore=battleLoss.teams[0].cash,lossDefenderBefore=battleLoss.teams[1].cash;
G.applyMove(battleLoss,0,1,()=>0,[1]);const baseFee=battleLoss.pendingBattle.amount;
G.resolvePendingBattle(battleLoss,0,'battle');G.adjudicateBattle(battleLoss,'defender');
const expectedPenalty=Math.round((baseFee*1.5)/50)*50;
if (battleLoss.teams[0].cash!==lossAttackerBefore-expectedPenalty || battleLoss.teams[1].cash!==lossDefenderBefore+expectedPenalty) throw new Error('基地 BATTLE 敗方應支付四捨五入後的 1.5 倍過夜費');

const persistentBuff = G.freshState('persistent-buff-test', 2);
persistentBuff.teams[0].buffs.shield = 2;
persistentBuff.phase = 'roll';
G.nextPhase(persistentBuff);
if (persistentBuff.teams[0].buffs.shield !== 2) throw new Error('未使用的增益卡應跨回合保留');

const physicalInventory = G.freshState('physical-inventory-test', 2);
physicalInventory.teams[0].pts = 100;
if (!G.buyGamble(physicalInventory, 0, 1).ok) throw new Error('實體物品購買失敗');
const repeatedPhysical=G.buyGamble(physicalInventory,0,0);
if(repeatedPhysical.ok||!/每回合最多/.test(repeatedPhysical.msg)||physicalInventory.teams[0].items.g1!==1)throw new Error('實體物品每回合購買限制失效');
physicalInventory.round=2;
if(!G.buyGamble(physicalInventory,0,1).ok||physicalInventory.teams[0].items.g1!==2||physicalInventory.lastPurchase.kind!=='physical'||physicalInventory.lastPurchase.count!==2)throw new Error('下一回合應可再次購買實體物品');
physicalInventory._transactions=[];
const cashBeforeRedeem=physicalInventory.teams[0].cash;
if(!G.redeemPhysicalItem(physicalInventory,0,1,700).ok||physicalInventory.teams[0].cash!==cashBeforeRedeem+700||physicalInventory.teams[0].items.g1!==1)throw new Error('實體物品兌換未正確入帳或扣除背包數量');
if(physicalInventory._transactions[0]?.category!=='physical_redeem'||physicalInventory._transactions[0]?.entries[0]?.cashDelta!==700)throw new Error('實體物品兌換沒有建立專用金流');
if(G.redeemPhysicalItem(physicalInventory,0,1,999).ok)throw new Error('不得兌換獎池以外的金額');
const allIn=G.freshState('all-in-limit-test',2);allIn.teams[0].pts=100;
if(!G.buyGamble(allIn,0,3).ok)throw new Error('首次購買全押失敗');
allIn._transactions=[];const zeroCash=allIn.teams[0].cash;
if(!G.redeemPhysicalItem(allIn,0,3,0).ok||allIn.teams[0].cash!==zeroCash||!allIn._transactions[0]?.allowZero||!allIn._transactions[0]?.entries[0]?.displayCash)throw new Error('$0 全押兌換應保留零元正式收據資料');
allIn.round=2;
if(G.buyGamble(allIn,0,3).ok)throw new Error('全押每隊整場最多購買一次');

if(G.CARD_REWARD_LEVELS[1].success!==350||G.CARD_REWARD_LEVELS[4].failure!==250)throw new Error('機會／命運卡平衡獎金未套用');
if(!/禁止跑動/.test(G.CHANCE_CARDS[2].task)||!/60 秒/.test(G.CHANCE_CARDS[14].task)||G.FATE_CARDS[16].name!=='定格訓練')throw new Error('高風險卡片的安全規則未更新');

const shieldFeedback = G.freshState('shield-feedback-test', 2);
shieldFeedback.round = 2;
shieldFeedback.teams[0].pts = 100;
shieldFeedback.teams[1].baseIdx = G.BASE_IDX[0];
shieldFeedback.teams[1].level = 2;
shieldFeedback.teams[1].buffs.shield = 1;
G.playAttack(shieldFeedback, 0, 'missile', {targetTeamId:1}, () => 0);
if (shieldFeedback.teams[1].buffs.shield !== 0 || !shieldFeedback.lastAttack.shielded.includes(1) || !/啟動護盾/.test(shieldFeedback.log[0])) throw new Error('防災卡抵銷攻擊時應留下明確護盾提示');

// Test: 房市倍率對過夜費、通行費的影響
const marketFeeTest = G.freshState('market-fee-test', 2);
marketFeeTest.round = 2; // avoid round 1 fraction discount for pure multiplier test
marketFeeTest.teams[0].baseIdx = G.BASE_IDX[0];
marketFeeTest.teams[0].level = 2; // 商店 (base stay: 300)

marketFeeTest.market = 'flat';
if (G.stayFee(marketFeeTest, marketFeeTest.teams[0]) !== 300) throw new Error('平穩房市過夜費計算錯誤');
if (G.passFee(marketFeeTest, marketFeeTest.teams[0]) !== 60) throw new Error('平穩房市通行費計算錯誤');

const stageRewards=G.freshState('stage-rewards',2);
stageRewards.teams[0].cash=2000;stageRewards.teams[0].pts=0;stageRewards.unlocked=[...G.STAGE_IDX];
stageRewards.teams[0].pos=G.STAGE_IDX[0];G.landEffect(stageRewards,0,[]);G.landEffect(stageRewards,0,[]);
if(stageRewards.teams[0].cash!==3000)throw new Error('夜教應每次踩踏都重複發放獎勵');
stageRewards.teams[0].pos=G.STAGE_IDX[1];G.landEffect(stageRewards,0,[]);
if(stageRewards.teams[0].cash!==2400||stageRewards.bank!==600)throw new Error('陸大扣款應安全進入銀行');
stageRewards.teams[0].pos=G.STAGE_IDX[3];G.landEffect(stageRewards,0,[]);
if(stageRewards.teams[0].pts!==10)throw new Error('RPG 諂媚點獎勵錯誤');
stageRewards.teams[0].level=3;stageRewards.teams[1].level=1;
if(G.rankBases(stageRewards)[0].id!==0)throw new Error('基地排行榜必須依基地等級排序');

const missileTarget=G.freshState('missile-target',3);missileTarget.round=2;missileTarget.teams[0].pts=30;missileTarget.teams[1].baseIdx=G.BASE_IDX[0];missileTarget.teams[2].baseIdx=G.BASE_IDX[1];
const beforeTargetCash=missileTarget.teams[2].cash,missileCost=missileTarget.settings.attacks.missile.cost;
if(!G.playAttack(missileTarget,0,'missile',{targetTeamId:2}).ok||missileTarget.teams[2].cash>=beforeTargetCash)throw new Error('飛彈未攻擊指定隊伍');
const invalidMissile=G.freshState('invalid-missile',2);invalidMissile.round=2;invalidMissile.teams[0].pts=30;const beforePts=invalidMissile.teams[0].pts;
if(G.playAttack(invalidMissile,0,'missile',{targetTeamId:0}).ok||invalidMissile.teams[0].pts!==beforePts)throw new Error('無效飛彈目標不得扣點');

marketFeeTest.market = 'hot'; // 150%
if (G.stayFee(marketFeeTest, marketFeeTest.teams[0]) !== 450) throw new Error('熱絡房市過夜費計算錯誤');
if (G.passFee(marketFeeTest, marketFeeTest.teams[0]) !== 90) throw new Error('熱絡房市通行費計算錯誤');

marketFeeTest.market = 'bubble'; // 250%
if (G.stayFee(marketFeeTest, marketFeeTest.teams[0]) !== 750) throw new Error('泡沫房市過夜費計算錯誤');

marketFeeTest.market = 'slump'; // 70%
if (G.stayFee(marketFeeTest, marketFeeTest.teams[0]) !== 210) throw new Error('低迷房市過夜費計算錯誤');

// Test: 房屋稅收取到銀行池，且受房市倍率影響
const taxTest = G.freshState('tax-collection-test', 2);
taxTest.teams[0].baseIdx = G.BASE_IDX[0];
taxTest.teams[0].level = 2; // 商店 (base tax: 100)
taxTest.teams[1].baseIdx = G.BASE_IDX[1];
taxTest.teams[1].level = 3; // 賭場 (base tax: 200)
taxTest.market = 'hot'; // 150% -> Lv2 tax: 150, Lv3 tax: 300, total = 450
const t0CashBefore = taxTest.teams[0].cash;
const t1CashBefore = taxTest.teams[1].cash;
const bankBefore = taxTest.bank;

const collected = G.collectPropertyTaxes(taxTest);
if (collected !== 450) throw new Error(`房屋稅收取金額錯誤：預期 450，實得 ${collected}`);
if (taxTest.bank !== bankBefore + 450) throw new Error('房屋稅未正確存入銀行池');
if (taxTest.teams[0].cash !== t0CashBefore - 150 || taxTest.teams[1].cash !== t1CashBefore - 300) throw new Error('隊伍房屋稅扣款金額錯誤');

// Test: 回合推進時自動收取房屋稅
const roundTaxTest = G.freshState('round-tax-test', 2);
roundTaxTest.teams[0].baseIdx = G.BASE_IDX[0];
roundTaxTest.teams[0].level = 2;
roundTaxTest.teams[1].baseIdx = G.BASE_IDX[1];
roundTaxTest.teams[1].level = 1; // 空地 (base tax: 50)
roundTaxTest.phase = 'roll';
const roundBankBefore = roundTaxTest.bank;
G.nextPhase(roundTaxTest); // advances to round 2, market phase
if (roundTaxTest.round !== 2 || roundTaxTest.phase !== 'market') throw new Error('回合推進失敗');
if (roundTaxTest.bank <= roundBankBefore) throw new Error('換回合時未自動收取房屋稅至銀行庫存');

console.log('game-core smoke test passed');
