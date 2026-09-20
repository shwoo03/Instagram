import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const context = vm.createContext({});
for (const name of ['accuracy-engine.js', 'account-list-contract.js', 'run-diagnostics.js', 'result-insights.js']) vm.runInContext(read(name), context);
const api = context.IGResultInsights;
assert.equal(api.username(' @Some.User '), 'some.user');
for (const name of ['https://instagram.com/name', 'a b', '<script>', 'a'.repeat(31), null]) assert.equal(api.username(name), '');
for (const [followers, following, expected] of [[true, true, 'mutual'], [true, false, 'followers_only'], [false, true, 'following_only'], [false, false, 'not_observed']]) {
  const evidence = { followers: { exact: followers }, following: { exact: following } };
  assert.equal(api.lookupResult({ complete: true, evidence }).category, expected);
  assert.equal(api.lookupResult({ complete: false, evidence }).category, 'insufficient');
  assert.equal(api.lookupResult({ complete: 'true', evidence }).category, 'insufficient');
}

const engine = context.IGAccuracyEngine;
const completion = engine.assessListCompletion({ expectedCount: 2, confirmedCount: 2, debuggerExactPayloadCount: 1 });
const pending = engine.assessListCompletion({ expectedCount: 2, confirmedCount: 2, debuggerExactPayloadCount: 1, capturePendingCount: 1 });
const sanitized = api.sanitizeCompletion({ followers: completion, following: pending });
assert.equal(sanitized.followers.state, 'CONFIRMED_EXACT_COUNT');
assert.equal(sanitized.following.state, 'PARTIAL');
assert.equal(sanitized.following.capturePendingCount, 1);
assert.match(api.completionText(sanitized.following), /처리 중/);
assert.match(api.completionText(null), /이전 결과/);
assert.equal(JSON.stringify(api.sanitizeCompletion(sanitized)), JSON.stringify(sanitized));
const privateText = 'private_account_or_cookie';
const copy = JSON.stringify(api.diagnostic({
  profile: privateText, runId: privateText, warnings: [privateText], timeline: [{ code: privateText }],
  stage: privateText, status: privateText, updatedAt: privateText, accounts: [privateText],
  counts: { followers: { expected: null, confirmed: 0, raw: privateText } },
  completion: { followers: { ...completion, reasons: [privateText, `unsafe_end_reason:${privateText}`] } },
  verdict: { code: privateText, reasons: [privateText] }, diagnostics: { raw: privateText }
}));
assert(!copy.includes(privateText));
assert.equal(JSON.parse(copy).counts.followers.expected, null);
assert.equal(JSON.parse(copy).counts.followers.confirmed, 0);

// Actual collector handler with synthetic full in-memory lists, not UI categories.
const collector = read('main.js');
Object.assign(context, {
  state: { runId: 'run-1', runProfile: 'profile' },
  cancellationRequested: false,
  window: { __igFollowerActiveRunId: 'run-1', __igFollowerRunInProgress: false,
    __igFollowerResult: { runId: 'run-1', profile: 'profile', trustVerdict: { code: 'CONFIRMED' }, diffs: {} } },
  getProfileKey: () => 'profile',
  getStrictUsers: (mode) => mode === 'followers' ? ['both'] : ['both', ...Array.from({ length: 1501 }, (_, i) => `large_${i}`)],
  getAssistedUsers: () => ['candidate'], getUnconfirmedCandidates: () => ['candidate'],
  buildCanonicalTrustSnapshot: () => ({ verdict: { code: 'CONFIRMED' } })
});
vm.runInContext(collector.slice(collector.indexOf('    function lookupAccount('), collector.indexOf('    function installExtensionMessageBridge(')), context);
const query = { runId: 'run-1', profile: 'profile', username: 'large_1500' };
assert.equal(context.lookupAccount(query).category, 'following_only', 'full memory lookup beyond saved 1000');
assert.equal(context.lookupAccount({ ...query, username: 'both' }).category, 'mutual');
assert.equal(context.lookupAccount({ ...query, runId: 'old' }).ok, false);
assert.equal(context.lookupAccount({ ...query, profile: 'other' }).ok, false);
context.window.__igFollowerRunInProgress = true;
assert.equal(context.lookupAccount(query).category, 'insufficient');
context.window.__igFollowerRunInProgress = false;
context.cancellationRequested = true;
assert.equal(context.lookupAccount(query).category, 'insufficient');
context.cancellationRequested = false;
context.window.__igFollowerResult.trustVerdict.code = 'REFERENCE_ONLY';
assert.equal(context.lookupAccount(query).category, 'insufficient');
assert.equal(context.lookupAccount({ ...query, username: 'candidate' }).evidence.followers.observed, true);
context.window.__igFollowerResult = undefined;
assert.equal(context.lookupAccount(query).category, 'insufficient');
context.getProfileKey = () => 'other';
assert.equal(context.lookupAccount(query).ok, false);
context.getProfileKey = () => 'profile';
context.window.__igFollowerActiveRunId = 'new';
assert.equal(context.lookupAccount(query).ok, false);

// Real relay sanitizer and lookup boundary: fixed fields, UI-only, matching binding.
const background = read('background.js');
vm.runInContext(background.slice(background.indexOf('function getValidTabId('), background.indexOf('function storeRunProgress(')), context);
vm.runInContext(background.slice(background.indexOf('async function lookupAccountFromUi('), background.indexOf('chrome.runtime.onMessage.addListener(')), context);
let calls = 0;
context.chrome = { runtime: { getURL: (file) => `chrome-extension://test/${file}` }, tabs: {
  sendMessage: async (_tabId, request) => { calls++; return { ok: true, ...request, complete: true,
    evidence: { following: { exact: true } }, raw: privateText }; }
} };
const request = { ...query, tabId: 7, username: '@LARGE_1500' };
const sender = { url: 'chrome-extension://test/popup.html' };
const response = await context.lookupAccountFromUi(request, sender);
assert.equal(response.category, 'following_only');
assert.equal(response.username, 'large_1500');
assert(!JSON.stringify(response).includes(privateText));
for (const invalidSender of [{ url: 'https://www.instagram.com/profile/' }, { ...sender, tab: { id: 7 } }, {}]) {
  assert.equal((await context.lookupAccountFromUi(request, invalidSender)).ok, false);
}
assert.equal((await context.lookupAccountFromUi({ ...request, tabId: null }, sender)).ok, false);
assert.equal(calls, 1, 'invalid requests never reach the tab');
context.chrome.tabs.sendMessage = async () => ({ ...response, runId: 'other' });
assert.equal((await context.lookupAccountFromUi(request, sender)).ok, false);
context.chrome.tabs.sendMessage = async () => { throw new Error('gone'); };
assert.equal((await context.lookupAccountFromUi(request, sender)).error, 'collector-unavailable');
const progress = context.sanitizeRunProgress({ completion: sanitized, counts: {} }, 7);
assert.equal(progress.completion.followers.state, 'CONFIRMED_EXACT_COUNT');
assert.equal(progress.completion.following.capturePendingCount, 1);
assert.equal(progress.completion.following.evidence.debuggerExactPayloadCount, 1);
console.log('result insights: full-memory lookup, binding, completion, relay and copy privacy passed');
