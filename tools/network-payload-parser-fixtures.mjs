import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const accuracySource = fs.readFileSync(new URL('../accuracy-engine.js', import.meta.url), 'utf8');
const parserSource = fs.readFileSync(new URL('../network-payload-parser.js', import.meta.url), 'utf8');
const context = vm.createContext({
  URL,
  TextDecoder,
  Uint8Array,
  atob: (value) => globalThis.atob(String(value))
});
vm.runInContext(accuracySource, context, { filename: 'accuracy-engine.js' });
vm.runInContext(parserSource, context, { filename: 'network-payload-parser.js' });
const parser = context.IGNetworkPayloadParser;

assert(parser, 'IGNetworkPayloadParser global was not installed');
assert.equal(Object.isFrozen(parser), true);
assert.equal(parser.detectMode('https://www.instagram.com/api/v1/friendships/1/followers/'), 'followers');
assert.equal(parser.detectMode('https://www.instagram.com/api/v1/friendships/1/following/'), 'following');
assert.equal(parser.detectMode('https://www.instagram.com/graphql/query'), 'active');
assert.equal(parser.isInstagramUrl('https://evilinstagram.com/api/v1/followers/'), false);
assert.equal(parser.isCandidateRequestMetadata({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  mimeType: 'application/json',
  resourceType: 'XHR'
}), true);
assert.equal(parser.isCandidateRequestMetadata({
  url: 'https://www.instagram.com/static/app.js',
  mimeType: 'application/javascript',
  resourceType: 'Script'
}), false);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const exactFollowers = parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/?count=12&max_id=secret',
  status: 200,
  mimeType: 'application/json',
  resourceType: 'XHR',
  body: JSON.stringify({
    users: [{ username: 'Alpha' }, { username: 'beta' }],
    has_more: false,
    next_max_id: null,
    viewer: { username: 'must_not_leak' }
  })
});
assert.equal(exactFollowers.ok, true);
assert.deepEqual(plain(exactFollowers.evidence), {
  endpoint: 'instagram:endpoint:followers',
  status: 200,
  mimeType: 'application/json',
  usernames: ['alpha', 'beta'],
  mode: 'followers',
  confidence: 'exact',
  pagination: {
    exactEndpoint: true,
    itemCount: 2,
    recognized: true,
    hasMore: false,
    terminal: true,
    terminalReason: 'has_more_false'
  }
});
assert.equal(JSON.stringify(exactFollowers).includes('secret'), false);
assert.equal(JSON.stringify(exactFollowers).includes('must_not_leak'), false);

const exactFollowingBase64 = parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/following/',
  status: 200,
  mimeType: 'text/plain',
  resourceType: 'Fetch',
  body: Buffer.from(JSON.stringify({ users: [{ username: 'Gamma' }], has_more: true }), 'utf8').toString('base64'),
  base64Encoded: true
});
assert.equal(exactFollowingBase64.ok, true);
assert.deepEqual(plain(exactFollowingBase64.evidence.usernames), ['gamma']);
assert.equal(exactFollowingBase64.evidence.pagination.hasMore, true);

const candidate = parser.parseResponse({
  url: 'https://www.instagram.com/graphql/query/?doc_id=redacted',
  status: 200,
  mimeType: 'application/json',
  resourceType: 'Fetch',
  body: JSON.stringify({ data: { edges: [{ node: { username: 'candidate' } }] } })
});
assert.equal(candidate.ok, true);
assert.equal(candidate.evidence.mode, 'active');
assert.equal(candidate.evidence.confidence, 'candidate');
assert.equal(candidate.evidence.endpoint, 'instagram:network:candidate');

const emptyTerminal = parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  status: 200,
  mimeType: 'application/json',
  resourceType: 'XHR',
  body: JSON.stringify({ users: [], has_more: false })
});
assert.equal(emptyTerminal.ok, true);
assert.deepEqual(plain(emptyTerminal.evidence.usernames), []);
assert.equal(emptyTerminal.evidence.pagination.terminal, true);

