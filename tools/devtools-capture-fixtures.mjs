import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Event { listeners = []; addListener(fn) { this.listeners.push(fn); } emit(value) { for (const fn of this.listeners) fn(value); } }
const messages = [];
const onMessage = new Event();
const onRequestFinished = new Event();
const onNavigated = new Event();
const context = vm.createContext({ URL, TextDecoder, Uint8Array, atob, console: { log() {} }, setTimeout() {}, chrome: {
  runtime: { connect: () => ({ onMessage, onDisconnect: new Event(), postMessage: (item) => messages.push(item) }) },
  devtools: { inspectedWindow: { tabId: 7 }, network: { onRequestFinished, onNavigated }, panels: { create() {} } }
} });
for (const file of ['accuracy-engine.js', 'network-payload-parser.js', 'devtools.js']) vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
function request(startedDateTime) {
  let callback;
  onRequestFinished.emit({ request: { url: 'https://www.instagram.com/api/v1/friendships/123/followers/' }, response: { status: 200, content: { mimeType: 'application/json' } }, _resourceType: 'fetch', startedDateTime, getContent: (fn) => { callback = fn; } });
  return callback;
}
const older = request('2026-09-05T00:00:00Z');
const newer = request('2026-09-05T00:00:01Z');
newer(JSON.stringify({ users: [{ username: 'newer' }], has_more: false }));
older(JSON.stringify({ users: [{ username: 'older' }], has_more: true }));
const evidence = messages.filter((item) => item.type === 'IG_DEVTOOLS_USERNAMES');
assert.equal(evidence.length, 2);
assert(evidence[0].requestOrder > evidence[1].requestOrder);
for (const item of evidence) onMessage.emit({ type: 'IG_DEVTOOLS_ACK', seq: item.seq, ok: true });
assert.equal(messages.at(-1).captureHealth.followers.pendingCount, 0);
request('2026-09-05T00:00:02Z')('invalid JSON');
assert(messages.some((item) => item.failedMode === 'followers' && item.reason === 'response-parse-failed'));
const late = request('2026-09-05T00:00:03Z');
onNavigated.emit('https://www.instagram.com/other/');
late(JSON.stringify({ users: [{ username: 'stale' }], has_more: false }));
assert.equal(messages.filter((item) => item.type === 'IG_DEVTOOLS_USERNAMES').length, 2);
console.log('DevTools capture fixtures passed');
