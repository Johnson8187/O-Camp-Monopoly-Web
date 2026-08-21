/**
 * Test Suite 1: Backend DO & Concurrency Verification Tests (Patched)
 */

import assert from 'node:assert/strict';
import { GameRoom } from '../../src/worker.js';
import { G } from '../../src/game-core.js';

console.log('='.repeat(70));
console.log('▶ RUNNING TEST SUITE 1: Backend DO & Concurrency Verification (Patched)');
console.log('='.repeat(70));

const PASSWORD_HASH = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('team_pass'))).toString('hex');
const ADMIN_HASH = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('admin_pass'))).toString('hex');

function createMockDOContext() {
  const store = new Map();
  const sockets = new Set();
  let alarmTime = null;

  const storage = {
    async get(key) {
      await new Promise(r => setTimeout(r, 2));
      return store.get(key);
    },
    async put(key, val) {
      await new Promise(r => setTimeout(r, 5));
      store.set(key, val);
    },
    async delete(key) { store.delete(key); },
    async deleteAll() { store.clear(); },
    async setAlarm(time) { alarmTime = time; },
    async deleteAlarm() { alarmTime = null; },
    _store: store,
    _getAlarm: () => alarmTime
  };

  return {
    storage,
    id: { toString: () => 'ROOM_REPRO_001' },
    blockConcurrencyWhile: async (fn) => await fn(),
    acceptWebSocket: (ws) => sockets.add(ws),
    getWebSockets: () => Array.from(sockets),
    _sockets: sockets
  };
}

function createMockEnv(opts = {}) {
  const queries = [];
  const dbStore = {
    games: new Map(),
    events: [],
    settings: new Map()
  };

  const DB = {
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...args) {
          this._params = args;
          return this;
        },
        async first() {
          queries.push({ type: 'first', sql, params: this._params });
          await new Promise(r => setTimeout(r, 5));
          if (sql.includes('FROM games WHERE id=')) {
            const id = this._params[0];
            const game = dbStore.games.get(id);
            if (!game) return null;
            return {
              id: game.id,
              name: game.name,
              status: game.status,
              team_count: game.teamCount,
              host_token_hash: game.hostTokenHash,
              state_json: JSON.stringify(game.state),
              updated_at: game.updatedAt || new Date().toISOString()
            };
          }
          if (sql.includes('SELECT value FROM system_settings')) {
            const key = this._params[0] || 'idle_timeout_ms';
            return { value: dbStore.settings.get(key) || '10800000' };
          }
          return null;
        },
        async all() {
          queries.push({ type: 'all', sql, params: this._params });
          await new Promise(r => setTimeout(r, 5));
          return { results: [] };
        },
        async run() {
          queries.push({ type: 'run', sql, params: this._params });
          await new Promise(r => setTimeout(r, 5));
          if (sql.includes('CREATE TABLE IF NOT EXISTS system_settings')) {
            return { success: true };
          }
          return { success: true };
        }
      };
    },
    async batch(statements) {
      queries.push({ type: 'batch', count: statements.length, sqls: statements.map(s => s._sql) });
      if (opts.failBatch) {
        throw new Error('D1_BATCH_WRITE_FAILED: SQLite database is locked / I/O timeout');
      }
      if (opts.batchDelayMs) {
        await new Promise(r => setTimeout(r, opts.batchDelayMs));
      } else {
        await new Promise(r => setTimeout(r, 10));
      }
      return statements.map(() => ({ success: true }));
    },
    _queries: queries,
    _dbStore: dbStore
  };

  return {
    DB,
    TEAM_PASSWORD_HASH: PASSWORD_HASH,
    ADMIN_PASSWORD_HASH: ADMIN_HASH
  };
}

function createMockSocket(role = 'team', teamId = 0) {
  let attachment = { role, teamId };
  const sent = [];
  let closed = false;
  let closeCode = null;
  let closeReason = null;

  return {
    sent,
    get closed() { return closed; },
    get closeCode() { return closeCode; },
    get closeReason() { return closeReason; },
    send(data) {
      sent.push(JSON.parse(data));
    },
    close(code, reason) {
      closed = true;
      closeCode = code;
      closeReason = reason;
    },
    deserializeAttachment() { return attachment; },
    serializeAttachment(val) { attachment = val; }
  };
}

