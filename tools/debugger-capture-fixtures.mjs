import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeEvent {
  listeners = [];
  addListener(listener) { this.listeners.push(listener); }
  emit(...args) { this.listeners.forEach((listener) => listener(...args)); }
}

function createFakeChrome(options = {}) {
  const calls = [];
  const onEvent = new FakeEvent();
  const onDetach = new FakeEvent();
  const chromeApi = {
    debugger: {
      onEvent,
      onDetach,
      async getTargets() {
        calls.push(['getTargets']);
        return options.targets || [];
      },
      async attach(target, version) {
        calls.push(['attach', target, version]);
        if (options.attachError) throw new Error(options.attachError);
      },
      async detach(target) {
        calls.push(['detach', target]);
      },
      async sendCommand(target, method, params) {
        calls.push(['sendCommand', target, method, params]);
        if (method === 'Network.enable' && options.enableError) throw new Error(options.enableError);
        if (method === 'Network.getResponseBody') {
          if (options.getBody) return options.getBody(params.requestId);
          return options.bodyResponse || {
            body: JSON.stringify({ users: [{ username: 'Exact_User' }], has_more: false }),
            base64Encoded: false
          };
        }
        return {};
      }
    }
  };
  return { chromeApi, calls, onEvent, onDetach };
}

const accuracySource = fs.readFileSync(new URL('../accuracy-engine.js', import.meta.url), 'utf8');
const parserSource = fs.readFileSync(new URL('../network-payload-parser.js', import.meta.url), 'utf8');
const captureSource = fs.readFileSync(new URL('../debugger-capture.js', import.meta.url), 'utf8');
const context = vm.createContext({
  URL,
  TextDecoder,
  Uint8Array,
  atob: (value) => globalThis.atob(String(value)),
  Date,
  Math,
  setTimeout,
  crypto: { randomUUID: () => 'fixture-session' }
});
vm.runInContext(accuracySource, context, { filename: 'accuracy-engine.js' });
vm.runInContext(parserSource, context, { filename: 'network-payload-parser.js' });
vm.runInContext(captureSource, context, { filename: 'debugger-capture.js' });

const Capture = context.IGDebuggerCapture;
assert(Capture, 'IGDebuggerCapture global was not installed');
assert.equal(Object.isFrozen(Capture), true);

{
  const fake = createFakeChrome();
  const evidence = [];
  const statuses = [];
  const controller = Capture.createController({
    chromeApi: fake.chromeApi,
    parser: context.IGNetworkPayloadParser,
    randomUUID: () => 'one',
    onEvidence: (item) => evidence.push(item),
    onStatus: (item) => statuses.push(item)
  });
  const started = await controller.start(7);
  assert.equal(started.ok, true);
  assert.equal(started.session.captureSessionId, 'dbg-one');
  assert.equal(fake.calls.some((call) => call[0] === 'attach' && call[2] === '1.3'), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fake.calls.find((call) => call[0] === 'sendCommand' && call[2] === 'Network.enable')[3])),
    { maxTotalBufferSize: 2_097_152, maxResourceBufferSize: 524_288 }
  );
  assert.equal(controller.bind(7, { runId: 'run-1', profile: 'owner' }).ok, true);

  fake.onEvent.emit({ tabId: 7 }, 'Network.responseReceived', {
    requestId: 'request-secret',
    type: 'XHR',
    response: {
      url: 'https://www.instagram.com/api/v1/friendships/123/followers/?max_id=secret',
      status: 200,
      mimeType: 'application/json'
    }
  });
  fake.onEvent.emit({ tabId: 7 }, 'Network.loadingFinished', { requestId: 'request-secret' });
  await controller.flush();
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].captureSessionId, 'dbg-one');
  assert.equal(evidence[0].runId, 'run-1');
  assert.equal(evidence[0].endpoint, 'instagram:endpoint:followers');
  assert.deepEqual(JSON.parse(JSON.stringify(evidence[0].usernames)), ['exact_user']);
  assert.equal(JSON.stringify(evidence[0]).includes('request-secret'), false);
  assert.equal(JSON.stringify(evidence[0]).includes('max_id'), false);
  assert.equal(JSON.stringify(evidence[0]).includes('body'), false);

  const stopped = await controller.stop(7, 'completed', 'dbg-one');
  assert.equal(stopped.detached, true);
  assert.equal(controller.hasSession(7), false);
  assert.equal(fake.calls.some((call) => call[0] === 'sendCommand' && call[2] === 'Network.disable'), true);
  assert.equal(fake.calls.some((call) => call[0] === 'detach'), true);
  assert.equal(statuses.some((status) => status.type === 'ready' && status.reason === 'bound'), true);
}

