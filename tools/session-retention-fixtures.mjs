import assert from 'node:assert/strict';
import '../session-retention.js';

const prefix = 'ig_follower_snapshot:';
const lastRun = `${prefix}lastRun`;
function fixture(initial = {}) {
  const data = structuredClone(initial);
  let failNext = false;
  const session = {
    async get() { return structuredClone(data); },
    async getBytesInUse(keys) {
      const selected = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return selected.reduce((size, key) => size + (data[key] ? Buffer.byteLength(JSON.stringify(data[key])) + key.length : 0), 0);
    },
    async remove(keys) { for (const key of keys) delete data[key]; },
    async set(patch) {
      if (failNext) { failNext = false; throw new Error('temporary-write-failure'); }
      Object.assign(data, structuredClone(patch));
    }
  };
  return { data, session, fail() { failNext = true; } };
}
const snapshot = (profile, day, padding = '') => ({ profile, collectedAt: `2026-09-${day}T00:00:00Z`, padding });
const patch = (profile, day) => ({ [prefix + profile]: snapshot(profile, day), [lastRun]: { ref: prefix + profile } });

const f = fixture({
  [prefix + 'old']: snapshot('old', '01'),
  [prefix + 'active']: snapshot('active', '02'),
  [prefix + 'recent']: snapshot('recent', '03'),
  'ig_run_progress:tab:7': { profile: 'active', stage: 'collecting_followers' },
  unrelated: { keep: true },
  [lastRun]: { ref: prefix + 'recent' }
});
const store = IGSessionRetention.createStore(f.session, { maxSnapshots: 3 });
assert.equal((await store.set(patch('new', '04'))).evictedCount, 1);
assert.equal(f.data[prefix + 'old'], undefined);
assert(f.data[prefix + 'active']);
assert(f.data.unrelated.keep);
assert(f.data[f.data[lastRun].ref]);
await Promise.all([store.set(patch('newer', '05')), store.set(patch('newest', '06'))]);
assert.equal(Object.keys(f.data).filter((key) => key.startsWith(prefix) && key !== lastRun).length, 3);
assert(f.data[prefix + 'active'], 'never evict a running profile');
assert.equal(f.data[lastRun].ref, prefix + 'newest');
f.fail();
await assert.rejects(store.set({ 'ig_run_progress:tab:8': { stage: 'starting' } }), /temporary/);
await store.set({ 'ig_run_progress:tab:8': { stage: 'finished' } });
assert.equal(f.data['ig_run_progress:tab:8'].stage, 'finished', 'failed writes do not poison queue');

const big = fixture({
  [prefix + 'old']: snapshot('old', '01', 'x'.repeat(2500)),
  [prefix + 'latest']: snapshot('latest', '02'),
  [lastRun]: { ref: prefix + 'latest' }
});
assert.equal((await IGSessionRetention.createStore(big.session, { budgetBytes: 1000 }).set(patch('current', '03'))).evictedCount, 1);
assert(big.data[big.data[lastRun].ref]);
assert.equal(big.data[prefix + 'old'], undefined, 'evict by total byte budget as well as count');
assert(await big.session.getBytesInUse(null) < 1000);

const failed = fixture({ ...patch('old', '01') });
failed.fail();
await assert.rejects(IGSessionRetention.createStore(failed.session, { maxSnapshots: 1 }).set(patch('new', '02')), /temporary/);
assert(!failed.data[lastRun] || failed.data[failed.data[lastRun].ref], 'failed replacement must not leave a dangling reference');

const pressure = fixture({
  [prefix + 'old']: snapshot('old', '01', 'x'.repeat(2500)),
  ...patch('latest', '02')
});
const set = pressure.session.set;
let quotaHit = false;
pressure.session.set = async (value) => {
  if (!quotaHit) { quotaHit = true; throw new Error('QUOTA_BYTES quota exceeded'); }
  return set(value);
};
const pressureResult = await IGSessionRetention.createStore(pressure.session, { budgetBytes: 1000 }).set({
  'ig_run_progress:tab:9': { profile: 'latest', stage: 'collecting_followers' }
});
assert.equal(pressureResult.evictedCount, 1);
assert(pressure.data[prefix + 'latest']);
assert(pressure.data[pressure.data[lastRun].ref]);
assert(pressure.data['ig_run_progress:tab:9']);
console.log('session retention fixtures passed');