// -----------------------------------------------------------------------------
// TEST 1.1: Concurrent Action Queue & Lifecycle Isolation (VULN-BE-01 & VULN-BE-04 -> FIXED)
// -----------------------------------------------------------------------------
async function testConcurrentActionQueue() {
  console.log('\n[TEST 1.1] Verifying Action Mutex Queue & Concurrency Isolation (VULN-BE-01, VULN-BE-04)...');

  const env = createMockEnv();
  const ctx = createMockDOContext();

  const initialState = G.freshState('ASYNC_RACE_TEST', 2);
  initialState.phase = 'roll';
  initialState.rev = 1;
  initialState.teams[0].cash = 2000;
  initialState.teams[1].cash = 2000;

  env.DB._dbStore.games.set('ROOM_REPRO_001', {
    id: 'ROOM_REPRO_001',
    name: '並發測試',
    status: 'running',
    teamCount: 2,
    hostTokenHash: ADMIN_HASH,
    state: initialState
  });

  const room = new GameRoom(ctx, env);
  await room.load();

  const hostWs = createMockSocket('host', null);
  ctx.acceptWebSocket(hostWs);

  // Send two concurrent actions simultaneously over WebSocket
  const p1 = room.webSocketMessage(hostWs, JSON.stringify({
    type: 'action',
    action: 'adjustCash',
    payload: { teamId: 0, amount: 500 },
    actionId: 'act-seq-001'
  }));

  const p2 = room.webSocketMessage(hostWs, JSON.stringify({
    type: 'action',
    action: 'adjustCash',
    payload: { teamId: 1, amount: 800 },
    actionId: 'act-seq-002'
  }));

  await Promise.all([p1, p2]);

  console.log(`  Team 0 Cash: ${room.state.teams[0].cash} (Expected: 2500)`);
  console.log(`  Team 1 Cash: ${room.state.teams[1].cash} (Expected: 2800)`);
  console.log(`  Final rev: ${room.state.rev} (Expected: 3)`);

  assert.equal(room.state.teams[0].cash, 2500, 'Team 0 modification must be preserved');
  assert.equal(room.state.teams[1].cash, 2800, 'Team 1 modification must be preserved');
  assert.equal(room.state.rev, 3, 'Revision must increment sequentially to 3');

  // Part B: Host endGame vs in-flight action
  await room.webSocketMessage(hostWs, JSON.stringify({
    type: 'action',
    action: 'endGame',
    actionId: 'act-end'
  }));

  assert.equal(room.state.phase, 'ended');

  const teamWs = createMockSocket('team', 1);
  ctx.acceptWebSocket(teamWs);

  await room.webSocketMessage(teamWs, JSON.stringify({
    type: 'action',
    action: 'roll',
    actionId: 'act-after-end'
  }));

  assert.equal(room.state.phase, 'ended', 'Ended game must not be modified by team action');
  const teamError = teamWs.sent.find(m => m.type === 'error');
  assert.ok(teamError, 'Team action in ended game must receive error');

  console.log('  ✔ VULN-BE-01 & VULN-BE-04 Successfully Patched: Mutex queue guarantees serial execution.');
}

// -----------------------------------------------------------------------------
// TEST 1.2: State Rollback on D1 Failure (VULN-BE-03 -> FIXED)
// -----------------------------------------------------------------------------
async function testStateRollbackOnD1Failure() {
  console.log('\n[TEST 1.2] Verifying State Rollback on D1 Failure (VULN-BE-03)...');

  const env = createMockEnv({ failBatch: true });
  const ctx = createMockDOContext();

  const initialState = G.freshState('ROLLBACK_TEST', 2);
  initialState.phase = 'roll';
  initialState.rev = 5;
  initialState.teams[0].cash = 2000;

  env.DB._dbStore.games.set('ROOM_REPRO_001', {
    id: 'ROOM_REPRO_001',
    name: '回滾測試',
    status: 'running',
    teamCount: 2,
    hostTokenHash: ADMIN_HASH,
    state: initialState
  });

  const room = new GameRoom(ctx, env);
  await room.load();

  const hostWs = createMockSocket('host', null);
  ctx.acceptWebSocket(hostWs);

  await room.webSocketMessage(hostWs, JSON.stringify({
    type: 'action',
    action: 'adjustCash',
    payload: { teamId: 0, amount: 1000 },
    actionId: 'fail-act-001'
  }));

  const errorMsg = hostWs.sent.find(m => m.type === 'error');
  assert.ok(errorMsg, 'Client must receive error');

  // Verify in-memory state was rolled back to 2000
  assert.equal(room.state.teams[0].cash, 2000, 'DO memory must be rolled back on D1 failure');
  console.log('  ✔ VULN-BE-03 Successfully Patched: In-memory state safely rolled back on DB failure.');
}

