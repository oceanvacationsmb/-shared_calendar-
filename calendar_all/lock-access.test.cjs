const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function setup(saved, status = 200) {
  const storage = new Map(saved ? [['ocean_lock_staff_key_v1', saved]] : []);
  const button = { textContent: '', addEventListener() {} };
  const calls = [];
  const context = vm.createContext({
    localStorage: { getItem: k => storage.get(k), removeItem: k => storage.delete(k), setItem: (k,v) => storage.set(k,v) },
    LOCK_SNAPSHOT_CACHE_KEY: 'old', LOCK_REFRESH_DAY_KEY: 'day',
    lockRefreshStatus: { textContent: '' }, refreshLocksBtn: { disabled: false, addEventListener() {} },
    document: { getElementById: () => button }, setInterval() {}, AbortSignal,
    properties: [], lockStatuses: [], lockObservationTime: '', lockCapturedAt: 0,
    crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, Uint8Array,
    fetch: async (url, options) => { calls.push({ url, options }); return { status, ok: status === 200, json: async () => ({ capturedAt: new Date().toISOString(), locks: [] }) }; }
  });
  vm.runInContext(source.slice(source.indexOf('function applyLockSnapshot('), source.indexOf('async function loadSupportingData()')), context);
  return { context, storage, calls };
}
test('remembered device loads locks without a key prompt after refresh', async () => {
  const state = setup('test-only-secret');
  await vm.runInContext('initializeLocks()', state.context);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].options.headers.Authorization, 'Bearer test-only-secret');
});

test('encrypted last-good readings survive reload, an empty server, and failed requests', async () => {
  const state = setup('test-only-secret');
  const snapshot = { capturedAt: '2026-11-27T05:40:00.000Z', locks: [{ listingId: 'test-property', batteryPercent: 94, online: true }] };
  state.context.savedTest = snapshot;
  await vm.runInContext("lockViewKey = 'test-only-secret'; saveLockCache(savedTest, lockViewKey)", state.context);
  const cache = state.storage.get('ocean_lock_last_good_v2');
  assert.ok(cache);
  assert.equal(cache.includes('test-property'), false);
  state.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ capturedAt: null, locks: [], stale: true }) });
  await vm.runInContext('initializeLocks()', state.context);
  assert.equal(state.context.lockStatuses[0].batteryPercent, 94);
  assert.match(state.context.lockRefreshStatus.textContent, /STALE: last collected/);
  state.context.fetch = async () => { throw Error('Offline'); };
  await vm.runInContext('refreshLocks()', state.context);
  assert.equal(state.context.lockStatuses[0].online, true);
  assert.equal(state.storage.get('ocean_lock_last_good_v2'), cache);
});
test('a rejected stored key is removed; an unconfigured device sends no lock request', async () => {
  const rejected = setup('invalid-test-key', 401);
  await vm.runInContext('initializeLocks()', rejected.context);
  assert.equal(rejected.storage.has('ocean_lock_staff_key_v1'), false);
  const fresh = setup();
  await vm.runInContext('initializeLocks()', fresh.context);
  assert.equal(fresh.calls.length, 0);
});
