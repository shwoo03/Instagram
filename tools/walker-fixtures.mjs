import fs from 'node:fs';
import assert from 'node:assert/strict';

function extractWalker(file) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('[ig-walker:start]');
  const end = text.indexOf('[ig-walker:end]');
  assert.notEqual(start, -1, `${file}: missing walker start sentinel`);
  assert.notEqual(end, -1, `${file}: missing walker end sentinel`);
  return text.slice(start, end).replace(/^[ \t]+/gm, '').replace(/\s+/g, ' ').trim();
}

const parserWalker = extractWalker('network-payload-parser.js');
const pageBridgeWalker = extractWalker('page-network-bridge.js');
assert.equal(parserWalker, pageBridgeWalker, 'parser/page-network walker drifted');

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

function runExternalWalkerFixture(file) {
  const fnSource = loadWalkerFrom(file, 'collectUsernamesFromPayload');
  const addUsername = (username, targetSet) => {
    if (typeof username === 'string' && /^[a-zA-Z0-9._]{1,30}$/.test(username.trim())) {
      targetSet.add(username.trim().toLowerCase());
    }
  };
  const collectUsernamesFromPayload = new Function('addUsername', `${fnSource}; return collectUsernamesFromPayload;`)(addUsername);
  const collect = (payload) => {
    const out = new Set();
    collectUsernamesFromPayload(payload, out);
    return [...out].sort();
  };
  assert.deepEqual(collect({ users: [{ username: 'a' }, { username: 'b' }] }), ['a', 'b']);
  assert.deepEqual(collect({ data: { edges: [{ node: { username: 'c' } }] } }), ['c']);
  assert.deepEqual(collect({ username: 'x' }), []);
  assert.deepEqual(collect({ data: { username: 'y' } }), []);
}

function runMainWalkerFixture() {
  const fnSource = loadWalkerFrom('main.js', 'collectFromPayload');
  const state = { collectedUsers: new Set(), followingUsers: new Set(), activeCollectionMode: 'followers', candidateUsers: { followers: new Set(), following: new Set() } };
  const getCollectionModeForSet = (targetSet) => targetSet === state.followingUsers ? 'following' : 'followers';
  const addCandidateUsername = (username, mode) => state.candidateUsers[mode].add(String(username).toLowerCase());
  const addUsername = (username, targetSet) => {
    const before = targetSet.size;
    targetSet.add(String(username).toLowerCase());
    return targetSet.size > before;
  };
  const collectFromPayload = new Function('state', 'getCollectionModeForSet', 'addCandidateUsername', 'addUsername', `${fnSource}; return collectFromPayload;`)(state, getCollectionModeForSet, addCandidateUsername, addUsername);
  const collect = (payload) => {
    state.collectedUsers.clear();
    collectFromPayload(payload, new WeakSet(), 0, state.collectedUsers, 'followers', 'fixture', 'confirmed');
    return [...state.collectedUsers].sort();
  };
  assert.deepEqual(collect({ users: [{ username: 'a' }, { username: 'b' }] }), ['a', 'b']);
  assert.deepEqual(collect({ data: { edges: [{ node: { username: 'c' } }] } }), ['c']);
  assert.deepEqual(collect({ username: 'x' }), []);
  assert.deepEqual(collect({ data: { username: 'y' } }), []);
}

runExternalWalkerFixture('network-payload-parser.js');
runExternalWalkerFixture('page-network-bridge.js');
runMainWalkerFixture();
console.log('walker fixtures passed');
