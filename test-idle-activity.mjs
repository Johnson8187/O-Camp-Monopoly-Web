const base = process.env.TEST_BASE || 'http://127.0.0.1:8787';
const waitMs = Number(process.env.IDLE_TEST_WAIT_MS || 3000);

async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  return { response, data };
}

const created = await request('/api/games', {
  method: 'POST',
  headers: { authorization: 'Bearer aaa' },
  body: JSON.stringify({ name: '閒置自動關閉測試', teamCount: 2 })
});
if (!created.response.ok) throw new Error(`建立閒置測試活動失敗：${created.response.status}`);
if (!created.data?.id) throw new Error('閒置測試活動缺少 id');

await new Promise(resolve => setTimeout(resolve, waitMs));

const lobby = await request('/api/lobby');
if (!lobby.response.ok) throw new Error(`閒置後查詢大廳失敗：${lobby.response.status}`);
if (lobby.data.games?.length) throw new Error('閒置活動未被自動關閉');

const history = await request(`/api/games/${encodeURIComponent(created.data.id)}/history`, {
  headers: { authorization: 'Bearer aaa' }
});
if (!history.response.ok) throw new Error(`閒置活動歷史查詢失敗：${history.response.status}`);
if (!history.data.events?.some(event => event.eventType === 'idleTimeout')) throw new Error('D1 缺少 idleTimeout 歷史事件');

console.log(`idle auto-close test passed after ${waitMs}ms`);
