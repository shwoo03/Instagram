import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../account-list-contract.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL, encodeURIComponent });
vm.runInContext(source, context, { filename: 'account-list-contract.js' });
const contract = context.IGAccountListContract;

assert(contract, 'IGAccountListContract global was not installed');
assert.equal(Object.isFrozen(contract), true);
assert.equal(contract.normalizeUsername('  User.Name  '), 'user.name');
assert.equal(contract.normalizeUsername('bad/name'), '');
assert.equal(contract.profileUrl('User.Name'), 'https://www.instagram.com/user.name/');
assert.equal(contract.profileUrl('bad/name'), '');

const list = contract.sanitizeUsernameList(['Beta', 'alpha', 'ALPHA', 'bad/name', 42]);
assert.deepEqual(Array.from(list.usernames), ['alpha', 'beta']);
assert.equal(list.truncated, false);

const capped = contract.sanitizeUsernameList(['c', 'b', 'a'], 2);
assert.deepEqual(Array.from(capped.usernames), ['a', 'b']);
assert.equal(capped.truncated, true);

const accounts = contract.sanitizeAccounts({
  relationshipSet: 'assisted',
  iFollowButNotReturned: ['Following.Only', 'bad/name'],
  followersWithoutMeFollowing: ['Followers.Only'],
  followersCandidates: ['Candidate.A'],
  followingCandidates: ['Candidate.B'],
  evidence: {
    iFollowButNotReturned: [
      { username: 'Following.Only', level: 'reference', source: 'dom-fallback' },
      { username: 'not-in-list', level: 'confirmed', source: 'debugger' }
    ],
    followersWithoutMeFollowing: [
      { username: 'Followers.Only', level: 'confirmed', source: 'devtools' }
    ],
    followersCandidates: [
      { username: 'Candidate.A', level: 'confirmed', source: 'not-allowed' }
    ]
  },
  truncated: { followingCandidates: true }
});
assert.equal(accounts.relationshipSet, 'assisted');
assert.deepEqual(Array.from(accounts.iFollowButNotReturned), ['following.only']);
assert.deepEqual(Array.from(accounts.followersWithoutMeFollowing), ['followers.only']);
assert.deepEqual(Array.from(accounts.followersCandidates), ['candidate.a']);
assert.deepEqual(Array.from(accounts.followingCandidates), ['candidate.b']);
assert.equal(accounts.truncated.followingCandidates, true);
assert.deepEqual(
  Array.from(accounts.evidence.iFollowButNotReturned, (item) => ({ ...item })),
  [{ username: 'following.only', level: 'reference', source: 'dom-fallback' }]
);
assert.deepEqual(
  Array.from(accounts.evidence.followersWithoutMeFollowing, (item) => ({ ...item })),
  [{ username: 'followers.only', level: 'reference', source: 'devtools' }]
);
assert.deepEqual(
  Array.from(accounts.evidence.followersCandidates, (item) => ({ ...item })),
  [{ username: 'candidate.a', level: 'candidate', source: 'unknown' }]
);
assert.deepEqual(
  Array.from(accounts.evidence.followingCandidates, (item) => ({ ...item })),
  [{ username: 'candidate.b', level: 'candidate', source: 'unknown' }]
);
assert.equal(contract.sanitizeAccounts(null), null);

console.log('account list contract fixtures passed');
