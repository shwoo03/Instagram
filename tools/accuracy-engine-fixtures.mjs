import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../accuracy-engine.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { filename: 'accuracy-engine.js' });
const engine = context.IGAccuracyEngine;
vm.runInContext(source, context, { filename: 'accuracy-engine.js' });

assert(engine, 'IGAccuracyEngine global was not installed');
assert.equal(context.IGAccuracyEngine, engine, 'classic script installation must be idempotent');
assert.equal(Object.isFrozen(engine), true, 'IGAccuracyEngine namespace must be frozen');
assert.deepEqual(
  Object.keys(engine).sort(),
  [
    'assessListCompletion',
    'buildTrustVerdict',
    'classifyEvidence',
    'compareStrictSets',
    'extractPaginationEvidence',
    'parseDisplayedCount',
    'validateCompareIntegrity'
  ]
);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepEqual(plain(engine.parseDisplayedCount([
  { text: '팔로워 1.2K명', source: 'visible-label' },
  { text: '팔로워 1,234명', source: 'aria-label' }
])), {
  value: 1234,
  exact: true,
  source: 'aria-label',
  notation: '1,234',
  reason: 'exact-count'
});

assert.deepEqual(plain(engine.parseDisplayedCount({ text: '팔로워 1 234명', source: 'title' })), {
  value: 1234,
  exact: true,
  source: 'title',
  notation: '1 234',
  reason: 'exact-count'
});
assert.equal(engine.parseDisplayedCount('1.2K').value, 1200);
assert.equal(engine.parseDisplayedCount('1.2K').exact, false);
assert.equal(engine.parseDisplayedCount('1.2만').value, 12000);
assert.equal(engine.parseDisplayedCount('1.2만').exact, false);
assert.equal(engine.parseDisplayedCount('2천').value, 2000);
assert.equal(engine.parseDisplayedCount('3억').value, 300000000);
assert.equal(engine.parseDisplayedCount('1.2').value, null, 'ambiguous decimal must not become 1');
assert.equal(engine.parseDisplayedCount('1,2,3').value, null);
assert.equal(engine.parseDisplayedCount('팔로워 123 팔로잉 456').reason, 'multiple-counts');
assert.equal(engine.parseDisplayedCount([
  { text: '123', source: 'aria-label' },
  { text: '124', source: 'aria-label' }
]).reason, 'conflicting-counts');

assert.deepEqual(plain(engine.extractPaginationEvidence({
  users: [{ username: 'one' }],
  has_more: false,
  next_max_id: null
})), {
  paginationRecognized: true,
  hasMore: false,
  terminal: true,
  terminalReason: 'has_more_false',
  itemCount: 1
});

assert.deepEqual(plain(engine.extractPaginationEvidence({
  data: {
    user: {
      edge_followed_by: {
        edges: [{ node: { username: 'one' } }],
        page_info: { has_next_page: true, end_cursor: 'redacted-by-caller' }
      }
    }
  }
})), {
  paginationRecognized: true,
  hasMore: true,
  terminal: false,
  terminalReason: 'has_next_page_true',
  itemCount: 1
});

assert.equal(engine.extractPaginationEvidence({ users: [], next_max_id: null }).paginationRecognized, false);
assert.equal(engine.extractPaginationEvidence({ profile: { has_more: false } }).paginationRecognized, false);
assert.equal(engine.extractPaginationEvidence({
  users: [{ username: 'target' }],
  suggestions: { items: [{ username: 'suggested' }], has_more: false }
}).paginationRecognized, false, 'nested suggestion pagination must not terminate the target list');
assert.equal(engine.extractPaginationEvidence({
  users: [],
  has_more: false,
  page_info: { has_next_page: true }
}).terminalReason, 'conflicting_pagination_signals');
assert.equal(engine.classifyEvidence({
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 1,
  pageNetworkExactPayloadCount: 10,
  domEvidenceCount: 50
}).code, 'DEVTOOLS_EXACT');
assert.equal(engine.classifyEvidence({
  pageNetworkExactPayloadCount: 1,
  domEvidenceCount: 50
}).code, 'PAGE_NETWORK_ASSISTED');
assert.equal(engine.classifyEvidence({ domEvidenceCount: 50 }).code, 'DOM_PREVIEW');

const exactCount = engine.parseDisplayedCount({ text: '287', source: 'aria-label' });
const exactCompletion = engine.assessListCompletion({
  expectedCount: exactCount,
  confirmedCount: 287,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4
});
assert.equal(exactCompletion.state, 'CONFIRMED_EXACT_COUNT');

const terminalSmallGap = engine.assessListCompletion({
  expectedCount: exactCount,
  confirmedCount: 285,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4,
  pagination: { paginationRecognized: true, terminal: true },
  domEndObserved: true,
  endReason: 'stalled_at_list_end',
  nonDomCandidateCount: 0
});
assert.equal(terminalSmallGap.state, 'CONFIRMED_NETWORK_END');

const unprovenSmallGap = engine.assessListCompletion({
  expectedCount: exactCount,
  confirmedCount: 285,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4,
  pagination: { paginationRecognized: true, terminal: false },
  domEndObserved: true,
  endReason: 'stalled_at_list_end',
  nonDomCandidateCount: 0
});
assert.equal(unprovenSmallGap.state, 'PARTIAL');
assert(unprovenSmallGap.reasons.includes('pagination_terminal_not_proven'));

const candidateBlockedSmallGap = engine.assessListCompletion({
  expectedCount: exactCount,
  confirmedCount: 285,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4,
  pagination: { paginationRecognized: true, terminal: true },
  domEndObserved: true,
  endReason: 'stalled_at_list_end',
  nonDomCandidateCount: 1
});
assert.equal(candidateBlockedSmallGap.state, 'PARTIAL');

