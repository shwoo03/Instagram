import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync(macChrome) ? macChrome : undefined);
const onlyUsers = Array.from({ length: 25 }, (_, index) => `only_${String(index).padStart(2, '0')}`);
const record = {
  runId: 'ui-test-run',
  schemaVersion: 1,
  profile: 'test_profile',
  status: 'completed',
  stage: 'finished',
  updatedAt: new Date().toISOString(),
  counts: {
    followers: { expected: 285, confirmed: 285, assisted: 285, candidates: 2 },
    following: { expected: 308, confirmed: 308, assisted: 308, candidates: 2 },
    mutual: 283,
    followersOnly: 2,
    followingOnly: 25
  },
  accounts: {
    relationshipSet: 'strict',
    iFollowButNotReturned: onlyUsers,
    followersWithoutMeFollowing: ['follower_one', 'follower_two'],
    followersCandidates: ['candidate_follower_a', 'candidate_follower_b'],
    followingCandidates: ['candidate_following_a', 'candidate_following_b'],
    evidence: {
      iFollowButNotReturned: onlyUsers.map((username) => ({ username, level: 'confirmed', source: 'debugger' })),
      followersWithoutMeFollowing: [
        { username: 'follower_one', level: 'confirmed', source: 'devtools' },
        { username: 'follower_two', level: 'confirmed', source: 'page-network' }
      ],
      followersCandidates: [
        { username: 'candidate_follower_a', level: 'candidate', source: 'dom', reason: 'dom_not_network' },
        { username: 'candidate_follower_b', level: 'candidate', source: 'unknown' }
      ],
      followingCandidates: [
        { username: 'candidate_following_a', level: 'candidate', source: 'page-network' },
        { username: 'candidate_following_b', level: 'candidate', source: 'dom' }
      ]
    },
    truncated: {}
  },
  sources: { devtoolsReady: false, debuggerReady: false, debuggerEvidence: true, pageNetworkReady: false, domOnly: false },
  pagination: { followers: { recognized: true, terminal: true }, following: { recognized: true, terminal: true } },
  verdict: { code: 'CONFIRMED', labelKo: '확정 비교 가능', severity: 'success', reasons: [], recommendedActionKo: '없음' },
  warnings: [],
  timeline: [{ code: 'completed', at: new Date().toISOString() }]
};

const cases = [
  { file: 'popup.html', width: 320, height: 760, panel: false },
  { file: 'popup.html', width: 360, height: 760, panel: false },
  { file: 'popup.html', width: 420, height: 760, panel: false },
  { file: 'devtools-panel.html', width: 320, height: 1000, panel: true },
  { file: 'devtools-panel.html', width: 736, height: 1000, panel: true },
  { file: 'devtools-panel.html', width: 1024, height: 1000, panel: true }
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(executablePath ? { executablePath } : {})
});

