import assert from 'node:assert/strict';
import worker, { isDoEnabled, setDoEnabled, verifyDevSecret } from './src/worker.js';

console.log('Running test-dev-dashboard.mjs...');

// 1. Test verifyDevSecret
assert.equal(await verifyDevSecret('8187', {}), true, '預設密碼 8187 應通過驗證');
assert.equal(await verifyDevSecret('wrong', {}), false, '錯誤密碼應被拒絕');
assert.equal(await verifyDevSecret('', {}), false, '空密碼應被拒絕');

// Test env.DEV_PASSWORD override
assert.equal(await verifyDevSecret('my-secret-pass', { DEV_PASSWORD: 'my-secret-pass' }), true);
assert.equal(await verifyDevSecret('wrong-pass', { DEV_PASSWORD: 'my-secret-pass' }), false);

// Test env.DEV_PASSWORD_HASH override
const customHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('custom123'))).toString('hex');
assert.equal(await verifyDevSecret('custom123', { DEV_PASSWORD_HASH: customHash }), true);
assert.equal(await verifyDevSecret('wrong', { DEV_PASSWORD_HASH: customHash }), false);

// 2. Test in-memory mock D1 for DO settings and Dev APIs
const mockTables = {
  system_settings: new Map(),
  games: new Map(),
  game_events: []
};

let eventSeq = 1;

function createMockDb() {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('SELECT value FROM system_settings')) {
                if (sql.includes("key='idle_timeout_ms'")) {
                  const row = mockTables.system_settings.get('idle_timeout_ms');
                  return row ? { value: row.value } : null;
                }
                const row = mockTables.system_settings.get('do_enabled');
                return row ? { value: row.value } : null;
              }
              if (sql.includes('SELECT COUNT(*) as cnt FROM games')) {
                let count = 0;
                for (const g of mockTables.games.values()) {
                  if (sql.includes("status IN ('lobby','running','paused')")) {
                    if (['lobby', 'running', 'paused'].includes(g.status)) count++;
                  } else if (sql.includes("status='ended'")) {
                    if (g.status === 'ended') count++;
                  } else {
                    count++;
                  }
                }
                return { cnt: count };
              }
              if (sql.includes('SELECT COUNT(*) as cnt FROM game_events')) {
                return { cnt: mockTables.game_events.length };
              }
              if (sql.includes('SELECT * FROM games WHERE id=?')) {
                return mockTables.games.get(params[0]) || null;
              }
              if (sql.includes('SELECT id, status FROM games WHERE id=?')) {
                const g = mockTables.games.get(params[0]);
                return g ? { id: g.id, status: g.status } : null;
              }
              if (sql.includes('SELECT created_at, event_type, message, game_id FROM game_events')) {
                const last = mockTables.game_events.at(-1);
                return last ? { created_at: last.created_at, event_type: last.event_type, message: last.message, game_id: last.game_id } : null;
              }
              if (sql.includes('SELECT id, name, status, team_count, updated_at, state_json FROM games')) {
                for (const g of mockTables.games.values()) {
                  if (['lobby', 'running', 'paused'].includes(g.status)) return g;
                }
                return null;
              }
              return null;
            },
            async all() {
              if (sql.includes('SELECT id FROM games')) {
                if (sql.includes("status='ended'")) {
                  return { results: [...mockTables.games.values()].filter(g => g.status === 'ended').map(g => ({ id: g.id })) };
                }
                return { results: [...mockTables.games.values()].map(g => ({ id: g.id })) };
              }
              if (sql.includes('SELECT id, name, status, team_count, created_at, updated_at, ended_at FROM games')) {
                return { results: [...mockTables.games.values()] };
              }
              if (sql.includes('SELECT id, game_id, event_type, actor_role, actor_team, message, payload_json, state_rev, created_at FROM game_events')) {
                let evs = [...mockTables.game_events];
                if (params.length && typeof params[0] === 'string') {
                  evs = evs.filter(e => e.game_id === params[0] || e.event_type === params[0] || e.actor_role === params[0]);
                }
                return { results: evs };
              }
              if (sql.includes('SELECT * FROM game_events WHERE game_id=?')) {
                return { results: mockTables.game_events.filter(e => e.game_id === params[0]) };
              }
              if (sql.includes('SELECT * FROM games')) {
                return { results: [...mockTables.games.values()] };
              }
              if (sql.includes('SELECT type, name FROM sqlite_master')) {
                return { results: [{ type: 'table', name: 'games' }, { type: 'table', name: 'game_events' }, { type: 'table', name: 'system_settings' }] };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
                return { success: true };
              }
              if (sql.includes('INSERT INTO system_settings')) {
                const key = sql.includes("'idle_timeout_ms'") ? 'idle_timeout_ms' : 'do_enabled';
                mockTables.system_settings.set(key, { key, value: String(params[0] ?? '1'), updated_at: new Date().toISOString() });
                return { success: true };
              }
              if (sql.includes('DELETE FROM games')) {
                for (const id of params) {
                  mockTables.games.delete(id);
                }
                return { success: true };
              }
              if (sql.includes('DELETE FROM game_events')) {
                mockTables.game_events = mockTables.game_events.filter(e => !params.includes(e.game_id));
                return { success: true };
              }
              return { success: true };
            }
          };
        },
        async first() {
          return this.bind().first();
        },
        async all() {
          return this.bind().all();
        },
        async run() {
          return this.bind().run();
        }
      };
    },
    async batch(statements) {
      for (const stmt of statements) {
        await stmt.run?.();
      }
      return [];
    }
  };
}

