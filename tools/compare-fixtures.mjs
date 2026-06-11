import fs from 'node:fs';
import assert from 'node:assert/strict';

function loadWalkerFrom(file, functionName) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${file}: missing ${functionName}`);
  const bodyStart = text.indexOf('{', text.indexOf(')', start));
  assert.notEqual(bodyStart, -1, `${file}: missing ${functionName} body`);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.notEqual(end, -1, `${file}: could not locate ${functionName} end`);
  return text.slice(start, end);
}

function sourceInfo({ seenCount = 1, sources = ['DOM'], lastSeenAt = '2026-01-01T00:00:00.000Z' } = {}) {
  return {
    seenCount,
    sources: new Set(sources),
    lastSeenAt
  };
}

const compareCandidateEvidenceSource = loadWalkerFrom('main.js', 'compareCandidateEvidence');
const compareCandidateEvidence = new Function(`${compareCandidateEvidenceSource}; return compareCandidateEvidence;`)();

const assessListCompletionSource = loadWalkerFrom('main.js', 'assessListCompletion');
const assessListCompletion = new Function(`
  const DISPLAYED_COUNT_GAP_TOLERANCE = 5;
  ${assessListCompletionSource}
  return assessListCompletion;
`)();

assert.equal(assessListCompletion({
  expectedCount: 287,
  verifiedCount: 285,
  endReason: 'stalled_at_list_end',
  hasNetworkEvidence: true,
  nonDomCandidateCount: 0
}).completeAtListEnd, true);
assert.equal(assessListCompletion({
  expectedCount: 287,
  verifiedCount: 285,
  endReason: 'stalled',
  hasNetworkEvidence: true,
  nonDomCandidateCount: 0
}).completeAtListEnd, false);
assert.equal(assessListCompletion({
  expectedCount: 287,
  verifiedCount: 281,
  endReason: 'stalled_at_list_end',
  hasNetworkEvidence: true,
  nonDomCandidateCount: 0
}).completeAtListEnd, false);
assert.equal(assessListCompletion({
  expectedCount: 287,
  verifiedCount: 285,
  endReason: 'stalled_at_list_end',
  hasNetworkEvidence: false,
  nonDomCandidateCount: 0
}).completeAtListEnd, false);
assert.equal(assessListCompletion({
  expectedCount: 287,
  verifiedCount: 285,
  endReason: 'stalled_at_list_end',
  hasNetworkEvidence: true,
  nonDomCandidateCount: 1
}).completeAtListEnd, false);

assert(compareCandidateEvidence(sourceInfo({ seenCount: 5 }), sourceInfo({ seenCount: 3 })) < 0);
assert(compareCandidateEvidence(sourceInfo({ seenCount: 3 }), sourceInfo({ seenCount: 5 })) > 0);
assert(compareCandidateEvidence(
  sourceInfo({ seenCount: 2, sources: ['DOM', 'dom-observer'] }),
  sourceInfo({ seenCount: 2, sources: ['DOM'] })
) < 0);
assert(compareCandidateEvidence(
  sourceInfo({ seenCount: 2, sources: ['DOM'], lastSeenAt: '2026-01-02T00:00:00.000Z' }),
  sourceInfo({ seenCount: 2, sources: ['DOM'], lastSeenAt: '2026-01-01T00:00:00.000Z' })
) < 0);
assert.equal(compareCandidateEvidence(
  sourceInfo({ seenCount: 2, sources: ['DOM'], lastSeenAt: '2026-01-01T00:00:00.000Z' }),
  sourceInfo({ seenCount: 2, sources: ['DOM'], lastSeenAt: '2026-01-01T00:00:00.000Z' })
), 0);

const getCompareIntegritySource = loadWalkerFrom('main.js', 'getCompareIntegrity');
const getCompareIntegrity = new Function(`${getCompareIntegritySource}; return getCompareIntegrity;`)();

const validIntegrity = getCompareIntegrity({
  followersWithoutMeFollowing: ['a'],
  iFollowButNotReturned: ['d'],
  mutualCount: 2
}, 3, 3);
assert.equal(validIntegrity.ok, true);

const invalidIntegrity = getCompareIntegrity({
  followersWithoutMeFollowing: ['a'],
  iFollowButNotReturned: ['d'],
  mutualCount: 3
}, 3, 3);
assert.equal(invalidIntegrity.ok, false);
assert(invalidIntegrity.checks.some((check) => check.code === 'followers_partition' && !check.ok));

const getOvercountSource = loadWalkerFrom('main.js', 'getOvercountLowConfidenceExclusions');
const getOvercountLowConfidenceExclusions = new Function(
  'state',
  'compareCandidateEvidence',
  `
    const DOM_TIER_SOURCES = new Set(["DOM", "dom-observer"]);
    ${getOvercountSource}
    return getOvercountLowConfidenceExclusions;
  `
)({ userProvenance: { followers: new Map(), following: new Map() } }, compareCandidateEvidence);

const getFallbackOnlyDiffExclusionsSource = loadWalkerFrom('main.js', 'getFallbackOnlyDiffExclusions');
const getFallbackOnlyDiffExclusions = new Function(`
  const DOM_TIER_SOURCES = new Set(["DOM", "dom-observer"]);
  const DOM_CANDIDATE_SOURCES = new Set(["dom-candidate", "dom-observer-candidate"]);
  ${getFallbackOnlyDiffExclusionsSource}
  return getFallbackOnlyDiffExclusions;
