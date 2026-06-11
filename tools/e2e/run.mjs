import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { buildTestExtension } from './build-test-extension.mjs';
import { EXPECTED, FOLLOWERS, FOLLOWING, startFixtureServer } from './fixture-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function launchBrowser(extensionDir) {
  const args = [
    '--no-sandbox'
  ];
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
    (fs.existsSync(macChrome) ? macChrome : undefined);
  const launchOptions = {
    args,
    enableExtensions: [extensionDir],
    pipe: true,
    ...(executablePath ? { executablePath } : {})
  };
  try {
    return await puppeteer.launch({ ...launchOptions, headless: false });
  } catch {
    return puppeteer.launch({ ...launchOptions, headless: 'new' });
  }
}

async function getWorker(browser) {
  const target = await browser.waitForTarget((candidate) => candidate.type() === 'service_worker', { timeout: 30000 });
  const worker = await target.worker();
  assert(worker, 'service worker unavailable');
  return worker;
}

async function openFixturePage(browser, origin, search = '') {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  await page.goto(`${origin}/fixtureprofile/${search}`, { waitUntil: 'networkidle0' });
  await page.bringToFront();
  return { page, logs };
}

async function getFixtureTabId(browser) {
  const worker = await getWorker(browser);
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    return tabs[0]?.id || null;
  });
  assert(Number.isInteger(tabId), 'fixture tab id unavailable');
  return tabId;
}

async function inject(browser, tabId) {
  const worker = await getWorker(browser);
  // This calls the same injection helper used by the action click path; the e2e runner only bypasses the Instagram URL gate.
  await worker.evaluate((id) => injectInstagramCollector(id), tabId);
}

async function sendDevtoolsUsernames(browser, tabId, mode, usernames) {
  const worker = await getWorker(browser);
  await worker.evaluate(async ({ id, modeName, users }) => {
    await chrome.tabs.sendMessage(id, {
      type: 'IG_DEVTOOLS_USERNAMES',
      source: 'devtools-network',
      schemaVersion: 1,
      mode: modeName,
      usernames: users,
      capturedAt: new Date().toISOString()
    });
  }, { id: tabId, modeName: mode, users: usernames });
}

async function waitForResult(page, timeout = 120000) {
  await page.waitForFunction(() => window.__igFollowerResult, { timeout });
  return page.evaluate(() => window.__igFollowerResult);
}

async function runScenario(name, fn) {
  try {
    const detail = await fn();
    return { name, status: 'pass', detail: detail || '' };
  } catch (error) {
    return { name, status: 'fail', detail: error?.stack || error?.message || String(error) };
  }
}

function assertStandardResult(result, logs) {
  assert.equal(result.followers.length, EXPECTED.followers);
  assert.equal(result.following.length, EXPECTED.following);
  assert.equal(result.diffs.mutualCount, EXPECTED.mutual);
  assert.equal(result.diffs.followersWithoutMeFollowing.length, EXPECTED.followersOnly);
  assert.equal(result.diffs.iFollowButNotReturned.length, EXPECTED.followingOnly);
  assert.equal(result.diffs.integrity.ok, true);
  assert(logs.some((line) => line.includes('Instagram 비교 결과')), 'missing Korean comparison card log');
}

async function scenarioStandard(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  const result = await waitForResult(page);
  assertStandardResult(result, logs);
  await page.close();
}

async function scenarioDoubleInject(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await inject(browser, tabId);
  const result = await waitForResult(page);
  assert(result.runId, 'missing runId');
  assert(logs.some((line) => line.includes('이전 수집 실행이 아직 진행 중')), 'missing re-entry Korean log');
  assertStandardResult(result, logs);
  await page.close();
}

