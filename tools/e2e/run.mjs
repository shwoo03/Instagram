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
  const worker = await getWorker(browser);
  await worker.evaluate(async () => chrome.storage.session.clear());
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error?.stack || error?.message || String(error)}`));
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

async function waitForRunProgress(browser, tabId, timeoutMs = 10000) {
  const worker = await getWorker(browser);
  const key = `ig_run_progress:tab:${tabId}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await worker.evaluate(async (storageKey) => {
      const stored = await chrome.storage.session.get(storageKey);
      return stored?.[storageKey] || null;
    }, key);
    if (value?.stage === 'finished') return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run progress timeout for tab ${tabId}`);
}

async function inject(browser, tabId) {
  const worker = await getWorker(browser);
  // This calls the same injection helper used by the action click path; the e2e runner only bypasses the Instagram URL gate.
  await worker.evaluate((id) => {
    void injectInstagramCollector(id);
    return true;
  }, tabId);
}

async function sendDevtoolsUsernames(browser, tabId, mode, usernames) {
  const worker = await getWorker(browser);
  await worker.evaluate(async ({ id, modeName, users }) => {
    await chrome.tabs.sendMessage(id, {
      type: 'IG_DEVTOOLS_USERNAMES',
      source: 'devtools-network',
      schemaVersion: 1,
      mode: modeName,
      status: 200,
      usernames: users,
      pagination: {
        exactEndpoint: true,
        itemCount: users.length,
        recognized: true,
        hasMore: false,
        terminal: true,
        terminalReason: 'fixture_terminal_page'
      },
      capturedAt: new Date().toISOString()
    });
  }, { id: tabId, modeName: mode, users: usernames });
}

async function sendDevtoolsStatus(browser, tabId, reason) {
  const worker = await getWorker(browser);
  await worker.evaluate(async ({ id, statusReason }) => {
    await chrome.tabs.sendMessage(id, {
      type: 'IG_DEVTOOLS_STATUS',
      source: 'devtools-network',
      schemaVersion: 1,
      reason: statusReason,
      capturedAt: new Date().toISOString()
    });
  }, { id: tabId, statusReason: reason });
}

async function waitForResult(browser, timeout = 120000, logs = []) {
  const worker = await getWorker(browser);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const result = await worker.evaluate(async () => {
      const storage = await chrome.storage.session.get(null);
      const lastRun = storage['ig_follower_snapshot:lastRun'];
      return lastRun?.ref ? storage[lastRun.ref] || null : null;
    });
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for session snapshot\nRecent page logs:\n${logs.slice(-40).join('\n')}`);
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
  const comparison = result.trustVerdict?.code === 'REFERENCE_ONLY'
    ? result.diffs.assistedPreview
    : result.diffs;
  assert.equal(result.followers.length, EXPECTED.followers);
  assert.equal(result.following.length, EXPECTED.following);
  assert.equal(result.trustVerdict?.code, 'REFERENCE_ONLY');
  assert.equal(result.diffs.mutualCount, 0, 'strict final diff must exclude DOM-only evidence');
  assert.equal(comparison.mutualCount, EXPECTED.mutual);
  assert.equal(comparison.followersWithoutMeFollowing.length, EXPECTED.followersOnly);
  assert.equal(comparison.iFollowButNotReturned.length, EXPECTED.followingOnly);
  assert.equal(result.diffs.integrity.ok, true);
  assert(logs.some((line) => line.includes('Instagram 비교 결과')), 'missing Korean comparison card log');
}

async function scenarioStandard(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  const result = await waitForResult(browser, 120000, logs);
  assertStandardResult(result, logs);
  const progress = await waitForRunProgress(browser, tabId);
  assert.equal(progress.accounts?.relationshipSet, 'assisted');
  assert.equal(progress.accounts?.followersWithoutMeFollowing?.length, EXPECTED.followersOnly);
  assert.equal(progress.accounts?.iFollowButNotReturned?.length, EXPECTED.followingOnly);
  assert.deepEqual(progress.accounts?.followersCandidates, []);
  assert.deepEqual(progress.accounts?.followingCandidates, []);
  assert(progress.accounts?.evidence?.followersWithoutMeFollowing?.every((item) => item.level === 'reference' && item.source === 'dom'));
  assert(progress.accounts?.evidence?.iFollowButNotReturned?.every((item) => item.level === 'reference' && item.source === 'dom'));
  await page.close();
}

