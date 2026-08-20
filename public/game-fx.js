export const PHASE_FX = {
  setup:  {symbol:'READY', title:'準備開始', subtitle:'等待主持人開始遊戲', kind:'setup'},
  market: {symbol:'↗', title:'股市公布', subtitle:'注意本回合市場倍率', kind:'market'},
  sell:   {symbol:'＄', title:'基地階段', subtitle:'升級、出售或買回基地', kind:'sell'},
  shop:   {symbol:'◆', title:'商店開張', subtitle:'購買道具與抽獎機會', kind:'shop'},
  roll:   {symbol:'⚄', title:'開始移動', subtitle:'隊輔可以擲骰行動', kind:'roll'},
  paused: {symbol:'Ⅱ', title:'遊戲暫停', subtitle:'請等待主持人恢復活動', kind:'paused'},
  ended:  {symbol:'★', title:'活動結束', subtitle:'最終排名已經出爐', kind:'ended'},
};

export const ATTACK_FX = {
  quake:    {symbol:'╱╲', title:'地震來襲', subtitle:'震央爆發，範圍基地受到衝擊'},
  missile:  {symbol:'➤', title:'飛彈鎖定', subtitle:'瞄準排行榜相鄰隊伍'},
  typhoon:  {symbol:'◎', title:'颱風登陸', subtitle:'暴風圈橫掃棋盤，注意颱風眼'},
  wildfire: {symbol:'▲', title:'野火延燒', subtitle:'火線沿隨機橫排快速蔓延'},
};

export function classifyEvent(message=''){
  const text=String(message);
  if(/發動|地震|飛彈|颱風|野火|攻擊|踢出/.test(text))return 'danger';
  if(/監獄|稅收|過夜費|通行費|扣|−|崩盤|離線/.test(text))return 'loss';
  if(/升級|賣出基地|取得|\+|獎勵|抽籤完成/.test(text))return 'reward';
  if(/買了|買回|商店|道具|重骰卡|BATTLE/.test(text))return 'item';
  if(/股市|回合開始|遊戲開始|暫停|恢復|解封|活動結束/.test(text))return 'phase';
  return 'info';
}

export function movementPath(from,steps,finalPosition,trackLength){
  const length=Math.max(1,Number(trackLength)||1);
  const start=((Number(from)||0)%length+length)%length;
  const count=Math.max(0,Math.floor(Number(steps)||0));
  const path=[];
  for(let i=1;i<=count;i++)path.push((start+i)%length);
  const final=((Number(finalPosition)||0)%length+length)%length;
  if(path.at(-1)!==final&&final!==start)path.push(final);
  return path;
}