const approximateTarget = engine.assessListCompletion({
  expectedCount: engine.parseDisplayedCount('1.2K'),
  confirmedCount: 1200,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4,
  pagination: { paginationRecognized: true, terminal: true },
  domEndObserved: true,
  endReason: 'stalled_at_list_end'
});
assert.equal(approximateTarget.state, 'PARTIAL', 'approximate displayed count must not confirm a list');

const domOnly = engine.assessListCompletion({
  expectedCount: exactCount,
  assistedTotalCount: 287,
  domEvidenceCount: 287,
  domEndObserved: true,
  endReason: 'stalled_at_list_end'
});
assert.equal(domOnly.state, 'ASSISTED_COMPLETE');
assert.equal(domOnly.strictComplete, false);

const connectedNoPayload = engine.assessListCompletion({
  expectedCount: exactCount,
  assistedTotalCount: 287,
  domEvidenceCount: 287,
  devtoolsConnected: true,
  domEndObserved: true
});
assert.equal(connectedNoPayload.state, 'RETRY_REQUIRED');

const devtoolsCandidatesOnly = engine.assessListCompletion({
  expectedCount: exactCount,
  assistedTotalCount: 287,
  domEvidenceCount: 287,
  devtoolsConnected: true,
  devtoolsCandidatePayloadCount: 1,
  domEndObserved: true
});
assert.equal(devtoolsCandidatesOnly.state, 'RETRY_REQUIRED');

for (const unsafeReason of [
  'rate_limited',
  'time_cap_reached',
  'profile_changed',
  'scroll_box_detached',
  'modal_closed',
  'run_superseded'
]) {
  const result = engine.assessListCompletion({
    expectedCount: exactCount,
    confirmedCount: 285,
    assistedTotalCount: 287,
    domCandidateCount: 2,
    repeatDomCandidateCount: 2,
    correctlyIdentifiedDomCandidateCount: 2,
    devtoolsConnected: true,
    devtoolsExactPayloadCount: 4,
    pagination: { paginationRecognized: true, terminal: true },
    domEndObserved: true,
    endReason: unsafeReason
  });
  assert.equal(result.state, 'PARTIAL', `${unsafeReason} must remain partial`);
  assert.equal(result.fallbackAllowed, false, `${unsafeReason} must block fallback`);
  assert(result.fallbackBlockReasons.includes(`unsafe_end_reason:${unsafeReason}`));
}

const safeFallback = engine.assessListCompletion({
  expectedCount: exactCount,
  confirmedCount: 285,
  domCandidateCount: 4,
  repeatDomCandidateCount: 3,
  correctlyIdentifiedDomCandidateCount: 4,
  devtoolsConnected: true,
  devtoolsExactPayloadCount: 4,
  endReason: 'stalled_at_list_end'
});
assert.equal(safeFallback.fallbackAllowed, true);
assert.equal(safeFallback.maxAssistedPromotions, 2, 'promotion must be bounded by the exact missing gap');

const strictComparison = engine.compareStrictSets({
  strictFollowers: ['alpha', 'mutual'],
  strictFollowing: ['mutual', 'beta'],
  assistedFollowers: ['assisted_mutual'],
  assistedFollowing: ['assisted_mutual']
});
assert.deepEqual(plain(strictComparison.followersWithoutMeFollowing), ['alpha']);
assert.deepEqual(plain(strictComparison.iFollowButNotReturned), ['beta']);
assert.equal(strictComparison.mutualCount, 1, 'assisted users must not inflate strict mutualCount');
assert.equal(strictComparison.assistedPreview.mutualCount, 2);

const integrity = engine.validateCompareIntegrity({ comparison: strictComparison });
assert.equal(integrity.ok, true);
const brokenIntegrity = engine.validateCompareIntegrity({
  comparison: {
    followersWithoutMeFollowing: ['alpha'],
    iFollowButNotReturned: ['beta'],
    mutualUsers: ['mutual'],
    mutualCount: 2,
    compareCounts: { followers: 2, following: 2 }
  }
});
assert.equal(brokenIntegrity.ok, false);

const confirmedVerdict = engine.buildTrustVerdict({
  followers: exactCompletion,
  following: terminalSmallGap,
  integrity
});
assert.deepEqual(plain(confirmedVerdict), {
  code: 'CONFIRMED',
  labelKo: '확정 비교 가능',
  severity: 'success',
  recommendedActionKo: '없음',
  reasons: ['followers_exact', 'following_network_end', 'integrity_passed']
});
assert.equal(Object.isFrozen(confirmedVerdict), true);

const referenceVerdict = engine.buildTrustVerdict({
  followers: domOnly,
  following: domOnly,
  integrity
});
assert.equal(referenceVerdict.code, 'REFERENCE_ONLY');
assert.equal(referenceVerdict.labelKo, '참고용 결과');

const partialVerdict = engine.buildTrustVerdict({
  followers: exactCompletion,
  following: unprovenSmallGap,
  integrity
});
assert.equal(partialVerdict.code, 'PARTIAL');

const retryVerdict = engine.buildTrustVerdict({
  followers: connectedNoPayload,
  following: domOnly,
  integrity
});
assert.equal(retryVerdict.code, 'RETRY_REQUIRED');

const missingIntegrityVerdict = engine.buildTrustVerdict({
  followers: exactCompletion,
  following: exactCompletion
});
assert.equal(missingIntegrityVerdict.code, 'RETRY_REQUIRED', 'confirmation requires explicit integrity evidence');

console.log('accuracy engine fixtures passed');