{
  const fake = createFakeChrome({ targets: [{ tabId: 8, attached: true }] });
  const controller = Capture.createController({ chromeApi: fake.chromeApi, parser: context.IGNetworkPayloadParser });
  const result = await controller.start(8);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'debugger-busy');
  assert.equal(fake.calls.some((call) => call[0] === 'attach'), false);
}

{
  const fake = createFakeChrome({ enableError: 'enable failed' });
  const controller = Capture.createController({ chromeApi: fake.chromeApi, parser: context.IGNetworkPayloadParser });
  const result = await controller.start(9);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'attach-or-enable-failed');
  assert.equal(fake.calls.some((call) => call[0] === 'detach'), true);
}

{
  const fake = createFakeChrome();
  const statuses = [];
  const controller = Capture.createController({
    chromeApi: fake.chromeApi,
    parser: context.IGNetworkPayloadParser,
    onStatus: (item) => statuses.push(item)
  });
  await controller.start(10);
  controller.bind(10, { runId: 'run-2', profile: 'owner' });
  fake.onDetach.emit({ tabId: 10 }, 'canceled_by_user');
  assert.equal(controller.hasSession(10), false);
  assert.equal(statuses.some((status) => status.type === 'detached' && status.reason === 'canceled_by_user'), true);
}

function receive(fake, id, order = 1) {
  fake.onEvent.emit({ tabId: 11 }, 'Network.responseReceived', {
    requestId: id, type: 'Fetch',
    response: { url: 'https://www.instagram.com/api/v1/friendships/123/followers/', status: 200, mimeType: 'application/json', timing: { requestTime: order } }
  });
  fake.onEvent.emit({ tabId: 11 }, 'Network.loadingFinished', { requestId: id });
}
{
  const bodies = new Map();
  const evidence = [];
  let releaseDelivery;
  const fake = createFakeChrome({ getBody: (id) => new Promise((resolve) => bodies.set(id, resolve)) });
  const controller = Capture.createController({ chromeApi: fake.chromeApi, parser: context.IGNetworkPayloadParser,
    onEvidence: async (item) => { evidence.push(item); await new Promise((resolve) => { releaseDelivery = resolve; }); } });
  await controller.start(11);
  controller.bind(11, { runId: 'ordered', profile: 'owner' });
  receive(fake, 'older', 10);
  receive(fake, 'newer', 20);
  assert.equal(controller.getSession(11).listHealth.followers.pendingCount, 2, 'body reads remain pending');
  bodies.get('newer')({ body: JSON.stringify({ users: [{ username: 'new' }], has_more: false }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSession(11).listHealth.followers.pendingCount, 2, 'delivery acknowledgement is part of capture');
  releaseDelivery();
  await new Promise((resolve) => setTimeout(resolve, 0));
  bodies.get('older')({ body: JSON.stringify({ users: [{ username: 'old' }], has_more: true }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseDelivery();
  await controller.flush();
  assert.deepEqual(evidence.map((item) => item.requestOrder), [20, 10]);
  receive(fake, 'older', 10);
  assert.equal(controller.getSession(11).pendingCount, 0, 'duplicate events are ignored');
  const settled = await controller.settle(11, 'ordered', 0);
  assert.equal(settled.session.listHealth.followers.pendingCount, 0);
  await controller.stop(11);
}
{
  const fake = createFakeChrome({ getBody: async () => { throw new Error('unavailable'); } });
  const controller = Capture.createController({ chromeApi: fake.chromeApi, parser: context.IGNetworkPayloadParser });
  await controller.start(11);
  controller.bind(11, { runId: 'failed', profile: 'owner' });
  receive(fake, 'bad');
  await controller.flush();
  assert.equal(controller.getSession(11).listHealth.followers.failedCount, 1);
  assert.equal(controller.getSession(11).listHealth.following.failedCount, 0);
  await controller.stop(11);
}
{
  let release;
  const evidence = [];
  const fake = createFakeChrome({ getBody: () => new Promise((resolve) => { release = resolve; }) });
  const controller = Capture.createController({ chromeApi: fake.chromeApi, parser: context.IGNetworkPayloadParser, onEvidence: (item) => evidence.push(item) });
  await controller.start(11);
  controller.bind(11, { runId: 'stopped', profile: 'owner' });
  receive(fake, 'late');
  await controller.stop(11);
  release({ body: JSON.stringify({ users: [{ username: 'late' }], has_more: false }) });
  await controller.flush();
  assert.equal(evidence.length, 0, 'stop must seal late body reads');
}
console.log('debugger capture fixtures passed');