async function scenarioDoubleInject(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await inject(browser, tabId);
  const result = await waitForResult(browser, 120000, logs);
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
  const result = await waitForResult(browser, 120000, logs);
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
  await sendDevtoolsStatus(browser, tabId, 'rate-limited');
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(logs.some((line) => line.includes('요청 제한(429) 신호 감지')), 'missing 429 detection Korean log');
  assert(logs.some((line) => line.includes('일시정지')), 'missing pause Korean log');
  await page.close();
}

async function scenarioDisplayedCountIncludesInactive(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin, '?display_gap=2');
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await sendDevtoolsUsernames(browser, tabId, 'followers', FOLLOWERS);
  await sendDevtoolsUsernames(browser, tabId, 'following', FOLLOWING);
  const result = await waitForResult(browser, 120000, logs);
  assert.equal(result.trustVerdict?.code, 'CONFIRMED', JSON.stringify({
    trustVerdict: result.trustVerdict,
    completion: result.completion,
    pagination: result.pagination,
    sourceCounts: {
      followers: result.snapshots?.followers?.sourceCounts,
      following: result.snapshots?.following?.sourceCounts
    },
    recentLogs: logs.slice(-30)
  }, null, 2));
  assert.equal(result.followers.length, EXPECTED.followers);
  assert.equal(result.following.length, EXPECTED.following);
  assert.equal(result.diffs.mutualCount, EXPECTED.mutual);
  assert.equal(result.diffs.followersWithoutMeFollowing.length, EXPECTED.followersOnly);
  assert.equal(result.diffs.iFollowButNotReturned.length, EXPECTED.followingOnly);
  assert.equal(result.diffs.integrity.ok, true);
  const progress = await waitForRunProgress(browser, tabId);
  assert.equal(progress.accounts?.relationshipSet, 'strict');
  assert.equal(progress.accounts?.followersWithoutMeFollowing?.length, EXPECTED.followersOnly);
  assert.equal(progress.accounts?.iFollowButNotReturned?.length, EXPECTED.followingOnly);
  assert(progress.accounts?.evidence?.followersWithoutMeFollowing?.every((item) => item.level === 'confirmed' && item.source === 'devtools'));
  assert(progress.accounts?.evidence?.iFollowButNotReturned?.every((item) => item.level === 'confirmed' && item.source === 'devtools'));
  assert.equal(result.followersCompletion?.completeAtListEnd, true);
  assert.equal(result.followingCompletion?.completeAtListEnd, true);
  assert(logs.some((line) => line.includes('확정 비교 가능')), 'missing confirmed trust gate log');
  assert(!logs.some((line) => line.includes('누락 재검증')), 'unexpected reverify log');
  assert(!logs.some((line) => line.includes('부족분 보정으로 승격')), 'unexpected DOM promotion log');
  await page.close();
}

async function scenarioStorageRef(browser, origin) {
  const { page, logs } = await openFixturePage(browser, origin);
  const tabId = await getFixtureTabId(browser);
  await inject(browser, tabId);
  await waitForResult(browser, 120000, logs);
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

  const allScenarios = [
    ['A standard collection', () => scenarioStandard(browser, fixture.origin)],
    ['B double injection', () => scenarioDoubleInject(browser, fixture.origin)],
    ['C forced modal close', () => scenarioModalClosed(browser, fixture.origin)],
    ['D synthetic 429 signal', () => scenarioRateLimit(browser, fixture.origin)],
    ['F displayed count includes inactive', () => scenarioDisplayedCountIncludesInactive(browser, fixture.origin)],
    ['E storage lastRun ref', () => scenarioStorageRef(browser, fixture.origin)]
  ];
  const scenarioFilter = String(process.env.E2E_SCENARIO || '').trim().toLowerCase();
  const scenarios = scenarioFilter
    ? allScenarios.filter(([name]) => name.toLowerCase().includes(scenarioFilter))
    : allScenarios;

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
