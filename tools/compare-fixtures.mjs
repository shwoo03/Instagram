import fs from 'node:fs';
import assert from 'node:assert/strict';

function loadWalkerFrom(file, functionName) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${file}: missing ${functionName}`);
  let depth = 0;
  let end = -1;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
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

console.log('compare fixtures passed');
