import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { EXPECTED, startFixtureServer } from './fixture-server.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const build = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-real-capture-'));
// Only the test copy accepts the loopback fixture. Capture, injection, parser,
// relay, completion and popup handlers are the production implementations.
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
for (const name of await fs.readdir(root)) {
  if (/\.(js|html|css)$/.test(name)) await fs.copyFile(path.join(root, name), path.join(build, name));
}
await fs.writeFile(path.join(build, 'manifest.json'), JSON.stringify(manifest));
async function replaceOnce(name, before, after) {
  const file = path.join(build, name);
  const source = await fs.readFile(file, 'utf8');
  assert.equal(source.split(before).length, 2, `test-origin adapter must match once: ${name}`);
  await fs.writeFile(file, source.replace(before, after));
}
for (const name of ['background.js', 'network-payload-parser.js']) {
  await replaceOnce(name, 'return parsed.protocol === "https:" &&',
    'return (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1") || parsed.protocol === "https:" &&');
}
await replaceOnce('popup.js', 'return url.protocol === "https:" &&',
  'return (url.protocol === "http:" && url.hostname === "127.0.0.1") || url.protocol === "https:" &&');
await replaceOnce('run-context.js', 'if (url.protocol !== "https:"',
  'if (url.protocol === "http:" && hostname === "127.0.0.1") return normalizeProfile(url.pathname.split("/").filter(Boolean)[0]);\n      if (url.protocol !== "https:"');

