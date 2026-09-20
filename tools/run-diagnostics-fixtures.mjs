import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('run-diagnostics.js'), context);
vm.runInContext(read('result-insights.js'), context);
const diagnostics = context.IGRunDiagnostics;
const plain = (value) => JSON.parse(JSON.stringify(value));

const input = {
  rateLimit: { count: 1, pausedUntilMs: 61000, raw: 'private' },
  capture: { followers: { pendingCount: 2, failures: { invalid_payload: 3, raw: 'private', cookie: 4 } } },
  raw: 'private'
};
const sanitized = diagnostics.sanitize(input);
assert(!JSON.stringify(sanitized).includes('private'));
assert(!JSON.stringify(sanitized).includes('cookie'));
assert.deepEqual(plain(diagnostics.sanitize(sanitized)), plain(sanitized), 'repeated sanitization preserves diagnostics');
assert.match(diagnostics.cooldownText(input, true, 1000), /60초/);
assert.match(diagnostics.cooldownText(input, true, 11000), /50초/, 'reopened popup uses absolute deadline');
assert.equal(diagnostics.cooldownText(input, false, 1000), '', 'terminal runs must never show resumption');
assert.equal(diagnostics.cooldownText(input, true, 61000), '');
assert.equal(diagnostics.cooldownText({ rateLimit: { count: 0, pausedUntilMs: 61000 } }, true, 1000), '');
assert.equal(diagnostics.sanitize({ rateLimit: { pausedUntilMs: Infinity } }).rateLimit.pausedUntilMs, 0);
assert.equal(diagnostics.sanitizeFailures({ invalid_payload: Infinity }).invalid_payload, undefined);
assert.equal(diagnostics.sanitizeFailures({ invalid_payload: 1e20 }).invalid_payload, 1000000);
assert.equal(diagnostics.failureCode('raw private error'), 'capture_failed');
assert.equal(diagnostics.failureCode('invalid-json'), 'invalid_payload');
assert.match(diagnostics.messages(input).join(' '), /응답 해석 실패 3건/);
assert.match(diagnostics.messages(input).join(' '), /단정하지 않습니다/);

const combined = diagnostics.fromCaptureHealth({}, {
  debugger: { followers: { pendingCount: 1, failedCount: 3, failureReasons: { body_unavailable: 2 } } },
  devtools: { followers: { pendingCount: 2, failedCount: 1, failureReasons: { invalid_payload: 1 } } }
});
assert.deepEqual(plain(combined.capture.followers), {
  pendingCount: 3, failures: { body_unavailable: 2, invalid_payload: 1, capture_failed: 1 }
});

// Exercise the collector -> relay -> stored progress boundary, not only UI input mocks.
const background = read('background.js');
vm.runInContext(background.slice(background.indexOf('function getValidTabId('), background.indexOf('function storeRunProgress(')), context);
vm.runInContext(background.slice(background.indexOf('function sanitizeCaptureHealth('), background.indexOf('function relayDebuggerPayload(')), context);
vm.runInContext(background.slice(background.indexOf('function buildRelayPayload('), background.indexOf('function relayDevtoolsMessageToTab(')), context);
vm.runInContext(read('account-list-contract.js'), context);
const collector = read('main.js');
const progressMessages = [];
Object.assign(context, {
  getStrictUsers: () => [], getAssistedUsers: () => [], getUnconfirmedCandidates: () => [],
  getListCompletionAssessment: () => ({ state: 'PARTIAL', reasons: ['expected_count_unknown'] }),
  getProfileKey: () => 'synthetic_profile', isDevtoolsBridgeFresh: () => false,
  isDebuggerBridgeReady: () => false, hasConfirmedNetworkEvidence: () => false,
  window: { __igFollowerRunInProgress: true },
  chrome: { runtime: { sendMessage: (message, callback) => { progressMessages.push(message); callback(); } } },
  recordRunEvent() {}, console: { log() {} }
});
vm.runInContext(`${collector.slice(0, collector.indexOf('    function isVerboseLogging('))}
globalThis.progressFixture = { state, buildRunProgress, registerRateLimitSignal, cancel: () => { cancellationRequested = true; } }; }`, context);
const { state, buildRunProgress } = context.progressFixture;
state.rateLimit = input.rateLimit;
state.captureHealth.debugger.followers = { failedCount: 1, failureReasons: { body_unavailable: 1 } };
for (const expected of [null, 0, 100]) {
  state.expectedCounts.followers = expected;
  const progress = context.sanitizeRunProgress(buildRunProgress('collecting_followers', 'running', { status: 'running' }), 7);
  assert.equal(progress.counts.followers.expected, expected);
  assert.equal(progress.diagnostics.capture.followers.failures.body_unavailable, 1);
  assert.equal(progress.diagnostics.rateLimit.pausedUntilMs, 61000);
}
for (const expected of [undefined, '', NaN, -1]) assert.equal(context.sanitizeProgressList({ expected }).expected, null);
const health = context.sanitizeCaptureHealth({ followers: { failedCount: 1, failureReasons: { invalid_payload: 1, raw: 'private' } } });
assert.deepEqual(plain(health.followers.failureReasons), { invalid_payload: 1 });
const relay = context.buildRelayPayload({ type: 'IG_DEVTOOLS_STATUS', failedMode: 'followers', failureReason: 'invalid-json' });
assert.equal(relay.failureReason, 'invalid_payload');
assert.equal(relay.failedMode, 'followers');
state.rateLimit = { count: 0, lastDetectedAtMs: 0, pausedUntilMs: 0 };
context.progressFixture.registerRateLimitSignal('devtools');
assert.equal(progressMessages.length, 1, '429 publishes immediately, even before another scroll tick');
assert.equal(progressMessages[0].progress.diagnostics.rateLimit.count, 1);
context.progressFixture.registerRateLimitSignal('debugger');
assert.equal(progressMessages.length, 1, 'duplicate 429 observations do not extend the pause');
context.progressFixture.cancel();
state.rateLimit.lastDetectedAtMs = 0;
context.progressFixture.registerRateLimitSignal('devtools');
assert.equal(progressMessages.length, 1, 'late rate limits cannot overwrite cancellation');
console.log('run diagnostics and progress relay fixtures passed');
