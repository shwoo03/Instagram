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
  schemaVersion: 1,
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
        { username: 'candidate_follower_a', level: 'candidate', source: 'dom' },
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
      globalThis.chrome = {
        tabs: { query: async () => [{ id: 7, url: 'https://www.instagram.com/test_profile/' }] },
        storage: {
          session: { get: async (key) => ({ [key]: storedRecord }) },
          onChanged: { addListener() {} }
        },
        runtime: { sendMessage: async () => ({ ok: true }) },
        devtools: isPanel
          ? { inspectedWindow: { tabId: 7, eval: (_code, callback) => callback('www.instagram.com', null) } }
          : undefined
      };
    }, record, testCase.panel);

    await page.goto(`file://${path.join(ROOT, testCase.file)}`, { waitUntil: 'load' });
    await page.waitForSelector('#accountDetailsSection:not([hidden])');

    const defaultState = await page.evaluate(() => ({
      detailsCount: document.querySelectorAll('#accountDetailHost details').length,
      openCount: document.querySelectorAll('#accountDetailHost details[open]').length,
      badge: document.querySelector('#accountSetBadge')?.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth
    }));
    assert.equal(defaultState.detailsCount, 3, `${testCase.file} must render three disclosures`);
    assert.equal(defaultState.openCount, 0, `${testCase.file} disclosures must default closed`);
    assert.equal(defaultState.badge, '확정 집합');
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

    await page.click('#accountDetailHost details:nth-of-type(3) > summary');
    const candidateHeadings = await page.$$eval('#accountDetailHost details:nth-of-type(3) h4', (items) => items.map((item) => item.textContent));
    assert.deepEqual(candidateHeadings, ['팔로워 후보 · 2명', '팔로잉 후보 · 2명']);

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
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('account list render fixtures passed');
console.log(JSON.stringify(results, null, 2));
