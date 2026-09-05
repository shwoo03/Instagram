import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const contractSource = fs.readFileSync(new URL('../account-list-contract.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../account-list-ui.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL, encodeURIComponent });
vm.runInContext(contractSource, context, { filename: 'account-list-contract.js' });
vm.runInContext(uiSource, context, { filename: 'account-list-ui.js' });
const ui = context.IGAccountListUI;

assert(ui, 'IGAccountListUI global was not installed');
assert.equal(Object.isFrozen(ui), true);
assert.equal(ui.PAGE_SIZE, 20);
assert.equal(ui.nextVisibleCount(0, 45), 20);
assert.equal(ui.nextVisibleCount(20, 45), 40);
assert.equal(ui.nextVisibleCount(40, 45), 45);

const model = ui.buildViewModel({
  relationshipSet: 'strict',
  iFollowButNotReturned: ['one'],
  followersWithoutMeFollowing: ['two'],
  followersCandidates: ['candidate_follower'],
  followingCandidates: ['candidate_following'],
  evidence: {
    iFollowButNotReturned: [{ username: 'one', level: 'confirmed', source: 'debugger' }],
    followersWithoutMeFollowing: [{ username: 'two', level: 'confirmed', source: 'devtools' }],
    followersCandidates: [{ username: 'candidate_follower', level: 'candidate', source: 'dom' }],
    followingCandidates: [{ username: 'candidate_following', level: 'candidate', source: 'page-network' }]
  }
});
assert.equal(model.labelKo, '확정 집합');
assert.equal(model.sections.length, 3);
assert.equal(model.sections[0].labelKo, '나만 팔로우');
assert.deepEqual(Array.from(model.sections[0].usernames), ['one']);
assert.equal(model.sections[0].evidenceByUsername.one.level, 'confirmed');
assert.equal(model.sections[0].evidenceByUsername.one.source, 'debugger');
assert.equal(model.sections[2].candidate, true);
assert.equal(model.sections[2].groups[0].labelKo, '팔로워 후보');
assert.equal(model.sections[2].groups[1].labelKo, '팔로잉 후보');
assert.equal(model.sections[2].groups[0].evidenceByUsername.candidate_follower.level, 'candidate');
assert.equal(ui.getEvidencePresentation('iFollowButNotReturned', { level: 'confirmed', source: 'debugger' }).badgeKo, '확정');
assert.match(ui.getEvidencePresentation('iFollowButNotReturned', { level: 'confirmed', source: 'debugger' }).reasonKo, /자동 네트워크/);
assert.match(ui.getEvidencePresentation('followersCandidates', { level: 'candidate', source: 'dom' }).reasonKo, /최종 비교에서는 제외/);
assert.equal(ui.buildViewModel(null), null);
assert.match(ui.getEvidencePresentation('followersCandidates', { source: 'dom', reason: 'dom_not_network' }).reasonKo, /수집된 네트워크 목록에서 확인되지/);
assert.match(ui.getEvidencePresentation('followingCandidates', { source: 'debugger', reason: 'ambiguous_network' }).reasonKo, /구성원인지 확정하지/);

console.log('account list UI fixtures passed');