const mockEnv = {
  DB: createMockDb(),
  GAME_ROOMS: {
    idFromName: name => name,
    get: () => ({
      fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
  },
  ADMIN_PASSWORD_HASH: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('aaa'))).toString('hex'),
  TEAM_PASSWORD_HASH: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('iii'))).toString('hex'),
};

// Seed initial game data
mockTables.games.set('GAME1', {
  id: 'GAME1',
  name: '測試活動1',
  status: 'running',
  team_count: 4,
  host_token_hash: 'hash1',
  team_pin_hashes_json: '[]',
  state_json: JSON.stringify({ phase: 'roll', round: 2, paused: false, teams: [{ joined: true }, { joined: true }, { joined: false }, { joined: false }] }),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ended_at: null
});
mockTables.game_events.push({
  id: 1,
  game_id: 'GAME1',
  event_type: 'startGame',
  actor_role: 'host',
  actor_team: null,
  message: '遊戲開始',
  payload_json: '{}',
  state_rev: 1,
  created_at: new Date().toISOString()
});

// 3. Test DO Enable/Disable
assert.equal(await isDoEnabled(mockEnv), true, '預設 DO 應為開啟狀態');
await setDoEnabled(mockEnv, false);
assert.equal(await isDoEnabled(mockEnv), false, '設定 DO 為 false 後應為停用狀態');
await setDoEnabled(mockEnv, true);
assert.equal(await isDoEnabled(mockEnv), true, '設定 DO 為 true 後應恢復開啟狀態');

// 4. Test /api/dev/auth
const badAuthRes = await worker.fetch(new Request('https://example.test/api/dev/auth', {
  method: 'POST',
  body: JSON.stringify({ password: 'wrong' })
}), mockEnv);
assert.equal(badAuthRes.status, 401, '錯誤密碼應回傳 401');

const goodAuthRes = await worker.fetch(new Request('https://example.test/api/dev/auth', {
  method: 'POST',
  body: JSON.stringify({ password: '8187' })
}), mockEnv);
assert.equal(goodAuthRes.status, 200, '密碼 8187 應登入成功');
const authData = await goodAuthRes.json();
assert.equal(authData.ok, true);
assert.equal(authData.role, 'dev');

