const base = process.env.TEST_BASE || 'http://127.0.0.1:8787';

async function get(path) {
  const response = await fetch(base + path);
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return { response, body };
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

const routes = await Promise.all(['/', '/team', '/admin'].map(get));
if (routes.some(({ body }) => !body.includes('<script'))) throw new Error('SPA 入口沒有載入前端腳本');
const initial = await get('/api/lobby');
if (JSON.parse(initial.body).games.length !== 0) throw new Error('測試開始前不應有活動');

const createdResponse = await fetch(base + '/api/games', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: '本地單一活動測試', teamCount: 2 })
});
if (!createdResponse.ok) throw new Error(`建立活動失敗：${createdResponse.status}`);
const created = await createdResponse.json();
if (!created.id || !created.hostToken || created.teamPins?.length !== 2) throw new Error('建立活動回應欄位不完整');

const host = await connect(created.id, { role: 'host', token: created.hostToken });
const team = await connect(created.id, { role: 'team', teamId: 0, token: created.teamPins[0] });
const viewer = await connect(created.id, { role: 'viewer' });
if (team.welcome.state.teams[0].joined !== true) throw new Error('隊輔加入後狀態未同步');
if (viewer.welcome.state.teams.length !== 2) throw new Error('觀眾未收到遊戲狀態');

const viewerState = waitFor(viewer.ws, message => message.type === 'state' && message.state?.teams?.[0]?.joined === false, '觀眾收到踢除同步');
host.ws.send(JSON.stringify({ type: 'action', action: 'kickTeam', payload: { teamId: 0 } }));
await waitFor(team.ws, message => message.type === 'kicked', '隊輔 kicked');
await viewerState;

const hostState = waitFor(host.ws, message => message.type === 'state' && message.state?.phase === 'ended', '主持人收到結束同步');
host.ws.send(JSON.stringify({ type: 'action', action: 'endGame', payload: {} }));
await hostState;

const historyResponse = await fetch(`${base}/api/games/${created.id}/history`, { headers: { authorization: `Bearer ${created.hostToken}` } });
if (!historyResponse.ok) throw new Error(`歷史紀錄查詢失敗：${historyResponse.status}`);
const history = await historyResponse.json();
if (!history.events.some(event => event.eventType === 'kickTeam')) throw new Error('D1 缺少 kickTeam 歷史事件');
if (!history.events.some(event => event.eventType === 'endGame')) throw new Error('D1 缺少 endGame 歷史事件');

for (const ws of [host.ws, team.ws, viewer.ws]) { try { ws.close(); } catch {} }
console.log('single-activity e2e test passed');