`)();

const bucket = new Map([
  ['net_a', sourceInfo({ seenCount: 1, sources: ['DevTools'] })],
  ['net_b', sourceInfo({ seenCount: 1, sources: ['DevTools'] })],
  ['dom_strong', sourceInfo({ seenCount: 5, sources: ['DOM', 'dom-observer'] })],
  ['dom_mid', sourceInfo({ seenCount: 2, sources: ['DOM'] })],
  ['dom_weak', sourceInfo({ seenCount: 1, sources: ['dom-observer'] })]
]);
const exclusions = getOvercountLowConfidenceExclusions(
  'followers',
  new Set(['net_a', 'net_b', 'dom_strong', 'dom_mid', 'dom_weak']),
  new Set(['net_a', 'net_b', 'dom_strong', 'dom_mid', 'dom_weak']),
  3,
  bucket
);
assert.deepEqual([...exclusions].sort(), ['dom_mid', 'dom_weak']);

const diffPriorityBucket = new Map([
  ['no_diff_weak', sourceInfo({ seenCount: 1, sources: ['DOM'] })],
  ['creates_diff_weaker', sourceInfo({ seenCount: 0, sources: ['DOM'] })],
  ['keeper', sourceInfo({ seenCount: 5, sources: ['DOM'] })]
]);
const diffPriorityExclusions = getOvercountLowConfidenceExclusions(
  'followers',
  new Set(['no_diff_weak', 'creates_diff_weaker', 'keeper']),
  new Set(['creates_diff_weaker', 'keeper']),
  2,
  diffPriorityBucket
);
assert.deepEqual([...diffPriorityExclusions], ['no_diff_weak']);

const observerTierBucket = new Map([
  ['observer_only', sourceInfo({ seenCount: 1, sources: ['dom-observer'] })],
  ['dom_only', sourceInfo({ seenCount: 3, sources: ['DOM'] })]
]);
const observerTierExclusions = getOvercountLowConfidenceExclusions(
  'followers',
  new Set(['observer_only', 'dom_only']),
  new Set(['observer_only', 'dom_only']),
  1,
  observerTierBucket
);
assert.deepEqual([...observerTierExclusions], ['observer_only']);

const fallbackOnlyBucket = new Map([
  ['fallback_diff', sourceInfo({ sources: ['dom-candidate', 'dom-fallback'] })],
  ['network_diff', sourceInfo({ sources: ['DevTools', 'dom-fallback'] })],
  ['fallback_mutual', sourceInfo({ sources: ['dom-candidate', 'dom-fallback'] })]
]);
const fallbackOnlyExclusions = getFallbackOnlyDiffExclusions(
  new Set(['fallback_diff', 'network_diff', 'fallback_mutual']),
  new Set(['fallback_mutual']),
  fallbackOnlyBucket
);
assert.deepEqual([...fallbackOnlyExclusions], ['fallback_diff']);

const networkFallbackExclusions = getFallbackOnlyDiffExclusions(
  new Set(['network_diff']),
  new Set(),
  fallbackOnlyBucket
);
assert.deepEqual([...networkFallbackExclusions], []);

const mutualFallbackExclusions = getFallbackOnlyDiffExclusions(
  new Set(['fallback_mutual']),
  new Set(['fallback_mutual']),
  fallbackOnlyBucket
);
assert.deepEqual([...mutualFallbackExclusions], []);

console.log('compare fixtures passed');
