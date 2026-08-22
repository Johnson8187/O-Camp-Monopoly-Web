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
if (!/實體命運卡/.test(physicalFate.lastRoll.note)) throw new Error('命運格應提示抽取實體命運卡');

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

const persistentBuff = G.freshState('persistent-buff-test', 2);
persistentBuff.teams[0].buffs.shield = 2;
persistentBuff.phase = 'roll';
G.nextPhase(persistentBuff);
if (persistentBuff.teams[0].buffs.shield !== 2) throw new Error('未使用的增益卡應跨回合保留');

const physicalInventory = G.freshState('physical-inventory-test', 2);
physicalInventory.teams[0].pts = 20;
if (!G.buyGamble(physicalInventory, 0, 1).ok || !G.buyGamble(physicalInventory, 0, 1).ok) throw new Error('實體物品購買失敗');
if (physicalInventory.teams[0].items.g1 !== 2 || physicalInventory.lastPurchase.kind !== 'physical' || physicalInventory.lastPurchase.count !== 2) throw new Error('實體物品沒有正確放入背包並累加數量');

const shieldFeedback = G.freshState('shield-feedback-test', 2);
shieldFeedback.round = 2;
shieldFeedback.teams[0].pts = 100;
shieldFeedback.teams[1].baseIdx = G.BASE_IDX[0];
shieldFeedback.teams[1].level = 2;
shieldFeedback.teams[1].buffs.shield = 1;
G.playAttack(shieldFeedback, 0, 'missile', () => 0);
if (shieldFeedback.teams[1].buffs.shield !== 0 || !shieldFeedback.lastAttack.shielded.includes(1) || !/啟動護盾/.test(shieldFeedback.log[0])) throw new Error('防災卡抵銷攻擊時應留下明確護盾提示');

// Test: 房市倍率對過夜費、通行費的影響
const marketFeeTest = G.freshState('market-fee-test', 2);
marketFeeTest.round = 2; // avoid round 1 fraction discount for pure multiplier test
marketFeeTest.teams[0].baseIdx = G.BASE_IDX[0];
marketFeeTest.teams[0].level = 2; // 商店 (base stay: 300)

marketFeeTest.market = 'flat';
if (G.stayFee(marketFeeTest, marketFeeTest.teams[0]) !== 300) throw new Error('平穩房市過夜費計算錯誤');
if (G.passFee(marketFeeTest, marketFeeTest.teams[0]) !== 60) throw new Error('平穩房市通行費計算錯誤');

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
