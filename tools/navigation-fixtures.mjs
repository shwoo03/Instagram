import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
const start = source.indexOf('async function reconcileTabNavigation(');
const end = source.indexOf('chrome.tabs.onUpdated.addListener', start);
assert(start >= 0 && end > start);
for (const [name, contextReply, stopped, removed] of [
  ['same profile modal', { runId: 'run-a', profile: 'owner' }, false, false],
  ['other profile same document', { runId: 'run-a', profile: 'other' }, true, false],
  ['document replaced', null, true, true]
]) {
  const calls = [];
  const attempt = {};
  const sandbox = vm.createContext({
    automaticCaptureAttempts: new Map([[7, attempt]]), devtoolsTabs: new Map(),
    getRunProgressKey: () => 'progress', schedulePersistDevtoolsTabs() {},
    debuggerController: { getSession: () => ({ runId: 'run-a', profile: 'owner' }), stop: async () => { calls.push('stop'); } },
    chrome: {
      tabs: { sendMessage: async () => { if (!contextReply) throw new Error('no receiver'); return contextReply; } },
      storage: { session: { get: async () => ({ progress: { runId: 'run-a', profile: 'owner' } }), remove: async () => { calls.push('remove'); } } }
    }
  });
  vm.runInContext(source.slice(start, end), sandbox);
  await sandbox.reconcileTabNavigation(7);
  assert.equal(calls.includes('stop'), stopped, name);
  assert.equal(calls.includes('remove'), removed, name);
}
console.log('same-document navigation fixtures passed');
