import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../run-context.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(source, context, { filename: 'run-context.js' });
const contract = context.IGRunContext;

assert(contract, 'IGRunContext global was not installed');
assert.equal(Object.isFrozen(contract), true);
assert.equal(contract.normalizeProfile(' Test.Profile '), 'test.profile');
assert.equal(contract.normalizeProfile('unknown_profile'), '');
assert.equal(contract.normalizeProfile('bad/name'), '');
assert.equal(contract.profileFromInstagramUrl('https://www.instagram.com/Test.Profile/'), 'test.profile');
assert.equal(contract.profileFromInstagramUrl('https://instagram.com/user_name/?hl=ko'), 'user_name');
assert.equal(contract.profileFromInstagramUrl('https://www.instagram.com/explore/'), '');
assert.equal(contract.profileFromInstagramUrl('https://www.instagram.com/accounts/edit/'), '');
assert.equal(contract.profileFromInstagramUrl('https://example.com/test_profile/'), '');
assert.equal(contract.hasProfileMismatch('old_profile', 'current_profile'), true);
assert.equal(contract.hasProfileMismatch('same_profile', 'same_profile'), false);
assert.equal(contract.hasProfileMismatch('unknown_profile', 'current_profile'), false);
assert.equal(contract.hasProfileMismatch('', 'current_profile'), false);

const now = Date.parse('2026-08-25T12:00:00.000Z');
assert.equal(contract.formatRelativeTime('2026-08-25T11:59:45.000Z', now), '방금 전');
assert.equal(contract.formatRelativeTime('2026-08-25T11:55:00.000Z', now), '5분 전');
assert.equal(contract.formatRelativeTime('2026-08-25T09:00:00.000Z', now), '3시간 전');
assert.equal(contract.formatRelativeTime('2026-08-23T12:00:00.000Z', now), '2일 전');
assert.equal(contract.formatRelativeTime('bad-date', now), '시각 알 수 없음');

console.log('run context fixtures passed');
