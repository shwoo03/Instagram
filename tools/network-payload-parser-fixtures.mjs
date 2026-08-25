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

console.log('network payload parser fixtures passed');