const fixture = await startFixtureServer({ captureNetwork: true });
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  headless: true, pipe: true, enableExtensions: [build], executablePath, waitForInitialPage: false,
  // Puppeteer's automatic page debugger would otherwise make the production
  // busy-target guard correctly refuse our own fixture tab.
  targetFilter: (target) => target.type() !== 'page' || target.url().startsWith('chrome-extension://')
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function worker() {
  return (await browser.waitForTarget((target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'))).worker();
}
async function until(fn, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await sleep(100); }
  throw new Error('real capture condition timed out');
}
async function openPopup(w) {
  await w.evaluate(() => chrome.action.openPopup());
  const target = await browser.waitForTarget((target) => target.type() === 'page' && target.url().endsWith('/popup.html'));
  const popup = await target.asPage();
  await popup.waitForFunction(() => document.querySelector('#runProfile')?.textContent.includes('fixtureprofile') && !document.querySelector('#startButton').disabled);
  return popup;
}
try {
  let w = await worker();
  // Use the Tabs API so Puppeteer never claims the inspected fixture target.
  const tabId = await w.evaluate(async (url) => (await chrome.tabs.create({ url, active: true })).id, `${fixture.origin}/fixtureprofile/`);
  await until(() => w.evaluate(async (id) => (await chrome.tabs.get(id)).status === 'complete', tabId));
  const popup = await openPopup(w);
  const logs = [];
  w.on('console', (message) => logs.push(message.text()));
  popup.on('pageerror', (error) => logs.push(error.message));
  await popup.$eval('#startButton', (button) => button.click());
  let lastProgress;
  let lastStage = '';
  const progress = await until(async () => {
    lastProgress = await w.evaluate(async (id) => {
    const key = `ig_run_progress:tab:${id}`;
    const result = (await chrome.storage.session.get(key))[key];
    return { result, capture: debuggerController.getSession(id), attempt: automaticCaptureAttempts.get(id) };
    }, tabId);
    const stage = `${lastProgress.result?.stage || 'waiting'}:${lastProgress.capture?.lastReason || lastProgress.attempt?.reason || 'no-capture'}`;
    if (stage !== lastStage) { console.log(`capture progress: ${stage}`); lastStage = stage; }
    return lastProgress.result?.stage === 'finished' ? lastProgress.result : null;
  }).catch(async (error) => {
    throw new Error(`${error.message}\n${JSON.stringify(lastProgress)}\nPopup: ${await popup.$eval('body', (body) => body.innerText)}\nLogs: ${logs.slice(-15).join('\n')}`);
  });
  assert.equal(progress.verdict.code, 'CONFIRMED', JSON.stringify(progress));
  assert.equal(progress.sources.debuggerEvidence, true);
  assert.equal(progress.counts.followers.confirmed, EXPECTED.followers);
  assert.equal(progress.counts.following.confirmed, EXPECTED.following);
  assert.equal(progress.counts.mutual, EXPECTED.mutual);
  assert.equal(progress.accounts.iFollowButNotReturned.length, EXPECTED.followingOnly);
  assert.equal(progress.accounts.followersWithoutMeFollowing.length, EXPECTED.followersOnly);
  assert.equal(await w.evaluate((id) => debuggerController.hasSession(id), tabId), false);
  console.log('PASS actual popup -> debugger Network -> parser -> compare -> storage -> detach (36/30, mutual 24)');
  await popup.$eval('#startButton', (button) => button.click());
  const running = await until(() => w.evaluate(async (id) => {
    const value = (await chrome.storage.session.get(`ig_run_progress:tab:${id}`))[`ig_run_progress:tab:${id}`];
    return value?.stage === 'collecting_followers' && value.counts.followers.confirmed > 0 ? value : null;
  }, tabId));
  const staleStop = await popup.evaluate(({ tabId, runId }) => chrome.runtime.sendMessage({
    type: 'IG_STOP_COLLECTION', tabId, runId
  }), { tabId, runId: progress.runId });
  assert.equal(staleStop.ok, false, 'previous run must not cancel current run');
  await popup.waitForFunction(() => !document.querySelector('#stopButton').hidden && !document.querySelector('#stopButton').disabled);
  const stoppedAt = Date.now();
  await popup.$eval('#stopButton', (button) => button.click());
  const stopped = await until(() => w.evaluate(async (id) => {
    const value = (await chrome.storage.session.get(`ig_run_progress:tab:${id}`))[`ig_run_progress:tab:${id}`];
    return value?.status === 'partial_cancelled' && value.stage === 'finished' ? value : null;
  }, tabId), 10000);
  assert(Date.now() - stoppedAt < 5000, 'cancel must interrupt waits promptly');
  assert.equal(stopped.runId, running.runId);
  assert.equal(stopped.verdict.code, 'PARTIAL');
  assert.equal(stopped.accounts.relationshipSet, 'partial');
  assert(stopped.counts.followers.confirmed >= running.counts.followers.confirmed, 'retain captured users');
  assert.equal(await w.evaluate((id) => debuggerController.hasSession(id), tabId), false);
  await until(() => w.evaluate(async (runId) => {
    const value = (await chrome.storage.session.get('ig_follower_snapshot:fixtureprofile'))['ig_follower_snapshot:fixtureprofile'];
    return value?.runId === runId && value.trustVerdict.code === 'PARTIAL';
  }, stopped.runId));
  const lateResponse = await w.evaluate((id) => chrome.tabs.sendMessage(id, {
    type: 'IG_DEVTOOLS_USERNAMES', source: 'devtools-network', schemaVersion: 1,
    mode: 'followers', status: 200, endpoint: 'instagram:followers:exact',
    usernames: ['late_after_cancel'], pagination: { exactEndpoint: true, recognized: true, terminal: true, hasMore: false }
  }), tabId);
  assert(lateResponse?.ignored, 'late responses after cancellation must be ignored');
  assert.deepEqual(await popup.evaluate(async (id) =>
    (await chrome.storage.session.get(`ig_run_progress:tab:${id}`))[`ig_run_progress:tab:${id}`].counts, tabId), stopped.counts);
  console.log('PASS popup cancellation -> partial preservation -> detach; stale cancel and late response rejected');
  // Real worker termination: session result survives and a popup action wakes it.
  await w.close();
  assert.equal(await popup.evaluate(async (id) => (await chrome.storage.session.get(`ig_run_progress:tab:${id}`))[`ig_run_progress:tab:${id}`].runId, tabId), stopped.runId);
  await popup.$eval('#startButton', (button) => button.click());
  w = await worker();
  await until(() => w.evaluate((id) => debuggerController.hasSession(id), tabId));
  await w.evaluate((id) => chrome.debugger.detach({ tabId: id }), tabId);
  await until(() => w.evaluate((id) => !debuggerController.hasSession(id), tabId));
  console.log('PASS worker restart + explicit debugger detach');
  await w.evaluate((id) => chrome.tabs.update(id, { url: 'about:blank' }), tabId);
  await until(() => w.evaluate(async (id) => !(await chrome.storage.session.get(`ig_run_progress:tab:${id}`))[`ig_run_progress:tab:${id}`], tabId));
  await w.evaluate((id) => chrome.tabs.remove(id), tabId);
  console.log('PASS navigation + tab close cleanup');
} finally {
  await browser.close();
  await fixture.close();
  await fs.rm(build, { recursive: true, force: true });
}
