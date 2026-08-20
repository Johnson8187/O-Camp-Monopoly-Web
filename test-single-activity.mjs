const base = process.env.TEST_BASE || 'http://127.0.0.1:8787';

async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.text();
  let data = null; try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  return { response, body, data };
}
async function get(path) {
  const result = await request(path);
  if (!result.response.ok) throw new Error(`${path} returned ${result.response.status}`);
  return result;
}
function waitFor(ws, predicate, label, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${label} 逾時`)), timeout);
    const onMessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(message);
    };
    ws.addEventListener('message', onMessage);
  });
}
function sendAndWait(ws, actionId, action, payload = {}) {
  const result = waitFor(ws, message => message.actionId === actionId && (message.type === 'action_ok' || message.type === 'error'), actionId);
  ws.send(JSON.stringify({ type: 'action', actionId, action, payload }));
  return result;
}
async function connect(id, hello) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${encodeURIComponent(id)}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 開啟失敗')), { once: true });
  });
  await waitFor(ws, message => message.type === 'hello_required', 'hello_required');
  ws.send(JSON.stringify({ type: 'hello', ...hello }));
  const welcome = await waitFor(ws, message => message.type === 'hello_ok', `${hello.role} hello_ok`);
  return { ws, welcome };
}
async function expectRejected(id, hello) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${encodeURIComponent(id)}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 開啟失敗')), { once: true });
  });
  await waitFor(ws, message => message.type === 'hello_required', 'hello_required');
  const rejected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('錯誤共用密碼未被 WebSocket 拒絕')), 3000);
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('message', event => {
      try { if (JSON.parse(event.data).type === 'hello_ok') { clearTimeout(timer); reject(new Error('錯誤共用密碼通過 WebSocket 驗證')); } } catch {}
    });
  });
  ws.send(JSON.stringify({ type: 'hello', ...hello }));
  await rejected;
}

const routes = await Promise.all(['/', '/team', '/admin'].map(get));
if (routes.some(({ body }) => !body.includes('<script'))) throw new Error('SPA 入口沒有載入前端腳本');
const initial = await get('/api/lobby');
if (initial.data.games.length !== 0) throw new Error('測試開始前不應有活動');

const badAuth = await request('/api/auth', { method: 'POST', body: JSON.stringify({ role: 'host', password: 'wrong' }) });
if (badAuth.response.status !== 401) throw new Error('錯誤主持人密碼未被拒絕');
const hostAuth = await request('/api/auth', { method: 'POST', body: JSON.stringify({ role: 'host', password: 'aaa' }) });
const teamAuth = await request('/api/auth', { method: 'POST', body: JSON.stringify({ role: 'team', password: 'iii' }) });
if (!hostAuth.response.ok || !teamAuth.response.ok) throw new Error('角色密碼驗證失敗');

const createdResponse = await request('/api/games', {
  method: 'POST',
  headers: { authorization: 'Bearer aaa' },
  body: JSON.stringify({ name: '本地單一活動測試', teamCount: 2 })
});
if (!createdResponse.response.ok) throw new Error(`建立活動失敗：${createdResponse.response.status}`);
const created = createdResponse.data;
if (!created.id || !created.hostToken || created.teamCount !== 2) throw new Error('建立活動回應欄位不完整');
if ('teamPins' in created) throw new Error('建立活動不應再產生隊伍 PIN');

const forgedControl = await request(`/ws/${encodeURIComponent(created.id)}`, { headers: { 'x-control-action': 'endGame' } });
if (forgedControl.response.status !== 426) throw new Error('公開 WebSocket 路由接受了偽造的內部控制標頭');
const afterForgedControl = await get('/api/lobby');
if (afterForgedControl.data.games[0]?.id !== created.id) throw new Error('偽造內部控制標頭意外關閉了活動');
if (afterForgedControl.data.games[0]?.teams?.length !== 2) throw new Error('公開大廳缺少快速選隊資料');
if (afterForgedControl.data.games[0].teams.some(team => team.joined)) throw new Error('尚未加入的隊伍被標示為已連線');

const host = await connect(created.id, { role: 'host', token: created.hostToken, accessToken: 'aaa' });
await expectRejected(created.id, { role: 'team', teamId: 0, accessToken: 'wrong' });
const team = await connect(created.id, { role: 'team', teamId: 0, accessToken: 'iii' });
const viewer = await connect(created.id, { role: 'viewer' });
if (team.welcome.state.teams[0].joined !== true) throw new Error('隊輔加入後狀態未同步');
if (viewer.welcome.state.teams.length !== 2) throw new Error('觀眾未收到遊戲狀態');

for (const [actionId, action, payload] of [
  ['assign-1', 'assignBases', {}],
  ['start-1', 'startGame', {}],
  ['points-1', 'adjustPts', { teamId: 0, amount: 50 }],
  ['phase-sell', 'nextPhase', {}],
  ['phase-shop', 'nextPhase', {}],
  ['phase-roll', 'nextPhase', {}],
]) {
  const result = await sendAndWait(host.ws, actionId, action, payload);
  if (result.type !== 'action_ok') throw new Error(`${action} 失敗：${result.error}`);
}
const firstAttackState = waitFor(viewer.ws, message => message.type === 'state' && message.state?.lastAttack?.kind === 'quake', '第一次特殊操作狀態');
const firstAttack = await sendAndWait(team.ws, 'attack-quake-1', 'attack', { kind: 'quake' });
if (firstAttack.type !== 'action_ok') throw new Error(`第一次特殊操作失敗：${firstAttack.error}`);
const afterFirstAttack = (await firstAttackState).state;
const pointsAfterAttack = afterFirstAttack.teams[0].pts;
const repeatedAttack = await sendAndWait(team.ws, 'attack-quake-2', 'attack', { kind: 'quake' });
if (repeatedAttack.type !== 'error' || !/本回合已使用過/.test(repeatedAttack.error || '')) throw new Error('同一隊同一招在同回合內未被伺服器拒絕');
const attackAudit = await connect(created.id, { role: 'viewer' });
if (attackAudit.welcome.state.teams[0].pts !== pointsAfterAttack) throw new Error('重複特殊操作仍扣除了諂媚點數');
if (attackAudit.welcome.state.log.filter(message => message.includes('發動「地震」')).length !== 1) throw new Error('重複特殊操作仍寫入遊戲紀錄');
attackAudit.ws.close();

const duplicateTeam = await connect(created.id, { role: 'team', teamId: 0, accessToken: 'iii' });
duplicateTeam.ws.close();
await new Promise(resolve => setTimeout(resolve, 150));
const presenceViewer = await connect(created.id, { role: 'viewer' });
if (presenceViewer.welcome.state.teams[0].joined !== true) throw new Error('關閉同隊其中一個分頁時錯誤標示為離線');
presenceViewer.ws.close();

const viewerState = waitFor(viewer.ws, message => message.type === 'state' && message.state?.teams?.[0]?.joined === false, '觀眾收到踢除同步');
host.ws.send(JSON.stringify({ type: 'action', actionId: 'kick-1', action: 'kickTeam', payload: { teamId: 0 } }));
await waitFor(team.ws, message => message.type === 'kicked', '隊輔 kicked');
await viewerState;

const hostState = waitFor(host.ws, message => message.type === 'state' && message.state?.phase === 'ended', '主持人收到 API 關閉同步');
const closed = await request(`/api/games/${encodeURIComponent(created.id)}/close`, { method: 'POST', headers: { authorization: 'Bearer aaa' }, body: '{}' });
if (!closed.response.ok) throw new Error(`API 關閉活動失敗：${closed.response.status}`);
await hostState;

const afterClose = await get('/api/lobby');
if (afterClose.data.games.length !== 0) throw new Error('活動關閉後仍出現在公開大廳');
const historyResponse = await request(`/api/games/${created.id}/history`, { headers: { authorization: 'Bearer aaa' } });
if (!historyResponse.response.ok) throw new Error(`歷史紀錄查詢失敗：${historyResponse.response.status}`);
const history = historyResponse.data;
if (!history.events.some(event => event.eventType === 'kickTeam')) throw new Error('D1 缺少 kickTeam 歷史事件');
if (!history.events.some(event => event.eventType === 'endGame')) throw new Error('D1 缺少 endGame 歷史事件');

for (const ws of [host.ws, team.ws, viewer.ws]) { try { ws.close(); } catch {} }
console.log('single-activity shared-password/reliability e2e test passed');