// -----------------------------------------------------------------------------
// TEST 1.3: Cached D1 Queries in WebSocket Path (VULN-BE-02 -> FIXED)
// -----------------------------------------------------------------------------
async function testD1QueryCaching() {
  console.log('\n[TEST 1.3] Verifying D1 Table Caching on WebSocket Messages (VULN-BE-02)...');

  const env = createMockEnv();
  const ctx = createMockDOContext();

  const initialState = G.freshState('QUERY_STORM_TEST', 2);
  initialState.phase = 'roll';
  initialState.teams[0].joined = true;

  env.DB._dbStore.games.set('ROOM_REPRO_001', {
    id: 'ROOM_REPRO_001',
    name: '查詢風暴測試',
    status: 'running',
    teamCount: 2,
    hostTokenHash: ADMIN_HASH,
    state: initialState
  });

  const room = new GameRoom(ctx, env);
  await room.load();

  env.DB._queries.length = 0;

  const teamWs = createMockSocket('team', 0);
  ctx.acceptWebSocket(teamWs);

  for (let i = 0; i < 5; i++) {
    await room.webSocketMessage(teamWs, JSON.stringify({ type: 'ping' }));
  }

  const ddlStatements = env.DB._queries.filter(q => q.sql.includes('CREATE TABLE IF NOT EXISTS'));
  console.log(`  DDL Statements executed: ${ddlStatements.length} queries`);
  assert.equal(ddlStatements.length, 0, 'No redundant DDL CREATE TABLE queries on cached requests');
  console.log('  ✔ VULN-BE-02 Successfully Patched: DDL table initialization is cached.');
}

// -----------------------------------------------------------------------------
// TEST 1.4: Action Idempotency Deduplication (VULN-BE-05 -> FIXED)
// -----------------------------------------------------------------------------
async function testActionDeduplication() {
  console.log('\n[TEST 1.4] Verifying Action Idempotency & Deduplication (VULN-BE-05)...');

  const env = createMockEnv();
  const ctx = createMockDOContext();

  const initialState = G.freshState('DEDUP_TEST', 2);
  initialState.phase = 'shop';
  initialState.teams[0].pts = 20;
  initialState.teams[0].buffs.pass = 0;

  env.DB._dbStore.games.set('ROOM_REPRO_001', {
    id: 'ROOM_REPRO_001',
    name: '重送測試',
    status: 'running',
    teamCount: 2,
    hostTokenHash: ADMIN_HASH,
    state: initialState
  });

  const room = new GameRoom(ctx, env);
  await room.load();

  const teamWs = createMockSocket('team', 0);
  ctx.acceptWebSocket(teamWs);

  const msg = JSON.stringify({
    type: 'action',
    action: 'buff',
    payload: { kind: 'pass' },
    actionId: 'client-tx-uuid-9999'
  });

  // First dispatch
  await room.webSocketMessage(teamWs, msg);
  assert.equal(room.state.teams[0].pts, 17, '3 points deducted on first dispatch');
  assert.equal(room.state.teams[0].buffs.pass, 1, '1 pass card received');

  // Duplicate network retry dispatch with the identical actionId
  await room.webSocketMessage(teamWs, msg);
  assert.equal(room.state.teams[0].pts, 17, 'Points not deducted again on retry');
  assert.equal(room.state.teams[0].buffs.pass, 1, 'Duplicate pass card not granted');

  console.log('  ✔ VULN-BE-05 Successfully Patched: Action idempotency cache deduplicates network retries.');
}

export async function runBackendConcurrencyTests() {
  await testConcurrentActionQueue();
  await testStateRollbackOnD1Failure();
  await testD1QueryCaching();
  await testActionDeduplication();
  console.log('\n✔ All Suite 1 Backend Concurrency Verification Tests Passed!\n');
}

if (process.argv[1]?.endsWith('test_r1_backend_concurrency.mjs')) {
  await runBackendConcurrencyTests();
}