// 5. Test /api/dev/settings (GET & POST)
const settingsGetRes = await worker.fetch(new Request('https://example.test/api/dev/settings', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(settingsGetRes.status, 200);
const settingsData = await settingsGetRes.json();
assert.equal(settingsData.doEnabled, true);
assert.equal(settingsData.idleTimeoutHours, 3, '預設閒置時間應為 3 小時');

// Test adjusting idleTimeoutHours via API
const timeoutPostRes = await worker.fetch(new Request('https://example.test/api/dev/settings', {
  method: 'POST',
  headers: { authorization: 'Bearer 8187', 'content-type': 'application/json' },
  body: JSON.stringify({ idleTimeoutHours: 5 })
}), mockEnv);
assert.equal(timeoutPostRes.status, 200);
const timeoutPostData = await timeoutPostRes.json();
assert.equal(timeoutPostData.idleTimeoutHours, 5, '應成功設定閒置時間為 5 小時');

// Toggle DO off via API
const settingsPostRes = await worker.fetch(new Request('https://example.test/api/dev/settings', {
  method: 'POST',
  headers: { authorization: 'Bearer 8187', 'content-type': 'application/json' },
  body: JSON.stringify({ doEnabled: false })
}), mockEnv);
assert.equal(settingsPostRes.status, 200);
assert.equal((await settingsPostRes.json()).doEnabled, false);
assert.equal(await isDoEnabled(mockEnv), false);

// 6. Test DO Protection when disabled
const blockedCreateRes = await worker.fetch(new Request('https://example.test/api/games', {
  method: 'POST',
  headers: { authorization: 'Bearer aaa', 'content-type': 'application/json' },
  body: JSON.stringify({ name: '新活動', teamCount: 2 })
}), mockEnv);
assert.equal(blockedCreateRes.status, 503, 'DO 停用時建立活動應回傳 503');
const blockedCreateBody = await blockedCreateRes.json();
assert.match(blockedCreateBody.error, /DO 服務停用中/);

const blockedWsRes = await worker.fetch(new Request('https://example.test/ws/GAME1', {
  headers: { Upgrade: 'websocket' }
}), mockEnv);
assert.equal(blockedWsRes.status, 503, 'DO 停用時 WebSocket 連線應回傳 503');

// Re-enable DO
await setDoEnabled(mockEnv, true);

// 7. Test /api/dev/overview
const overviewRes = await worker.fetch(new Request('https://example.test/api/dev/overview', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(overviewRes.status, 200);
const overviewData = await overviewRes.json();
assert.equal(overviewData.ok, true);
assert.equal(overviewData.doEnabled, true);
assert.equal(overviewData.stats.totalGames >= 1, true);
assert.equal(overviewData.stats.activeGames >= 1, true);
assert.equal(overviewData.activeGame.id, 'GAME1');

// 8. Test /api/dev/games
const gamesRes = await worker.fetch(new Request('https://example.test/api/dev/games', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(gamesRes.status, 200);
const gamesData = await gamesRes.json();
assert.equal(gamesData.ok, true);
assert.equal(gamesData.games.length >= 1, true);

// 9. Test /api/dev/games/:id
const gameDetailRes = await worker.fetch(new Request('https://example.test/api/dev/games/GAME1', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(gameDetailRes.status, 200);
const gameDetailData = await gameDetailRes.json();
assert.equal(gameDetailData.game.id, 'GAME1');
assert.equal(gameDetailData.state.phase, 'roll');

// 10. Test /api/dev/events
const eventsRes = await worker.fetch(new Request('https://example.test/api/dev/events?gameId=GAME1', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(eventsRes.status, 200);
const eventsData = await eventsRes.json();
assert.equal(eventsData.events.length >= 1, true);
assert.equal(eventsData.events[0].eventType, 'startGame');

// 11. Test /api/dev/sql
const sqlRes = await worker.fetch(new Request('https://example.test/api/dev/sql', {
  method: 'POST',
  headers: { authorization: 'Bearer 8187', 'content-type': 'application/json' },
  body: JSON.stringify({ sql: 'SELECT * FROM games;' })
}), mockEnv);
assert.equal(sqlRes.status, 200);
const sqlData = await sqlRes.json();
assert.equal(sqlData.ok, true);
assert.equal(sqlData.results.length >= 1, true);

// 12. Test /api/dev/export/:id
const exportRes = await worker.fetch(new Request('https://example.test/api/dev/export/GAME1', {
  headers: { authorization: 'Bearer 8187' }
}), mockEnv);
assert.equal(exportRes.status, 200);
const exportData = await exportRes.json();
assert.equal(exportData.ok, true);
assert.equal(exportData.game.id, 'GAME1');
assert.equal(Array.isArray(exportData.events), true);

// 13. Test Unauthorized access blocked
const unauthRes = await worker.fetch(new Request('https://example.test/api/dev/overview', {
  headers: { authorization: 'Bearer wrong-token' }
}), mockEnv);
assert.equal(unauthRes.status, 401, '無效 Token 應被拒絕');

// 14. Test /api/dev/cleanup with retainDays = 0 and wipeAll
// Add an ended game to mockTables
mockTables.games.set('GAME_ENDED', { id: 'GAME_ENDED', name: '已結束場次', status: 'ended', updated_at: new Date().toISOString() });
mockTables.game_events.push({ id: 2, game_id: 'GAME_ENDED', event_type: 'endGame', message: '結束' });

const cleanupEndedRes = await worker.fetch(new Request('https://example.test/api/dev/cleanup', {
  method: 'POST',
  headers: { authorization: 'Bearer 8187', 'content-type': 'application/json' },
  body: JSON.stringify({ retainDays: 0 })
}), mockEnv);
assert.equal(cleanupEndedRes.status, 200);
const cleanupEndedData = await cleanupEndedRes.json();
assert.equal(cleanupEndedData.deletedGamesCount >= 1, true, 'retainDays: 0 應成功刪除已結束場次');
assert.equal(mockTables.games.has('GAME_ENDED'), false, '已結束活動應已被刪除');

// Test wipeAll
const wipeRes = await worker.fetch(new Request('https://example.test/api/dev/cleanup', {
  method: 'POST',
  headers: { authorization: 'Bearer 8187', 'content-type': 'application/json' },
  body: JSON.stringify({ wipeAll: true })
}), mockEnv);
assert.equal(wipeRes.status, 200);
const wipeData = await wipeRes.json();
assert.equal(wipeData.deletedGamesCount >= 1, true, 'wipeAll 應刪除所有活動');
assert.equal(mockTables.games.size, 0, '所有活動應被清空');

console.log('All dev dashboard API & DO toggle tests passed successfully!');
