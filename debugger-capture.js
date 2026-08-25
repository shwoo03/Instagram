(function installIGDebuggerCapture(globalObject) {
  "use strict";

  if (globalObject.IGDebuggerCapture && Object.isFrozen(globalObject.IGDebuggerCapture)) {
    return;
  }

  const CDP_VERSION = "1.3";
  const MAX_PENDING_REQUESTS = 128;
  const PENDING_TTL_MS = 30_000;
  const NETWORK_ENABLE_OPTIONS = Object.freeze({
    maxTotalBufferSize: 2_097_152,
    maxResourceBufferSize: 524_288
  });

  function safeTabId(value) {
    const tabId = Number(value);
    return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
  }

  function safeReason(value, fallback = "unknown") {
    const reason = String(value || fallback).toLowerCase().replace(/[^a-z0-9._:-]/g, "-");
    return reason.slice(0, 100) || fallback;
  }

  function safeRunId(value) {
    return String(value || "").slice(0, 100);
  }

  function safeProfile(value) {
    const profile = String(value || "unknown_profile").trim().toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(profile) ? profile : "unknown_profile";
  }

  function createCaptureId(randomUUID) {
    try {
      return `dbg-${randomUUID()}`.slice(0, 100);
    } catch {
      return `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
  }

  function createController(options = {}) {
    const chromeApi = options.chromeApi || globalObject.chrome;
    const parser = options.parser || globalObject.IGNetworkPayloadParser;
    const now = typeof options.now === "function" ? options.now : Date.now;
    const randomUUID = typeof options.randomUUID === "function"
      ? options.randomUUID
      : (() => globalObject.crypto?.randomUUID?.() || `${now()}-${Math.random().toString(36).slice(2, 12)}`);
    const onEvidence = typeof options.onEvidence === "function" ? options.onEvidence : () => {};
    const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
    const sessions = new Map();
    const inFlight = new Set();

    if (!chromeApi?.debugger || !parser) {
      throw new Error("debugger-capture-dependencies-unavailable");
    }

    function publicSession(session) {
      if (!session) return null;
      return Object.freeze({
        tabId: session.tabId,
        captureSessionId: session.captureSessionId,
        runId: session.runId,
        profile: session.profile,
        attached: session.attached === true,
        bound: Boolean(session.runId && session.profile),
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        payloadCount: session.payloadCount,
        candidatePayloadCount: session.candidatePayloadCount,
        failureCount: session.failureCount,
        pendingCount: session.pending.size,
        lastReason: session.lastReason
      });
    }

    function emitStatus(session, type, reason, extra = {}) {
      onStatus(Object.freeze({
        type,
        reason: safeReason(reason),
        tabId: session?.tabId ?? safeTabId(extra.tabId),
        captureSessionId: session?.captureSessionId || "",
        runId: session?.runId || "",
        profile: session?.profile || "unknown_profile",
        capturedAt: new Date(now()).toISOString(),
        ...extra
      }));
    }

    function track(promise) {
      const tracked = Promise.resolve(promise).finally(() => inFlight.delete(tracked));
      inFlight.add(tracked);
      return tracked;
    }

    function cleanupPending(session) {
      const cutoff = now() - PENDING_TTL_MS;
      for (const [requestId, metadata] of session.pending) {
        if (metadata.createdAt < cutoff) session.pending.delete(requestId);
      }
      while (session.pending.size > MAX_PENDING_REQUESTS) {
        const oldest = session.pending.keys().next().value;
        if (oldest === undefined) break;
        session.pending.delete(oldest);
      }
    }

    async function targetIsAttached(tabId) {
      const targets = await chromeApi.debugger.getTargets();
      return Array.isArray(targets) && targets.some((target) => target?.tabId === tabId && target?.attached === true);
    }

    async function start(tabIdValue) {
      const tabId = safeTabId(tabIdValue);
      if (tabId === null) return Object.freeze({ ok: false, reason: "invalid-tab-id" });
      const existing = sessions.get(tabId);
      if (existing?.attached) return Object.freeze({ ok: true, session: publicSession(existing), reused: true });

      try {
        if (await targetIsAttached(tabId)) {
          emitStatus(null, "busy", "debugger-busy", { tabId });
          return Object.freeze({ ok: false, reason: "debugger-busy" });
        }
      } catch (error) {
        emitStatus(null, "failed", "target-query-failed", { tabId, error: safeReason(error?.message, "target-query-failed") });
        return Object.freeze({ ok: false, reason: "target-query-failed" });
      }

      const session = {
        tabId,
        captureSessionId: createCaptureId(randomUUID),
        runId: "",
        profile: "unknown_profile",
        attached: false,
        stopping: false,
        startedAt: new Date(now()).toISOString(),
        lastActivityAt: new Date(now()).toISOString(),
        payloadCount: 0,
        candidatePayloadCount: 0,
        failureCount: 0,
        lastReason: "starting",
        pending: new Map()
      };
      sessions.set(tabId, session);

      try {
        await chromeApi.debugger.attach({ tabId }, CDP_VERSION);
        session.attached = true;
        await chromeApi.debugger.sendCommand({ tabId }, "Network.enable", { ...NETWORK_ENABLE_OPTIONS });
        session.lastReason = "network-ready";
        session.lastActivityAt = new Date(now()).toISOString();
        emitStatus(session, "ready", "network-ready");
        return Object.freeze({ ok: true, session: publicSession(session), reused: false });
      } catch (error) {
        session.failureCount++;
        session.lastReason = "attach-or-enable-failed";
        if (session.attached) {
          try {
            await chromeApi.debugger.detach({ tabId });
          } catch {
            // 실패한 초기화 세션은 아래에서 로컬 상태를 정리한다.
          }
        }
        sessions.delete(tabId);
        emitStatus(session, "failed", "attach-or-enable-failed", {
          error: safeReason(error?.message, "attach-or-enable-failed")
        });
        return Object.freeze({ ok: false, reason: "attach-or-enable-failed" });
      }
    }

    function bind(tabIdValue, binding = {}) {
      const tabId = safeTabId(tabIdValue);
      const session = tabId === null ? null : sessions.get(tabId);
      const runId = safeRunId(binding.runId);
      const profile = safeProfile(binding.profile);
      if (!session?.attached) return Object.freeze({ ok: false, reason: "debugger-session-unavailable" });
      if (!runId || profile === "unknown_profile") return Object.freeze({ ok: false, reason: "invalid-debugger-binding" });
      if (session.runId && session.runId !== runId) session.pending.clear();
      session.runId = runId;
      session.profile = profile;
      session.lastReason = "bound";
      session.lastActivityAt = new Date(now()).toISOString();
      emitStatus(session, "ready", "bound");
      return Object.freeze({ ok: true, session: publicSession(session) });
    }

    async function stop(tabIdValue, reason = "completed", captureSessionId = "", runId = "") {
      const tabId = safeTabId(tabIdValue);
      const session = tabId === null ? null : sessions.get(tabId);
      if (!session) return Object.freeze({ ok: true, detached: false, reason: "no-debugger-session" });
      if (captureSessionId && captureSessionId !== session.captureSessionId) {
        return Object.freeze({ ok: false, detached: false, reason: "capture-session-mismatch" });
      }
      if (runId && safeRunId(runId) !== session.runId) {
        return Object.freeze({ ok: false, detached: false, reason: "debugger-run-mismatch" });
      }

      session.stopping = true;
      session.lastReason = safeReason(reason, "completed");
      session.pending.clear();
      try {
        await chromeApi.debugger.sendCommand({ tabId }, "Network.disable");
      } catch {
        // detach가 최종 정리 경계다.
      }
      try {
        await chromeApi.debugger.detach({ tabId });
      } catch {
        // 닫힌 탭이나 이미 분리된 세션도 로컬 상태는 제거한다.
      }
      sessions.delete(tabId);
      emitStatus(session, "stopped", session.lastReason);
      return Object.freeze({ ok: true, detached: true, reason: session.lastReason });
    }

    async function processFinishedBody(session, requestId, metadata) {
      try {
        const result = await chromeApi.debugger.sendCommand(
          { tabId: session.tabId },
          "Network.getResponseBody",
          { requestId }
        );
        if (
          sessions.get(session.tabId) !== session ||
          !session.attached ||
          !session.runId ||
          metadata.runId !== session.runId ||
          metadata.profile !== session.profile ||
          metadata.captureSessionId !== session.captureSessionId
        ) return;
        const parsed = parser.parseResponse({
          ...metadata,
          body: result?.body || "",
          base64Encoded: result?.base64Encoded === true
        });
        if (!parsed?.ok) {
          session.failureCount++;
          session.lastReason = parsed?.reason || "response-parse-failed";
          if (["body-too-large", "base64-decode-failed", "empty-response-body"].includes(parsed?.reason)) {
            emitStatus(session, "degraded", parsed.reason);
          }
          return;
        }

        session.lastActivityAt = new Date(now()).toISOString();
        if (parsed.evidence.confidence === "exact") session.payloadCount++;
        else session.candidatePayloadCount++;
        onEvidence(Object.freeze({
          ...parsed.evidence,
          type: "usernames",
          tabId: session.tabId,
          captureSessionId: session.captureSessionId,
          runId: session.runId,
          profile: session.profile,
          capturedAt: session.lastActivityAt
        }));
      } catch (error) {
        if (sessions.get(session.tabId) !== session) return;
        session.failureCount++;
        session.lastReason = "response-body-unavailable";
        emitStatus(session, "degraded", "response-body-unavailable", {
          error: safeReason(error?.message, "response-body-unavailable")
        });
      }
    }

    function handleEvent(source, method, params = {}) {
      const tabId = safeTabId(source?.tabId);
      const session = tabId === null ? null : sessions.get(tabId);
      if (!session?.attached || source?.sessionId) return;
      cleanupPending(session);

      if (method === "Network.responseReceived") {
        const metadata = {
          url: String(params.response?.url || ""),
          status: Number(params.response?.status || 0),
          mimeType: String(params.response?.mimeType || ""),
          resourceType: String(params.type || ""),
          createdAt: now(),
          runId: session.runId,
          profile: session.profile,
          captureSessionId: session.captureSessionId
        };
        if (!parser.isCandidateRequestMetadata(metadata)) return;
        if (metadata.status === 429) {
          if (session.runId) emitStatus(session, "rate-limited", "rate-limited", { httpStatus: 429 });
          return;
        }
        if (!session.runId || metadata.status < 200 || metadata.status >= 300) return;
        const requestId = String(params.requestId || "");
        if (!requestId) return;
        session.pending.set(requestId, metadata);
        cleanupPending(session);
        return;
      }

      if (method === "Network.loadingFailed") {
        const requestId = String(params.requestId || "");
        if (!session.pending.delete(requestId)) return;
        session.failureCount++;
        session.lastReason = "loading-failed";
        emitStatus(session, "degraded", "loading-failed", {
          error: safeReason(params.errorText, "loading-failed")
        });
        return;
      }

      if (method === "Network.loadingFinished") {
        const requestId = String(params.requestId || "");
        const metadata = session.pending.get(requestId);
        if (!metadata) return;
        session.pending.delete(requestId);
        track(processFinishedBody(session, requestId, metadata));
      }
    }

    function handleDetach(source, reason) {
      const tabId = safeTabId(source?.tabId);
      const session = tabId === null ? null : sessions.get(tabId);
      if (!session) return;
      sessions.delete(tabId);
      session.attached = false;
      session.pending.clear();
      if (session.stopping) return;
      session.lastReason = safeReason(reason, "detached");
      emitStatus(session, "detached", session.lastReason);
    }

    chromeApi.debugger.onEvent.addListener(handleEvent);
    chromeApi.debugger.onDetach.addListener(handleDetach);

    return Object.freeze({
      bind,
      getSession: (tabId) => publicSession(sessions.get(safeTabId(tabId))),
      hasSession: (tabId) => sessions.has(safeTabId(tabId)),
      start,
      stop,
      flush: async () => {
        while (inFlight.size > 0) await Promise.all(Array.from(inFlight));
      }
    });
  }

  const namespace = Object.freeze({
    CDP_VERSION,
    MAX_PENDING_REQUESTS,
    NETWORK_ENABLE_OPTIONS,
    PENDING_TTL_MS,
    createController
  });

  Object.defineProperty(globalObject, "IGDebuggerCapture", {
    value: namespace,
    writable: false,
    configurable: true,
    enumerable: true
  });
})(globalThis);