async function scenarioModalClosed(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('[role="dialog"]')?.remove());
  const result = await waitForResult(page);
  const reason = result.scroll?.followersEndReason || result.debugReport?.sources?.dom?.followersEndReason || '';
  assert(['scroll_box_detached', 'no_scroll_box', 'profile_changed'].includes(reason), `unexpected partial reason: ${reason}`);
  assert(logs.some((line) => line.includes('partial') || line.includes('미완료') || line.includes('스크롤 박스')), 'missing partial Korean log');
  await page.close();
}

async function scenarioRateLimit(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await page.waitForFunction(() => document.querySelector('[role="dialog"]'), { timeout: 20000 });
  await page.evaluate(() => {
    window.postMessage({
      source: 'ig-page-network-bridge',
      schemaVersion: 1,
      type: 'IG_PAGE_NETWORK_STATUS',
      reason: 'rate-limited',
      capturedAt: new Date().toISOString()
    }, '*');
  });
  await page.waitForFunction(() => window.__igE2eLogsReady === true || true, { timeout: 1 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(logs.some((line) => line.includes('요청 제한(429) 신호 감지')), 'missing 429 detection Korean log');
  assert(logs.some((line) => line.includes('일시정지')), 'missing pause Korean log');
  await page.close();
}

async function scenarioDisplayedCountIncludesInactive(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin, '?display_gap=2');
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await page.waitForFunction(() => window.__igFollowerPrintDevToolsStatus, { timeout: 20000 });
  await sendDevtoolsUsernames(browser, tabId, 'followers', FOLLOWERS);
  await sendDevtoolsUsernames(browser, tabId, 'following', FOLLOWING);
  const result = await waitForResult(page);
  assert.equal(result.status, 'completed_at_list_end');
  assert.equal(result.followers.length, EXPECTED.followers);
  assert.equal(result.following.length, EXPECTED.following);
  assert.equal(result.diffs.mutualCount, EXPECTED.mutual);
  assert.equal(result.diffs.followersWithoutMeFollowing.length, EXPECTED.followersOnly);
  assert.equal(result.diffs.iFollowButNotReturned.length, EXPECTED.followingOnly);
  assert.equal(result.diffs.integrity.ok, true);
  assert.equal(result.followersCompletion?.completeAtListEnd, true);
  assert.equal(result.followingCompletion?.completeAtListEnd, true);
  assert(logs.some((line) => line.includes('확정 비교 가능')), 'missing confirmed trust gate log');
  assert(!logs.some((line) => line.includes('누락 재검증')), 'unexpected reverify log');
  assert(!logs.some((line) => line.includes('부족분 보정으로 승격')), 'unexpected DOM promotion log');
  await page.close();
}

async function scenarioStorageRef(browser, origin) {
  const { page } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await waitForResult(page);
  const worker = await getWorker(browser);
  const storage = await worker.evaluate(async () => chrome.storage.session.get(null));
  const lastRun = storage['ig_follower_snapshot:lastRun'];
  assert(lastRun?.ref, 'lastRun ref missing');
  assert(storage[lastRun.ref], 'referenced snapshot missing');
  await page.close();
}

async function main() {
  process.chdir(ROOT);
  const extensionDir = await buildTestExtension();
  const fixture = await startFixtureServer();
  const browser = await launchBrowser(extensionDir);
  await getWorker(browser);

  const scenarios = [
    ['A standard collection', () => scenarioStandard(browser, fixture.origin)],
    ['B double injection', () => scenarioDoubleInject(browser, fixture.origin)],
    ['C forced modal close', () => scenarioModalClosed(browser, fixture.origin)],
    ['D synthetic 429 signal', () => scenarioRateLimit(browser, fixture.origin)],
    ['F displayed count includes inactive', () => scenarioDisplayedCountIncludesInactive(browser, fixture.origin)],
    ['E storage lastRun ref', () => scenarioStorageRef(browser, fixture.origin)]
  ];

  const results = [];
  for (const [name, fn] of scenarios) {
    results.push(await runScenario(name, fn));
  }

  await browser.close();
  await fixture.close();

  console.log('E2E results');
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
  }
  if (results.some((result) => result.status === 'fail')) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