const results = [];
try {
  for (const testCase of cases) {
    const page = await browser.newPage();
    await page.setViewport({ width: testCase.width, height: testCase.height });
    await page.evaluateOnNewDocument((storedRecord, isPanel) => {
      globalThis.__testHref = 'https://www.instagram.com/test_profile/';
      globalThis.__ticks = [];
      globalThis.__tabUpdates = [];
      globalThis.__storageListeners = [];
      globalThis.__sentMessages = [];
      window.setInterval = (callback) => globalThis.__ticks.push(callback);
      globalThis.chrome = {
        tabs: { query: async () => [{ id: 7, url: globalThis.__testHref }], onUpdated: { addListener: (callback) => globalThis.__tabUpdates.push(callback) } },
        storage: {
          session: { get: async (key) => ({ [key]: storedRecord }) },
          onChanged: { addListener(callback) { globalThis.__storageListeners.push(callback); } }
        },
        runtime: { sendMessage: async (message) => { globalThis.__sentMessages.push(message); return { ok: true }; } },
        devtools: isPanel
          ? { inspectedWindow: { tabId: 7, eval: (_code, callback) => callback(globalThis.__testHref, null) } }
          : undefined
      };
    }, record, testCase.panel);

    await page.goto(`file://${path.join(ROOT, testCase.file)}`, { waitUntil: 'load' });
    await page.waitForSelector('#accountDetailsSection:not([hidden])');

    const defaultState = await page.evaluate(() => ({
      detailsCount: document.querySelectorAll('#accountDetailHost details').length,
      openCount: document.querySelectorAll('#accountDetailHost details[open]').length,
      badge: document.querySelector('#accountSetBadge')?.textContent,
      runProfile: document.querySelector('#runProfile')?.textContent,
      runAge: document.querySelector('#runAge, #updatedAt')?.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth
    }));
    assert.equal(defaultState.detailsCount, 3, `${testCase.file} must render three disclosures`);
    assert.equal(defaultState.openCount, 0, `${testCase.file} disclosures must default closed`);
    assert.equal(defaultState.badge, '확정 집합');
    assert.equal(defaultState.runProfile, testCase.panel ? '@test_profile' : '결과 @test_profile');
    assert.notEqual(defaultState.runAge, '—');
    assert.equal(defaultState.overflow, false, `${testCase.file} ${testCase.width}px must not overflow`);
    const closedScreenshot = `/tmp/ig-account-lists-${testCase.file.replace('.html', '')}-${testCase.width}-closed.png`;
    await page.screenshot({ path: closedScreenshot, fullPage: true });

    await page.click('#accountDetailHost details:nth-of-type(1) > summary');
    assert.equal(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list li', (items) => items.length), 20);
    const firstLink = await page.$eval('#accountDetailHost details:nth-of-type(1) .account-name-list a', (link) => ({
      href: link.href,
      target: link.target,
      rel: link.rel
    }));
    assert.equal(firstLink.href, 'https://www.instagram.com/only_00/');
    assert.equal(firstLink.target, '_blank');
    assert.match(firstLink.rel, /noopener/);
    assert.match(firstLink.rel, /noreferrer/);

    const firstEvidenceButton = '#accountDetailHost details:nth-of-type(1) .account-evidence-button';
    assert.equal(await page.$eval(firstEvidenceButton, (button) => button.textContent), '확정');
    assert.equal(await page.$eval(firstEvidenceButton, (button) => button.getAttribute('aria-expanded')), 'false');
    await page.click(firstEvidenceButton);
    assert.equal(await page.$eval(firstEvidenceButton, (button) => button.getAttribute('aria-expanded')), 'true');
    assert.match(
      await page.$eval('#accountDetailHost details:nth-of-type(1) .account-evidence-reason', (reason) => reason.textContent),
      /자동 네트워크/
    );
    const evidenceScreenshot = `/tmp/ig-account-lists-${testCase.file.replace('.html', '')}-${testCase.width}-evidence.png`;
    await page.screenshot({ path: evidenceScreenshot, fullPage: true });

    await page.click('#accountDetailHost details:nth-of-type(1) .account-more-button');
    assert.equal(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list li', (items) => items.length), 25);

    const searchSelector = '#accountDetailHost details:nth-of-type(1) input[type="search"]';
    await page.type(searchSelector, '@ONLY_24');
    assert.deepEqual(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list a', (items) => items.map((item) => item.href)), ['https://www.instagram.com/only_24/']);
    await page.$eval(searchSelector, (input) => { input.value = 'not_present'; input.dispatchEvent(new Event('input')); });
    assert.equal(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list li', (items) => items.length), 0);
    assert.match(await page.$eval('#accountDetailHost details:nth-of-type(1) .account-search-status', (item) => item.textContent), /저장된 목록에 일치하는 계정이 없습니다/);
    await page.$eval(searchSelector, (input) => { input.value = ''; input.dispatchEvent(new Event('input')); });
    assert.equal(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list li', (items) => items.length), 20);
    await page.click('#accountDetailHost details:nth-of-type(1) .account-more-button');

    await page.click('#accountDetailHost details:nth-of-type(3) > summary');
    const candidateHeadings = await page.$$eval('#accountDetailHost details:nth-of-type(3) h4', (items) => items.map((item) => item.textContent));
    assert.deepEqual(candidateHeadings, ['팔로워 후보 · 2명', '팔로잉 후보 · 2명']);
    await page.click('#accountDetailHost details:nth-of-type(3) .account-evidence-button');
    assert.match(await page.$eval('#accountDetailHost details:nth-of-type(3) .account-evidence-reason', (item) => item.textContent), /수집된 네트워크 목록에서 확인되지/);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth
    }));
    assert.equal(layout.scrollWidth > layout.clientWidth || layout.bodyScrollWidth > layout.bodyClientWidth, false);
    const openScreenshot = `/tmp/ig-account-lists-${testCase.file.replace('.html', '')}-${testCase.width}-open.png`;
    await page.screenshot({ path: openScreenshot, fullPage: true });
    results.push({ ...testCase, closedScreenshot, evidenceScreenshot, openScreenshot, ...layout });
    await page.evaluate(() => {
      const now = Date.now();
      Date.now = () => now + 120000;
      globalThis.__ticks.forEach((tick) => tick());
    });
    assert.match(await page.$eval('#runAge, #updatedAt', (item) => item.textContent), /분 전/);
    assert.equal(await page.$$eval('#accountDetailHost details:nth-of-type(1) .account-name-list li', (items) => items.length), 25, 'age refresh must preserve expanded lists');
    for (const [profile, expectedState] of [['other_profile', '이전 결과'], ['test_profile', '확정']]) {
      await page.evaluate((name) => {
        globalThis.__testHref = `https://www.instagram.com/${name}/`;
        globalThis.__tabUpdates.forEach((listener) => listener(7, { url: globalThis.__testHref }));
      }, profile);
      assert.equal(await page.$eval('#stateBadge', (item) => item.textContent), expectedState);
    }
    await page.evaluate((storedRecord) => {
      const accounts = IGAccountListContract.sanitizeAccounts({
        ...storedRecord.accounts, iFollowButNotReturned: Array.from({ length: 1005 }, (_, i) => `large_${String(i).padStart(4, '0')}`)
      });
      globalThis.__storageListeners.forEach((listener) => listener({
        'ig_run_progress:tab:7': { newValue: { ...storedRecord, counts: { ...storedRecord.counts, followingOnly: 1005 }, accounts } }
      }, 'session'));
    }, record);
    assert.match(await page.$eval('#accountDetailHost details:first-of-type > summary', (item) => item.textContent), /1,005명/);
    await page.click('#accountDetailHost details:first-of-type > summary');
    assert.match(await page.$eval('#accountDetailHost details:first-of-type .account-list-scope', (item) => item.textContent), /전체 1,005명 · 저장된 1,000명/);
    await page.type(searchSelector, 'large_1004');
    assert.match(await page.$eval('#accountDetailHost details:first-of-type .account-search-status', (item) => item.textContent), /저장된 목록에/);
    assert.match(await page.$eval('#accountDetailHost details:first-of-type .account-truncated-notice', (item) => item.textContent), /전체 결과에 없는 계정이라고 판단할 수 없습니다/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.screenshot({ path: `/tmp/ig-improvements-${testCase.file.replace('.html', '')}-${testCase.width}.png`, fullPage: true });
    await page.evaluate((storedRecord) => globalThis.__storageListeners.forEach((listener) => listener({
      'ig_run_progress:tab:7': { newValue: { ...storedRecord, status: 'running', stage: 'collecting_followers', verdict: { code: 'RUNNING' } } }
    }, 'session')), record);
    assert.equal(await page.$eval('#stopButton', (item) => item.hidden || item.disabled), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.screenshot({ path: `/tmp/ig-stop-${testCase.file.replace('.html', '')}-${testCase.width}.png`, fullPage: true });
    await page.click('#stopButton');
    assert.equal(await page.$eval('#stopButton', (item) => item.disabled), true);
    assert.deepEqual(await page.evaluate(() => globalThis.__sentMessages.at(-1)), { type: 'IG_STOP_COLLECTION', tabId: 7, runId: 'ui-test-run' });
    await page.evaluate((storedRecord) => globalThis.__storageListeners.forEach((listener) => listener({
      'ig_run_progress:tab:7': { newValue: { ...storedRecord, status: 'partial_cancelled', stage: 'finished', verdict: { code: 'PARTIAL', labelKo: '사용자 중단 · 부분 결과' } } }
    }, 'session')), record);
    assert.equal(await page.$eval('#stopButton', (item) => item.hidden), true);
    if (testCase.panel) {
      await page.evaluate(() => { globalThis.__testHref = 'https://www.instagram.com/explore/'; globalThis.__ticks.forEach((tick) => tick()); });
      assert.equal(await page.$eval('#copyButton', (item) => item.disabled), true);
      assert.equal(await page.$eval('#accountDetailsSection', (item) => item.hidden), true);
    }
    await page.close();
  }

  for (const testCase of [
    { file: 'popup.html', width: 320, panel: false },
    { file: 'devtools-panel.html', width: 736, panel: true }
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: testCase.width, height: 900 });
    await page.evaluateOnNewDocument((storedRecord, isPanel) => {
      globalThis.chrome = {
        tabs: { query: async () => [{ id: 7, url: 'https://www.instagram.com/current_profile/' }] },
        storage: {
          session: { get: async (key) => ({ [key]: { ...storedRecord, profile: 'old_profile' } }) },
          onChanged: { addListener() {} }
        },
        runtime: { sendMessage: async () => ({ ok: true }) },
        devtools: isPanel
          ? { inspectedWindow: { tabId: 7, eval: (_code, callback) => callback('https://www.instagram.com/current_profile/', null) } }
          : undefined
      };
    }, record, testCase.panel);

    await page.goto(`file://${path.join(ROOT, testCase.file)}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#stateBadge')?.textContent === '이전 결과');
    const staleState = await page.evaluate((isPanel) => ({
      title: document.querySelector(isPanel ? '#verdictTitle' : '#statusTitle')?.textContent,
      accountDetailsHidden: document.querySelector('#accountDetailsSection')?.hidden,
      resultsHidden: isPanel ? document.querySelector('#copyButton')?.disabled : document.querySelector('#resultsSection')?.hidden,
      mutualCount: document.querySelector('#mutualCount')?.textContent,
      runProfile: document.querySelector('#runProfile')?.textContent,
      warningText: document.querySelector('#warningList')?.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth
    }), testCase.panel);
    assert.equal(staleState.title, '다른 프로필의 결과입니다');
    assert.equal(staleState.accountDetailsHidden, true);
    assert.equal(staleState.resultsHidden, true);
    if (testCase.panel) assert.equal(staleState.mutualCount, '—');
    if (testCase.panel) assert.match(staleState.warningText, /current_profile/);
    assert.match(staleState.runProfile, /old_profile/);
    assert.equal(staleState.overflow, false);
    const staleScreenshot = `/tmp/ig-run-context-${testCase.file.replace('.html', '')}-${testCase.width}-stale.png`;
    await page.screenshot({ path: staleScreenshot, fullPage: true });
    results.push({ ...testCase, state: 'stale-profile', staleScreenshot });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('account list render fixtures passed');
console.log(JSON.stringify(results, null, 2));