assert.equal(parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  status: 429,
  mimeType: 'application/json',
  body: '{}'
}).reason, 'non-success-status');
assert.equal(parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  status: 200,
  mimeType: 'application/json',
  body: '{"users":['
}).reason, 'invalid-json');
assert.equal(parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  status: 200,
  mimeType: 'application/json',
  body: 'not-valid-base64',
  base64Encoded: true
}).reason, 'base64-decode-failed');
assert.equal(parser.parseResponse({
  url: 'https://www.instagram.com/api/v1/friendships/1/followers/',
  status: 200,
  mimeType: 'application/json',
  body: `{"users":[],"padding":"${'x'.repeat(parser.MAX_BODY_CHARS)}"}`
}).reason, 'body-too-large');

const followersUrl = 'https://www.instagram.com/api/v1/friendships/1/followers/?count=12';
const classify = (status, body, url = followersUrl) => parser.classifyBlockResponse({ url, status, resourceType: 'XHR', body })?.code || '';
assert.equal(classify(400, JSON.stringify({ message: 'checkpoint_required', checkpoint_url: '/challenge/x', status: 'fail' })), 'checkpoint_required');
assert.equal(classify(400, JSON.stringify({ message: 'challenge_required', challenge: { url: 'x' }, status: 'fail' })), 'checkpoint_required');
assert.equal(classify(400, JSON.stringify({ message: 'feedback_required', spam: true, feedback_title: 'Try Again Later', status: 'fail' })), 'feedback_required');
assert.equal(classify(403, JSON.stringify({ message: 'login_required', status: 'fail' })), 'login_required');
assert.equal(classify(401, JSON.stringify({ message: 'Please wait a few minutes before you try again.', status: 'fail' })), 'please_wait');
assert.equal(classify(401, '<html>login</html>'), 'login_required', 'exact list 401 without JSON is a login signal');
assert.equal(classify(403, ''), 'access_denied');
assert.equal(classify(403, '', 'https://www.instagram.com/graphql/query'), '', 'status-only fallback is limited to exact list endpoints');
assert.equal(classify(429, JSON.stringify({ message: 'Please wait a few minutes before you try again.' })), '', '429 stays on the rate-limit path');
assert.equal(classify(404, JSON.stringify({ message: 'not found', status: 'fail' })), '');
assert.equal(classify(400, JSON.stringify({ message: 'checkpoint_required' }), 'https://example.com/api/v1/friendships/1/followers/'), '');
assert.equal(classify(200, JSON.stringify({ users: [{ username: 'challenge_fan' }], message: 'challenge', status: 'ok' })), '',
  'successful list responses are never classified from account names or messages');
assert.equal(parser.sanitizeBlockCode('checkpoint_required'), 'checkpoint_required');
assert.equal(parser.sanitizeBlockCode('raw message'), '');
const failedSuccess = parser.parseResponse({
  url: followersUrl, status: 200, mimeType: 'application/json', resourceType: 'XHR',
  body: JSON.stringify({ message: 'feedback_required', spam: true, status: 'fail' })
});
assert.equal(failedSuccess.ok, false);
assert.equal(failedSuccess.reason, 'instagram-block-signal');
assert.equal(failedSuccess.blockCode, 'feedback_required');
assert.equal(JSON.stringify(failedSuccess).includes('spam'), false, 'raw warning text is not returned');
const listWithChallengeName = parser.parseResponse({
  url: followersUrl, status: 200, mimeType: 'application/json', resourceType: 'XHR',
  body: JSON.stringify({ users: [{ username: 'checkpoint.challenge' }], big_list: false, page_size: 12, status: 'ok' })
});
assert.equal(listWithChallengeName.ok, true);
assert.equal(listWithChallengeName.evidence.pagination.terminal, true);

console.log('network payload parser fixtures passed');
