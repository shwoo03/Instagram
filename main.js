{
    // --- [공통 도우미 함수: 랜덤 대기] ---
    const wait = (base, jitter = 0) => new Promise(resolve => setTimeout(resolve, base + Math.random() * jitter));

    const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
    const FOLLOWERS_URL_RE = /(friendships|followers|following|graphql)/i;
    const MAX_STABLE_TICKS = 16;
    const MAX_FOLLOW_STABLE_TICKS = 12;
    const MAX_MISMATCH_REVERIFY_PASSES = 1;
    const LIST_SETTLE_REQUIRED_TICKS = 3;
    const LIST_SETTLE_MAX_TICKS = 12;
    const TARGET_COUNT = 288;
    const STORAGE_PREFIX = "ig_follower_snapshot";
    const EXECUTION_MODE = "collect-and-compare";
    const FOLLOW_ACTION_ENABLED = false;
    const FINAL_DIFF_POLICY = "verified_members_only";
    const LOW_COVERAGE_RECOVERY_RATIO = 0.7;
    const LOW_COVERAGE_STABLE_TICKS = 3;
    const MAX_SCROLL_RECOVERY_ATTEMPTS = 3;

    const FOLLOWER_BUTTON_XPATH = "//a[contains(@href, '/followers/')] | //span[contains(text(), '팔로워')] | //span[contains(text(), 'Followers')]";
    const FOLLOWING_BUTTON_XPATH = "//a[contains(@href, '/following/')] | //span[contains(text(), '팔로잉')] | //span[contains(text(), 'Following')] | //span[contains(normalize-space(.), '팔로우') and .//span]";
    const KIND_CONFIG = {
        followers: {
            path: "/followers/",
            textRe: /(팔로워|followers)/i,
            xpath: FOLLOWER_BUTTON_XPATH
        },
        following: {
            path: "/following/",
            textRe: /(팔로잉|following|팔로우\s*\d+)/i,
            xpath: FOLLOWING_BUTTON_XPATH
        }
    };
    const KIND_ALT_TEXTS = {
        followers: ["팔로워", "followers", "팔로어"],
        following: ["팔로잉", "following", "following"]
    };
    const KIND_CANDIDATE_LIMIT = 12;
    const RESERVED_PROFILE_NAMES = new Set([
        "about",
        "accounts",
        "api",
        "challenge",
        "direct",
        "explore",
        "graphql",
        "legal",
        "oauth",
        "p",
        "privacy",
        "reel",
        "reels",
        "stories",
        "threads",
        "tv"
    ]);

    const state = {
        collectedUsers: new Set(),
        followingUsers: new Set(),
        runId: "",
        lastCount: 0,
        stableTicks: 0,
        followButtonsClicked: 0,
        followedUsers: new Set(),
        followersScrollBox: null,
        lastScrollBoxCandidates: [],
        scrollDiagnostics: [],
        scrollRecovery: {
            followers: [],
            following: []
        },
        lastScrollEndReason: null,
        lastFollowersScrollEndReason: null,
        lastFollowersScrollDiagnostics: [],
        collectionDiagnostics: {
            followers: null,
            following: null
        },
        userProvenance: {
            followers: new Map(),
            following: new Map()
        },
        candidateUsers: {
            followers: new Set(),
            following: new Set()
        },
        expectedCounts: {
            followers: null,
            following: null
        },
        devtoolsBridge: {
            listenerInstalledAt: null,
            ready: false,
            readyCount: 0,
            statusCount: 0,
            payloadCount: 0,
            addedCount: 0,
            lastReadyAt: null,
            lastStatusAt: null,
            lastPayloadAt: null,
            lastError: null,
            lastStatus: null
        },
        activeCollectionMode: "followers"
    };

    function getCollectionModeForSet(targetSet) {
        if (targetSet === state.followingUsers) return "following";
        if (targetSet === state.collectedUsers) return "followers";
        return state.activeCollectionMode === "following" ? "following" : "followers";
    }

    function normalizeSourceLabel(source) {
        const value = normalizeText(source || "unknown");
        if (value === "xhr") return "XHR";
        if (value === "fetch") return "fetch";
        if (value === "devtools" || value === "devtools-network") return "DevTools";
        if (value === "dom") return "DOM";
        return source || "unknown";
    }

    function recordUsernameProvenance(username, mode, source = "unknown", detail = {}) {
        const bucket = state.userProvenance[mode];
        if (!bucket || !USERNAME_RE.test(username)) return;

        const now = new Date().toISOString();
        const label = normalizeSourceLabel(source);
        const existing = bucket.get(username) || {
            sources: new Set(),
            confidences: new Set(),
            reasons: new Set(),
            firstSeenAt: now,
            lastSeenAt: now,
            seenCount: 0
        };

        existing.sources.add(label);
        existing.confidences.add(detail.confidence || "confirmed");
        if (detail.reason) existing.reasons.add(detail.reason);
        existing.lastSeenAt = now;
        existing.seenCount++;
        bucket.set(username, existing);
    }

    function getUsernameProvenance(username, mode) {
        const info = state.userProvenance[mode]?.get(username);
        if (!info) return "출처 없음";
        return Array.from(info.sources).sort().join("+") || "출처 없음";
    }

    function formatUsersWithProvenance(usernames, mode) {
        return usernames.map((username) => `${username} [${getUsernameProvenance(username, mode)}]`);
    }

    function serializeProvenanceMap(mode) {
        return Object.fromEntries(Array.from(state.userProvenance[mode].entries()).map(([username, info]) => {
            return [
                username,
                {
                    sources: Array.from(info.sources).sort(),
                    confidence: info.confidences?.has("confirmed") ? "confirmed" : "candidate",
                    confidences: Array.from(info.confidences || []).sort(),
                    reasons: Array.from(info.reasons || []).sort(),
                    firstSeenAt: info.firstSeenAt,
                    lastSeenAt: info.lastSeenAt,
                    seenCount: info.seenCount
                }
            ];
        }));
    }

    function getVerifiedUsers(mode) {
        return mode === "following" ? Array.from(state.followingUsers).sort() : Array.from(state.collectedUsers).sort();
    }

    function getSourceCounts(mode) {
        const counts = {};
        for (const info of state.userProvenance[mode].values()) {
            for (const source of info.sources || []) {
                counts[source] = (counts[source] || 0) + 1;
            }
        }
        return counts;
    }

    function getListReliability(mode, expectedCount = 0) {
        const verifiedCount = mode === "following" ? state.followingUsers.size : state.collectedUsers.size;
        const candidateCount = getUnconfirmedCandidates(mode).length;
        const coverageRatio = expectedCount > 0 ? verifiedCount / expectedCount : null;
        const warnings = [];
        let status = "COMPLETENESS_UNKNOWN";

        if (expectedCount > 0 && verifiedCount === expectedCount && candidateCount === 0) {
            status = "COMPLETE_HIGH_CONFIDENCE";
        } else if (expectedCount > 0 && Math.abs(expectedCount - verifiedCount) <= 2) {
            status = "COMPLETE_BUT_LOW_MARGIN";
            if (verifiedCount !== expectedCount) {
                warnings.push(`${mode === "following" ? "팔로잉" : "팔로워"} 검증 수가 화면 표시 수와 ${Math.abs(expectedCount - verifiedCount)}명 차이납니다.`);
            }
            if (candidateCount > 0) {
                warnings.push(`${mode === "following" ? "팔로잉" : "팔로워"} 검증 필요 후보 ${candidateCount}명은 final diff에서 제외했습니다.`);
            }
        } else if (expectedCount > 0 && verifiedCount < expectedCount) {
            status = "PARTIAL_TRUSTED";
            warnings.push(`${mode === "following" ? "팔로잉" : "팔로워"}가 화면 표시 수보다 ${expectedCount - verifiedCount}명 적게 검증되었습니다.`);
        } else if (candidateCount > 0) {
            status = "PARTIAL_UNTRUSTED";
            warnings.push(`${mode === "following" ? "팔로잉" : "팔로워"} 검증 필요 후보 ${candidateCount}명이 있어 과수집 가능성을 final diff에서 제외했습니다.`);
        }

        return {
            expectedCount: expectedCount || null,
            verifiedCount,
            candidateCount,
            coverageRatio,
            status,
            warnings,
            sourceCounts: getSourceCounts(mode)
        };
    }

    function buildDebugReport(summary = {}) {
        const followers = getListReliability("followers", state.expectedCounts.followers || 0);
        const following = getListReliability("following", state.expectedCounts.following || 0);
        const warnings = [...followers.warnings, ...following.warnings];
        let overallReliability = "COMPLETE_HIGH_CONFIDENCE";

        if (followers.status === "PARTIAL_UNTRUSTED" || following.status === "PARTIAL_UNTRUSTED") {
            overallReliability = "PARTIAL_UNTRUSTED";
        } else if (followers.status.includes("PARTIAL") || following.status.includes("PARTIAL")) {
            overallReliability = "PARTIAL_TRUSTED";
        } else if (followers.status === "COMPLETE_BUT_LOW_MARGIN" || following.status === "COMPLETE_BUT_LOW_MARGIN") {
            overallReliability = "COMPLETE_BUT_LOW_MARGIN";
        }

        return {
            runId: state.runId,
            generatedAt: new Date().toISOString(),
            targetProfile: getProfileKey(),
            executionMode: EXECUTION_MODE,
            followActionEnabled: FOLLOW_ACTION_ENABLED,
            finalDiffPolicy: FINAL_DIFF_POLICY,
            overallReliability,
            warnings,
            followers,
            following,
            sources: {
                devtoolsBridge: getDevtoolsBridgeSnapshot(),
                dom: {
                    followersEndReason: state.lastFollowersScrollEndReason,
                    followersDiagnostics: state.lastFollowersScrollDiagnostics.slice(-10),
                    scrollRecovery: {
                        followers: state.scrollRecovery.followers.slice(-10),
                        following: state.scrollRecovery.following.slice(-10)
                    },
                    collectionDiagnostics: state.collectionDiagnostics
                },
                officialExport: {
                    used: false
                }
            },
            excludedFromDiff: {
                followersCandidates: getUnconfirmedCandidates("followers"),
                followingCandidates: getUnconfirmedCandidates("following")
            },
            summaryStatus: summary.status || null
        };
    }

    function printDebugReportSummary(report) {
        if (!report) return;
        console.log("========== 신뢰도 요약 ==========");
        console.log("🧭 실행 모드:", report.executionMode);
        console.log("🧭 final diff 기준:", report.finalDiffPolicy);
        console.log("🎯 전체 신뢰도:", report.overallReliability);
        console.log(`📦 팔로워 검증: ${report.followers.verifiedCount}명 / 화면 표시 ${report.followers.expectedCount || "알 수 없음"}명 / 후보 ${report.followers.candidateCount}명`);
        console.log(`📦 팔로잉 검증: ${report.following.verifiedCount}명 / 화면 표시 ${report.following.expectedCount || "알 수 없음"}명 / 후보 ${report.following.candidateCount}명`);
        if (report.warnings.length > 0) {
            report.warnings.forEach((warning) => console.log("⚠️", warning));
        }
        console.log("🔎 상세 진단: window.__igFollowerDebugReport");
    }

    function addCandidateUsername(username, mode, source = "network", reason = "ambiguous-network") {
        if (typeof username !== "string") return false;
        const trimmed = username.trim();
        if (!USERNAME_RE.test(trimmed)) return false;
        const normalized = trimmed.toLowerCase();
        const bucket = state.candidateUsers[mode];
        if (!bucket) return false;

        recordUsernameProvenance(normalized, mode, source, { confidence: "candidate", reason });
        if ((mode === "following" ? state.followingUsers : state.collectedUsers).has(normalized)) {
            return false;
        }

        const before = bucket.size;
        bucket.add(normalized);
        return bucket.size > before;
    }

    function addUsername(username, targetSet, source = "unknown", mode = null) {
        if (typeof username !== "string") return false;
        const trimmed = username.trim();
        if (!USERNAME_RE.test(trimmed)) return false;
        const normalized = trimmed.toLowerCase();

        const setToUse = targetSet || state.collectedUsers;
        const collectionMode = mode || getCollectionModeForSet(setToUse);
        recordUsernameProvenance(normalized, collectionMode, source, { confidence: "confirmed", reason: "confirmed-source" });
        state.candidateUsers[collectionMode]?.delete(normalized);

        const before = setToUse.size;
        setToUse.add(normalized);
        return setToUse.size > before;
    }

    function collectFromPayload(payload, seen = new WeakSet(), depth = 0, targetSet = state.collectedUsers, mode = null, source = "network", confidence = "confirmed") {
        if (!payload || typeof payload !== "object" || seen.has(payload) || depth > 12) {
            return 0;
        }
        seen.add(payload);
        let added = 0;

        if (Array.isArray(payload)) {
            for (const item of payload) {
                added += collectFromPayload(item, seen, depth + 1, targetSet, mode, source, confidence);
            }
            return added;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "username")) {
            if (confidence === "candidate") {
                if (addCandidateUsername(payload.username, mode || getCollectionModeForSet(targetSet), source, "ambiguous-network-username")) added++;
            } else if (addUsername(payload.username, targetSet, source, mode)) {
                added++;
            }
        }

        const userListFields = ["users", "items", "edges", "nodes", "data"];
        for (const field of userListFields) {
            if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
            const value = payload[field];

            if (field === "edges" && Array.isArray(value)) {
                for (const edge of value) {
                    if (edge?.node) {
                        added += collectFromPayload(edge.node, seen, depth + 1, targetSet, mode, source, confidence);
                    }
                }
                continue;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    added += collectFromPayload(item, seen, depth + 1, targetSet, mode, source, confidence);
                }
                continue;
            }

            if (value && typeof value === "object") {
                added += collectFromPayload(value, seen, depth + 1, targetSet, mode, source, confidence);
            }
        }

        return added;
    }

    function detectCollectionMode(url) {
        if (!url) return null;
        const lower = url.toLowerCase();
        if (lower.includes("/followers/")) return "followers";
        if (lower.includes("/following/")) return "following";
        return null;
    }

    function ingestApiResponse(payloadText, source = "network", targetSetMode = "followers", options = {}) {
        if (!payloadText) return;

        const targetSet = targetSetMode === "following" ? state.followingUsers : state.collectedUsers;
        const confidence = options.confidence || "confirmed";
        try {
            const parsed = typeof payloadText === "string" ? JSON.parse(payloadText) : payloadText;
            const added = collectFromPayload(parsed, new WeakSet(), 0, targetSet, targetSetMode, source, confidence);
            if (added > 0) {
                const modeLabel = targetSetMode === "following" ? "Following" : "Followers";
                if (confidence === "candidate") {
                    console.log(
                        `%c🧪 [${source}] ${modeLabel} 검증 필요 후보 +${added} / 후보 총 ${state.candidateUsers[targetSetMode].size}`,
                        "color: #cc8800; font-weight: bold;"
                    );
                } else {
                    console.log(
                        `%c📡 [${source}] ${modeLabel} +${added} / 총 ${targetSet.size}`,
                        "color: #00cc66; font-weight: bold;"
                    );
                }
            }
        } catch (e) {
            // JSON 파싱 실패 시 무시
        }
    }

    function hookNetwork() {
        if (window.__igFollowerHooksInstalled) {
            return;
        }

        window.__igFollowerHooksInstalled = true;
        const oldSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function() {
            this.addEventListener(
                "load",
                () => {
                    if (this.status !== 200) return;
                    const url = this.responseURL || "";
                    if (!FOLLOWERS_URL_RE.test(url)) return;

                    const detectedMode = detectCollectionMode(url);
                    const mode = detectedMode || state.activeCollectionMode || "followers";
                    if (!/followers|following/.test(mode)) return;

                    ingestApiResponse(this.responseText, detectedMode ? "XHR" : "XHR-candidate", mode, {
                        confidence: detectedMode ? "confirmed" : "candidate"
                    });
                },
                { once: true }
            );
            return oldSend.apply(this, arguments);
        };

        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const req = args[0];
            const url = typeof req === "string" ? req : req?.url || "";
            const res = await originalFetch.apply(window, args);

            if (res.ok && FOLLOWERS_URL_RE.test(url)) {
                const detectedMode = detectCollectionMode(url);
                const mode = detectedMode || state.activeCollectionMode || "followers";
                if (/followers|following/.test(mode)) {
                    res.clone()
                        .text()
                        .then((text) => ingestApiResponse(text, detectedMode ? "fetch" : "fetch-candidate", mode, {
                            confidence: detectedMode ? "confirmed" : "candidate"
                        }))
                        .catch(() => {});
                }
            }

            return res;
        };
    }

    function getDevtoolsBridgeSnapshot() {
        return {
            ...state.devtoolsBridge,
            followers: state.collectedUsers.size,
            following: state.followingUsers.size,
            activeCollectionMode: state.activeCollectionMode
        };
    }

    function logDevtoolsBridgeStatus(reason = "status") {
        const snapshot = getDevtoolsBridgeSnapshot();
        console.log(
            `%c🔌 DevTools 브리지 상태(${reason}): ready=${snapshot.ready ? "yes" : "no"}, ` +
            `ready=${snapshot.readyCount}, status=${snapshot.statusCount}, payload=${snapshot.payloadCount}, ` +
            `added=${snapshot.addedCount}, followers=${snapshot.followers}, following=${snapshot.following}`,
            "color: #0099ff; font-weight: bold;"
        );
        if (snapshot.lastError) {
            console.log("⚠️ DevTools 브리지 마지막 오류:", snapshot.lastError);
        }
        return snapshot;
    }

    function installExtensionMessageBridge() {
        if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
            state.devtoolsBridge.lastError = "chrome.runtime.onMessage unavailable";
            console.log("ℹ️ 확장 메시지 브리지를 사용할 수 없습니다. DOM/XHR/fetch 수집만 사용합니다.");
            return;
        }

        if (window.__igFollowerExtensionBridgeHandler) {
            try {
                chrome.runtime.onMessage.removeListener(window.__igFollowerExtensionBridgeHandler);
            } catch (e) {
                // 이전 실행 listener 제거 실패는 새 listener 설치로 복구를 시도합니다.
            }
        }

        const handler = (message, sender, sendResponse) => {
            if (!message || !/^IG_DEVTOOLS_/.test(message.type || "")) {
                return false;
            }

            if (message.source !== "devtools-network" || message.schemaVersion !== 1) {
                state.devtoolsBridge.lastError = "invalid-devtools-schema";
                sendResponse?.({ ok: false, error: "invalid-devtools-schema" });
                return false;
            }

            if (message.type === "IG_DEVTOOLS_READY") {
                const wasReady = state.devtoolsBridge.ready;
                state.devtoolsBridge.ready = true;
                state.devtoolsBridge.readyCount++;
                state.devtoolsBridge.lastReadyAt = message.capturedAt || new Date().toISOString();
                state.devtoolsBridge.lastError = null;

                if (!wasReady) {
                    console.log("%c🔌 DevTools Network 캡처 브리지 연결됨", "color: #0099ff; font-weight: bold;");
                    console.log("ℹ️ 이제 DevTools가 열린 상태에서 followers/following 요청을 캡처하면 username만 추출해 현재 수집에 합칩니다.");
                }

                sendResponse?.({ ok: true, status: getDevtoolsBridgeSnapshot() });
                return false;
            }

            if (message.type === "IG_DEVTOOLS_STATUS") {
                state.devtoolsBridge.statusCount++;
                state.devtoolsBridge.lastStatusAt = message.capturedAt || new Date().toISOString();
                state.devtoolsBridge.lastStatus = message.stats || null;
                if (message.error) {
                    state.devtoolsBridge.lastError = message.error;
                }

                const stats = message.stats || {};
                const statusKey = JSON.stringify({
                    portConnected: stats.portConnected,
                    matched: stats.matched,
                    sent: stats.sent,
                    failed: stats.failed,
                    acked: stats.acked,
                    lastCaptureAt: stats.lastCaptureAt,
                    lastError: stats.lastError || message.error || ""
                });
                if (message.reason !== "heartbeat" && window.__igFollowerLastDevtoolsStatusKey !== statusKey) {
                    window.__igFollowerLastDevtoolsStatusKey = statusKey;
                    logDevtoolsBridgeStatus(message.reason || "devtools-status");
                }

                sendResponse?.({ ok: true, status: getDevtoolsBridgeSnapshot() });
                return false;
            }

            if (message.type !== "IG_DEVTOOLS_USERNAMES") {
                return false;
            }

            const mode = message.mode === "following" || message.mode === "followers"
                ? message.mode
                : message.mode === "active" && /followers|following/.test(state.activeCollectionMode)
                    ? state.activeCollectionMode
                    : "";
            if (!mode || !Array.isArray(message.usernames)) {
                state.devtoolsBridge.lastError = "invalid-devtools-payload";
                sendResponse?.({ ok: false, error: "invalid-devtools-payload" });
                return false;
            }

            const targetSet = mode === "following" ? state.followingUsers : state.collectedUsers;
            let added = 0;
            const usernames = message.usernames.slice(0, 2000);
            const isAmbiguousNetwork = message.mode === "active";
            for (const username of usernames) {
                if (isAmbiguousNetwork) {
                    if (addCandidateUsername(username, mode, "devtools", "active-devtools-network")) {
                        added++;
                    }
                    continue;
                }

                if (addUsername(username, targetSet, "devtools", mode)) {
                    added++;
                }
            }

            state.devtoolsBridge.ready = true;
            state.devtoolsBridge.payloadCount++;
            state.devtoolsBridge.addedCount += added;
            state.devtoolsBridge.lastPayloadAt = message.capturedAt || new Date().toISOString();
            state.devtoolsBridge.lastError = null;

            const modeLabel = mode === "following" ? "Following" : "Followers";
            if (isAmbiguousNetwork) {
                console.log(
                    `%c🧪 [DevTools] ${modeLabel} 검증 필요 후보 +${added} / 후보 총 ${state.candidateUsers[mode].size} (응답 username ${usernames.length}개)`,
                    "color: #cc8800; font-weight: bold;"
                );
            } else {
                console.log(
                    `%c📡 [DevTools] ${modeLabel} +${added} / 총 ${targetSet.size} (응답 username ${usernames.length}개)`,
                    "color: #0099ff; font-weight: bold;"
                );
            }

            sendResponse?.({ ok: true, added, total: targetSet.size, status: getDevtoolsBridgeSnapshot() });
            return false;
        };

        chrome.runtime.onMessage.addListener(handler);
        window.__igFollowerExtensionBridgeHandler = handler;
        window.__igFollowerDevToolsStatus = getDevtoolsBridgeSnapshot;
        window.__igFollowerPrintDevToolsStatus = logDevtoolsBridgeStatus;

        state.devtoolsBridge.listenerInstalledAt = new Date().toISOString();
        console.log("🧪 DevTools 브리지 listener 준비됨. 상태 확인: window.__igFollowerPrintDevToolsStatus?.()");
    }

    function getProfileLinksIn(root) {
        return Array.from(root.querySelectorAll("a[href]")).filter((a) => {
            const href = a.getAttribute("href") || "";
            return !!extractProfileUsername(href);
        });
    }

    function getFollowButtonsIn(root) {
        return Array.from(root.querySelectorAll("button, [role='button']")).filter((button) => {
            if (!(button instanceof HTMLElement)) return false;
            return isFollowButtonText(button.textContent || button.getAttribute("aria-label") || button.getAttribute("title") || "");
        });
    }

    function probeScrollMovement(el) {
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const before = el.scrollTop;
        if (maxTop <= 1) {
            return { canMove: false, before, after: before, maxTop };
        }

        const target = Math.min(maxTop, before + 160);
        el.scrollTop = target;
        const after = el.scrollTop;
        el.scrollTop = before;

        return {
            canMove: Math.abs(after - before) > 1,
            before,
            after,
            maxTop
        };
    }

    function scoreScrollBoxCandidate(el, index) {
        const style = getComputedStyle(el);
        const overflow = `${style.overflow} ${style.overflowY}`;
        const isScrollable = /(auto|scroll)/.test(overflow);
        const isVisible = isElementVisible(el);
        const hasRoom = el.scrollHeight > el.clientHeight + 24;
        const profileLinks = getProfileLinksIn(el);
        const followButtons = getFollowButtonsIn(el);
        const probe = probeScrollMovement(el);
        const rect = el.getBoundingClientRect();

        let score = 0;
        if (isScrollable) score += 40;
        if (hasRoom) score += 80;
        if (probe.canMove) score += 70;
        score += Math.min(profileLinks.length * 8, 160);
        score += Math.min(followButtons.length * 12, 120);
        score += Math.min(Math.floor((el.scrollHeight - el.clientHeight) / 40), 60);
        if (rect.height > 180) score += 25;
        if (rect.height > window.innerHeight * 0.9) score -= 25;

        return {
            el,
            index,
            score,
            isScrollable,
            isVisible,
            hasRoom,
            canMove: probe.canMove,
            scrollTop: Math.round(el.scrollTop),
            scrollHeight: Math.round(el.scrollHeight),
            clientHeight: Math.round(el.clientHeight),
            profileLinkCount: profileLinks.length,
            followButtonCount: followButtons.length,
            tag: el.tagName.toLowerCase(),
            className: String(el.className || "").slice(0, 80)
        };
    }

    function findFollowerListBox() {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
        const allCandidates = [];

        for (const dialog of dialogs) {
            const scrollCandidates = Array.from(dialog.querySelectorAll("div"))
                .map((el, index) => scoreScrollBoxCandidate(el, index))
                .filter((item) => item.isVisible && item.isScrollable && item.hasRoom && item.profileLinkCount > 0);

            allCandidates.push(...scrollCandidates);
        }

        if (allCandidates.length > 0) {
            allCandidates.sort((a, b) => b.score - a.score);
            state.lastScrollBoxCandidates = allCandidates.slice(0, 5).map(({ el, ...detail }) => detail);
            return allCandidates[0].el;
        }

        const fallbackCandidates = Array.from(
            document.querySelectorAll('div[role="dialog"] div[style*="overflow: auto"], div[style*="overflow: auto"], div[style*="overflow: hidden auto"]')
        )
            .filter(isElementVisible)
            .map((el, index) => scoreScrollBoxCandidate(el, index))
            .filter((item) => item.hasRoom || item.profileLinkCount > 0)
            .sort((a, b) => b.score - a.score);

        state.lastScrollBoxCandidates = fallbackCandidates.slice(0, 5).map(({ el, ...detail }) => detail);
        return fallbackCandidates[0]?.el || null;
    }

    function normalizeText(value) {
        return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function normalizePath(value) {
        return (value || "").toLowerCase();
    }

    function extractCountFromLabel(value) {
        const text = normalizeText(value);
        const match = text.match(/(\d[\d,]*)/);
        if (!match) return null;
        const count = Number(match[1].replace(/,/g, ""));
        return Number.isFinite(count) ? count : null;
    }

    function isCandidateVisible(el) {
        return isElementVisible(el);
    }

    function isElementVisible(el) {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const isOutsideViewport =
            rect.bottom < 0 ||
            rect.right < 0 ||
            rect.top > window.innerHeight ||
            rect.left > window.innerWidth;

        if (el.hidden || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0 || style.pointerEvents === "none") return false;
        if (rect.width <= 1 || rect.height <= 1) return false;

        return !isOutsideViewport;
    }

    function scorePopupCandidate(clickable, kind, label, href) {
        const config = KIND_CONFIG[kind] || KIND_CONFIG.followers;
        const keywordSet = KIND_ALT_TEXTS[kind] || [];
        const lowerPath = normalizePath(location.pathname || "");
        let score = 0;

        if (href.includes(config.path)) score += 140;
        if (config.textRe.test(label)) score += 80;
        for (const k of keywordSet) {
            if (label.includes(normalizeText(k))) {
                score += 50;
                break;
            }
        }
        if (config.textRe.test(lowerPath)) score += 12;

        if (score <= 0) {
            return 0;
        }

        if (href.includes("https://") || href.includes("http://")) score += 2;

        const role = clickable.getAttribute("role");
        if (clickable.tagName === "A") score += 18;
        if (role === "button" || role === "link") score += 14;
        if (clickable.tagName === "BUTTON") score += 16;

        return score;
    }

    function getDirectFollowersButtons(kind) {
        const config = KIND_CONFIG[kind] || KIND_CONFIG.followers;
        const nodes = Array.from(document.querySelectorAll('a[href*="/"]'));
        const direct = [];
        for (const n of nodes) {
            if (!(n instanceof HTMLAnchorElement)) continue;
            if (!isCandidateVisible(n)) continue;
            const href = normalizePath(n.getAttribute("href") || "");
            if (href.includes(config.path)) {
                const text = normalizeText(n.textContent || "");
                const label = normalizeText(n.getAttribute("aria-label") || text);
                const score = scorePopupCandidate(n, kind, label, href);
                if (score > 0) direct.push({ el: n, score, label, href });
            }
        }
        return direct.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.label.length - a.label.length;
        });
    }

    function getClickableTabCandidates(kind) {
        const direct = getDirectFollowersButtons(kind);
        if (direct.length > 0) return direct.map((item) => item.el);

        const nodes = Array.from(document.querySelectorAll("a,button,[role='button'],[role='link'],span,div"));
        const scored = [];
        const seen = new Set();

        for (const n of nodes) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.getAttribute("disabled")) continue;
            if (!isCandidateVisible(n)) continue;

            const clickable = n.closest("a[href],button,[role='button'],[role='link']") || n;
            if (seen.has(clickable)) continue;

            const href = normalizePath(clickable.getAttribute("href") || "");
            const label = normalizeText(clickable.getAttribute("aria-label") || clickable.textContent || "");
            const score = scorePopupCandidate(clickable, kind, label, href);

            if (score > 0) {
                scored.push({ clickable, score });
                seen.add(clickable);
            }
        }

        return scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.clickable.textContent.length - a.clickable.textContent.length;
        }).map((item) => item.clickable);
    }

    function isDialogReady() {
        if (!isDialogOpen()) return false;
        const scrollBox = findFollowerListBox();
        return !!scrollBox;
    }

    async function waitForDialogReady(timeoutMs = 3000, intervalMs = 150) {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            if (isDialogReady()) return true;
            await wait(intervalMs, 120);
        }
        return false;
    }

    function getListRowFromElement(el) {
        if (!(el instanceof Element)) return null;
        return el.closest("li") ||
            el.closest('div[role="button"]') ||
            el.closest("div");
    }

    function getUsernameFromRow(row) {
        if (!(row instanceof Element)) return "";
        const anchors = Array.from(row.querySelectorAll("a[href]"));
        for (const anchor of anchors) {
            const username = extractProfileUsername(anchor.getAttribute("href") || "");
            if (username) return username;
        }
        return "";
    }

    function getListRowCandidates(scrollBox) {
        if (!scrollBox) return [];

        const rows = [];
        const seen = new Set();
        const addRow = (el) => {
            const row = getListRowFromElement(el);
            if (!row || seen.has(row) || !isElementVisible(row)) return;
            seen.add(row);
            rows.push(row);
        };

        Array.from(scrollBox.querySelectorAll("a[href]")).forEach(addRow);
        Array.from(scrollBox.querySelectorAll("button, [role='button']")).forEach((button) => {
            const text = readButtonText(button);
            if (isFollowButtonText(text) || isFollowDoneText(text)) {
                addRow(button);
            }
        });

        return rows;
    }

    function getListSnapshot(scrollBox) {
        const usernames = getDOMUsernames(scrollBox);
        const uniqueUsernames = Array.from(new Set(usernames));
        const rows = getListRowCandidates(scrollBox);
        const lastVisibleUsernames = uniqueUsernames.slice(-5);

        return {
            rowCount: rows.length,
            profileLinkCount: usernames.length,
            uniqueCount: uniqueUsernames.length,
            scrollTop: Math.round(scrollBox.scrollTop),
            scrollHeight: Math.round(scrollBox.scrollHeight),
            clientHeight: Math.round(scrollBox.clientHeight),
            lastVisibleUsernames,
            key: [
                rows.length,
                uniqueUsernames.length,
                Math.round(scrollBox.scrollHeight),
                Math.round(scrollBox.clientHeight),
                lastVisibleUsernames.join("|")
            ].join(":")
        };
    }

    async function waitForListSettled(modeLabel = "followers") {
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";
        let stableTicks = 0;
        let lastKey = "";
        let lastSnapshot = null;

        console.log(`2-1) ${baseLog} 목록 렌더 안정화 대기...`);

        for (let tick = 1; tick <= LIST_SETTLE_MAX_TICKS; tick++) {
            const scrollBox = findFollowerListBox();
            if (!scrollBox) {
                await wait(260, 120);
                continue;
            }

            const snapshot = getListSnapshot(scrollBox);
            if (snapshot.key === lastKey) {
                stableTicks++;
            } else {
                stableTicks = 0;
                lastKey = snapshot.key;
            }
            lastSnapshot = snapshot;

            console.log(
                `🧘 ${baseLog} 안정화 확인 ${tick}/${LIST_SETTLE_MAX_TICKS}: ` +
                `고유 ${snapshot.uniqueCount}명, 행 ${snapshot.rowCount}개, stable=${stableTicks}/${LIST_SETTLE_REQUIRED_TICKS}`
            );

            if (stableTicks >= LIST_SETTLE_REQUIRED_TICKS) {
                console.log(`✅ ${baseLog} 목록 렌더 안정화 완료`);
                return { ok: true, ticks: tick, snapshot };
            }

            await wait(360, 140);
        }

        console.log(`⚠️ ${baseLog} 목록 안정화가 충분하지 않지만 현재 보이는 목록 기준으로 진행합니다.`, lastSnapshot);
        return { ok: false, ticks: LIST_SETTLE_MAX_TICKS, snapshot: lastSnapshot };
    }

    function collectFromDOM(scrollBox, targetSet) {
        const anchors = getProfileLinksIn(scrollBox);
        const target = targetSet || state.collectedUsers;
        let added = 0;

        for (const a of anchors) {
            const username = extractProfileUsername(a.getAttribute("href") || "");
            if (!username) continue;

            if (addUsername(username, target, "dom", getCollectionModeForSet(target))) {
                added++;
            }
        }

        return added;
    }

    function getDOMUsernames(scrollBox) {
        return getProfileLinksIn(scrollBox)
            .map((a) => {
                return extractProfileUsername(a.getAttribute("href") || "");
            })
            .filter(Boolean);
    }

    function getCollectionDiagnostic(scrollBox, targetSet, expectedCount, modeLabel = "followers") {
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";
        if (!scrollBox) {
            return {
                mode: modeLabel,
                label: baseLog,
                expectedCount,
                collectedCount: targetSet.size,
                rowCount: 0,
                profileLinkCount: 0,
                uniqueVisibleCount: 0,
                duplicateUsernames: [],
                unresolvedRows: [],
                lastVisibleUsernames: [],
                reason: "no_scroll_box"
            };
        }

        const visibleUsernames = getDOMUsernames(scrollBox);
        const uniqueVisible = Array.from(new Set(visibleUsernames));
        const duplicateUsernames = Array.from(new Set(
            visibleUsernames.filter((username, index) => visibleUsernames.indexOf(username) !== index)
        )).slice(0, 20);
        const rows = getListRowCandidates(scrollBox);
        const unresolvedRows = rows
            .filter((row) => !getUsernameFromRow(row))
            .map((row) => normalizeText(row.textContent || "").slice(0, 120))
            .filter(Boolean)
            .slice(0, 10);

        return {
            mode: modeLabel,
            label: baseLog,
            expectedCount,
            collectedCount: targetSet.size,
            rowCount: rows.length,
            profileLinkCount: visibleUsernames.length,
            uniqueVisibleCount: uniqueVisible.length,
            duplicateUsernames,
            unresolvedRows,
            lastVisibleUsernames: uniqueVisible.slice(-10),
            scrollTop: Math.round(scrollBox.scrollTop),
            scrollHeight: Math.round(scrollBox.scrollHeight),
            clientHeight: Math.round(scrollBox.clientHeight),
            reason: expectedCount > 0 && targetSet.size < expectedCount ? "count_mismatch" : "diagnostic"
        };
    }

    function printCollectionDiagnostic(diagnostic) {
        if (!diagnostic) return;

        console.log(`========== ${diagnostic.label} 수집 진단 ==========`);
        console.log(`📦 수집/표시: ${diagnostic.collectedCount}명 / ${diagnostic.expectedCount || "알 수 없음"}명`);
        console.log(`👀 현재 DOM 고유 계정: ${diagnostic.uniqueVisibleCount}명, 프로필 링크: ${diagnostic.profileLinkCount}개, 행 후보: ${diagnostic.rowCount}개`);
        console.log(`🧭 스크롤 위치: top=${diagnostic.scrollTop ?? "?"}, height=${diagnostic.scrollHeight ?? "?"}, client=${diagnostic.clientHeight ?? "?"}`);
        console.log("🔚 마지막으로 보이는 계정:", diagnostic.lastVisibleUsernames.length ? diagnostic.lastVisibleUsernames.join(", ") : "없음");
        console.log("🔁 중복으로 보이는 계정:", diagnostic.duplicateUsernames.length ? diagnostic.duplicateUsernames.join(", ") : "없음");

        if (diagnostic.unresolvedRows.length > 0) {
            console.log("⚠️ 프로필 링크를 해석하지 못한 행 후보:");
            diagnostic.unresolvedRows.forEach((text, index) => console.log(`   ${index + 1}. ${text}`));
        } else {
            console.log("✅ 현재 보이는 행 중 프로필 링크 해석 실패 후보는 없습니다.");
        }
    }

    function captureAndPrintCollectionDiagnostic(targetSet, expectedCount, modeLabel) {
        const scrollBox = findFollowerListBox();
        const diagnostic = getCollectionDiagnostic(scrollBox, targetSet, expectedCount, modeLabel);
        state.collectionDiagnostics[modeLabel] = diagnostic;
        printCollectionDiagnostic(diagnostic);
        return diagnostic;
    }

    function logPopupDiagnostics(kind) {
        const direct = getDirectFollowersButtons(kind);
        const candidates = getClickableTabCandidates(kind);
        const config = KIND_CONFIG[kind] || KIND_CONFIG.followers;
        const detail = candidates.slice(0, KIND_CANDIDATE_LIMIT).map((el, index) => {
            const href = normalizePath(el.getAttribute("href") || el.getAttribute("data-href") || "");
            const text = normalizeText(el.textContent || "");
            const role = el.getAttribute("role") || "";
            return `${index + 1}. tag=${el.tagName.toLowerCase()} role=${role} href=${href} text="${text.substring(0, 80)}"`;
        });

        console.log(`🩺 [진단] ${kind} 후보(상위 ${detail.length}/${candidates.length}, direct=${direct.length})`);
        console.log(detail.join("\n"));
        console.log("🧭 사용한 규칙:", config.path, config.textRe);
        return detail;
    }

    async function openPopupByType(kind = "followers") {
        const config = KIND_CONFIG[kind] || KIND_CONFIG.followers;
        const candidates = getClickableTabCandidates(kind);
        let element = candidates[0] || null;
        if (!element) {
            const xpath = config.xpath;
            element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }

        if (!element) {
            console.log(`❌ ${kind} 목록 버튼을 찾지 못했습니다.`);
            logPopupDiagnostics(kind);
            return false;
        }

        const selectedLabel = normalizeText(element.textContent || element.getAttribute("aria-label") || "");
        const selectedCount = extractCountFromLabel(selectedLabel);
        if (selectedCount !== null) {
            state.expectedCounts[kind] = selectedCount;
        }

        console.log(`✅ ${kind} 후보 선택:`, element.tagName, element.getAttribute("href") || "", selectedLabel.slice(0, 60));
        if (selectedCount !== null) {
            console.log(`🧮 ${kind} 화면 표시 숫자: ${selectedCount}명`);
        }

        state.activeCollectionMode = kind;
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(900, 400);
        element.click();

        const opened = await waitForDialogReady();
        if (!opened) {
            console.log(`⚠️ ${kind} 목록 버튼 클릭 후 대화창 탐지에 실패했습니다. XPath 또는 다른 후보로 1회 재시도합니다.`);
            const retryXPath = config.xpath;
            const fallback = document.evaluate(retryXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (fallback) {
                fallback.click();
                if (await waitForDialogReady()) {
                    return true;
                }
            }
            logPopupDiagnostics(kind);
            return false;
        }

        return true;
    }

    function isFollowButtonText(value) {
        const text = normalizeText(value);
        if (!text) return false;
        const compact = text.replace(/\s+/g, " ").trim();
        return compact === "팔로우" ||
            compact === "follow" ||
            /^팔로우(?:\s+\d+)?$/.test(compact) ||
            /^follow(?:\s+\d+)?$/.test(compact) ||
            /^팔로우\(\d+\)$/.test(compact) ||
            /^follow\(\d+\)$/.test(compact);
    }

    function readButtonText(button) {
        return normalizeText(button.textContent || button.getAttribute("aria-label") || button.getAttribute("title") || "");
    }

    function getUrlPath(url) {
        try {
            return normalizePath(new URL(url).pathname || "");
        } catch {
            return normalizePath((url || "").split("?")[0].split("#")[0]);
        }
    }

    function extractProfileUsername(value) {
        const path = getUrlPath(value);
        const m = path.match(/^\/([a-zA-Z0-9._]{1,30})\/$/);
        if (!m) return "";
        const username = m[1].toLowerCase();
        if (RESERVED_PROFILE_NAMES.has(username)) return "";
        return USERNAME_RE.test(username) ? username : "";
    }

    function getProfileAnchorFromButton(button) {
        const row = button.closest("li") || button.closest("div");
        if (!row) return null;

        const anchors = Array.from(row.querySelectorAll('a[href^="/"]'));
        return anchors.find((a) => extractProfileUsername(a.getAttribute("href")));
    }

    function getUrlParts(url) {
        try {
            const u = new URL(url, window.location.href);
            return { host: u.host.toLowerCase(), path: normalizePath(u.pathname || ""), href: u.href };
        } catch {
            return { host: "", path: getUrlPath(url), href: url || "" };
        }
    }

    function isThreadLikePath(path = "") {
        const normalized = normalizePath(path);
        return (
            normalized.startsWith("/t/") ||
            normalized.startsWith("/threads/") ||
            normalized.startsWith("/thread/") ||
            normalized.startsWith("/p/") ||
            normalized.startsWith("/reels/") ||
            normalized.startsWith("/reel/") ||
            normalized.startsWith("/stories/") ||
            normalized.includes("/tv/")
        );
    }

    function isSafeFollowButton(button) {
        if (!(button instanceof HTMLButtonElement) && !(button instanceof HTMLElement && button.getAttribute("role") === "button")) return false;
        if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;

        const text = readButtonText(button);
        if (!isFollowButtonText(text)) return false;

        const profileAnchor = getProfileAnchorFromButton(button);
        if (!profileAnchor) return false;

        const profileHref = normalizePath(profileAnchor.getAttribute("href") || "");
        if (isThreadLikePath(profileHref)) return false;
        if (!extractProfileUsername(profileHref)) return false;

        const unsafeParentAnchor = button.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/stories/"]');
        if (unsafeParentAnchor) return false;

        const parentHref = normalizePath(button.closest("a")?.getAttribute("href") || "");
        if (parentHref && isThreadLikePath(parentHref)) return false;

        return true;
    }

    function isFollowDoneText(value) {
        const text = normalizeText(value);
        const compact = text.replace(/\s+/g, " ").trim();
        return (
            compact === "팔로잉" ||
            compact === "following" ||
            compact === "요청됨" ||
            compact === "requested" ||
            compact === "요청" ||
            /^팔로잉(\s+\d+)?$/.test(compact) ||
            /^following(\s+\d+)?$/.test(compact) ||
            /^요청(\s+\d+)?$/.test(compact) ||
            /^requested(\s+\d+)?$/.test(compact)
        );
    }

    function isAllowedFollowPath(path, profileKey = getProfileKey()) {
        const root = `/${normalizePath(profileKey)}`;
        const normalized = normalizePath(path);

        if (!normalized) return true;
        if (normalized === root || normalized === `${root}/`) return true;
        if (normalized.startsWith(`${root}/followers`) || normalized.startsWith(`${root}/following`)) return true;
        return false;
    }

    function isUnexpectedNavigation(beforeUrl, afterUrl) {
        const before = getUrlParts(beforeUrl);
        const after = getUrlParts(afterUrl);

        if (!before.href || !after.href) return false;
        if (before.host !== after.host) return true;
        if (isThreadLikePath(after.path)) return true;
        if (!isAllowedFollowPath(after.path)) return true;
        return false;
    }

    function withFollowClickNavigationGuard(button, fn) {
        const dialogRoot = button.closest('div[role="dialog"]') || button.ownerDocument?.body || document.body;
        let blocked = false;

        const blockIfThreadNav = (ev) => {
            const target = ev.target instanceof Element ? ev.target : null;
            if (!target || !dialogRoot || !dialogRoot.contains(target)) return;

            const path = typeof ev.composedPath === "function" ? ev.composedPath() : [target];
            const anchors = path.filter((node) => node instanceof Element && node.tagName === "A");
            const anchor = anchors.find((node) => node.getAttribute("href")) || target.closest("a[href]");
            if (!anchor) return;

            const href = anchor.getAttribute("href") || "";
            const info = getUrlParts(href);
            if (!info.path) return;

            if (isThreadLikePath(info.path) || isUnexpectedNavigation(window.location.href, info.href)) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                if (typeof ev.preventDefault === "function") {
                    ev.stopPropagation();
                }
                blocked = true;
                console.log("🧱 팔로우 클릭 중 게시물/쓰레드 이동 차단:", info.href);
            }
        };

        const events = ["pointerdown", "pointerup", "click", "mousedown", "mouseup"];
        events.forEach((eventType) => document.addEventListener(eventType, blockIfThreadNav, true));
        return Promise.resolve()
            .then(fn)
            .finally(() => events.forEach((eventType) => document.removeEventListener(eventType, blockIfThreadNav, true)))
            .then(() => ({ ok: true, blocked }));
    }

    async function waitForFollowStateChange(button, beforeText, maxRetries = 4) {
        for (let i = 0; i < maxRetries; i++) {
            await wait(450, 180);
            const afterText = readButtonText(button);
            if (afterText !== beforeText && (isFollowDoneText(afterText) || !isFollowButtonText(afterText))) {
                return true;
            }
            if (button.disabled) return true;
        }
        return false;
    }

    async function revertUnexpectedNavigation(beforeHref, label) {
        const before = getUrlParts(beforeHref);
        const after = getUrlParts(location.href);

        if (!before.href || !after.href) return false;
        if (!isUnexpectedNavigation(before.href, after.href)) return false;

        console.log(`⚠️ ${label}로 예상치 못한 이동 감지됨: ${before.href} => ${after.href}`);

        if (window.history && window.history.length > 1) {
            window.history.back();
            await wait(700, 250);
            if (normalizePath(location.href) === normalizePath(before.href)) {
                return true;
            }
        }

        try {
            window.location.replace(before.href);
            await wait(700, 250);
            return normalizePath(location.href) === normalizePath(before.href);
        } catch {
            return false;
        }
    }

    async function clickFollowButton(button) {
        const beforeText = readButtonText(button);
        const beforeHref = location.href;

        if (!isSafeFollowButton(button)) {
            return { ok: false, reason: "invalid-button" };
        }

        button.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(260, 140);

        const guardResult = await withFollowClickNavigationGuard(button, async () => {
            humanLikeElementClick(button);
        });
        if (guardResult && guardResult.blocked) {
            return { ok: false, reason: "navigation-blocked" };
        }
        if (await revertUnexpectedNavigation(beforeHref, "팔로우 첫 시도")) {
            return { ok: false, reason: "unexpected-navigation", beforeHref };
        }

        if (await waitForFollowStateChange(button, beforeText, 4)) {
            return { ok: true, reason: "state-changed", beforeHref };
        }

        // 일부 환경에서 사용자 이벤트 시뮬레이션이 지연되므로 native click으로 한번 더 보완
        const fallbackGuard = await withFollowClickNavigationGuard(button, async () => {
            button.click();
        });
        if (fallbackGuard && fallbackGuard.blocked) {
            return { ok: false, reason: "navigation-blocked" };
        }
        if (await revertUnexpectedNavigation(beforeHref, "팔로우 재시도")) {
            return { ok: false, reason: "unexpected-navigation", beforeHref };
        }
        if (await waitForFollowStateChange(button, beforeText, 4)) {
            return { ok: true, reason: "state-changed-retry", beforeHref };
        }

        const afterHref = location.href;
        if (isUnexpectedNavigation(beforeHref, afterHref)) {
            console.log("⚠️ 팔로우 클릭 후 예기치 않은 이동 감지:", beforeHref, "=>", afterHref);
            if (window.history && window.history.length > 1) {
                window.history.back();
                await wait(700, 250);
            }
            return { ok: false, reason: "unexpected-navigation", beforeHref, afterHref };
        }

        return { ok: false, reason: "no-state-change", beforeHref };
    }

    function getUsernameFromButton(button) {
        const profileAnchor = getProfileAnchorFromButton(button);
        if (!profileAnchor) return "";
        return extractProfileUsername(profileAnchor.getAttribute("href") || "");
    }

    function getVisibleFollowButtons(scrollBox) {
        const buttons = Array.from(scrollBox.querySelectorAll("button, [role='button']"));
        const seenRows = new Set();
        const seenUsers = new Set();

        return buttons.filter((button) => {
            if (!isSafeFollowButton(button)) return false;

            const row = button.closest("li") || button.closest("div[role='row']") || button.closest("div");
            if (row) {
                if (seenRows.has(row)) return false;
                seenRows.add(row);
            }

            const username = getUsernameFromButton(button);
            if (username) {
                if (seenUsers.has(username)) return false;
                seenUsers.add(username);
            }

            return true;
        });
    }

    function humanLikeElementClick(element) {
        const rect = element.getBoundingClientRect();
        const x = rect.left + (rect.width * Math.random());
        const y = rect.top + (rect.height * Math.random());

        const sendEvent = (type) => {
            element.dispatchEvent(new MouseEvent(type, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                buttons: 1
            }));
        };

        const sendMove = (x, y) => {
            element.dispatchEvent(new MouseEvent("mousemove", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
            element.dispatchEvent(new MouseEvent("mouseenter", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
        };

        sendMove(x, y);
        sendEvent("mouseover");
        sendMove(rect.left + rect.width * 0.3 + (rect.width * 0.4 * Math.random()), y);
        sendMove(rect.left + rect.width * 0.6 + (rect.width * 0.3 * Math.random()), y);
        sendEvent("mousedown");
        sendEvent("mouseup");
        sendEvent("click");
    }

    function findDialogElement() {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
        return dialogs[0] || null;
    }

    function isDialogOpen() {
        return !!findDialogElement();
    }

    async function waitForDialogClosed(timeoutMs = 3000, intervalMs = 150) {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            if (!isDialogOpen()) return true;
            await wait(intervalMs, 60);
        }
        return false;
    }

    function isCloseTextLike(value, fallback = false) {
        const text = normalizeText(value);
        if (!text) return false;
        if (fallback) {
            return text === "close";
        }
        return text === "닫기" || text === "close";
    }

    function getCloseButtonCandidates() {
        const dialog = findDialogElement();
        if (!dialog) return [];

        const candidates = [];
        const seen = new Set();

        const pick = (el, scoreBoost = 0, reason = "") => {
            if (!(el instanceof Element)) return;
            const clickable = el.closest("button, [role='button'], a, [tabindex]") || el;
            if (!isElementVisible(clickable)) return;
            if (seen.has(clickable)) return;
            const rect = clickable.getBoundingClientRect();
            if (rect.width <= 2 || rect.height <= 2) return;
            const style = getComputedStyle(clickable);
            if (style.pointerEvents === "none" || Number(style.opacity) <= 0) return;

            const disabled = clickable.getAttribute("disabled") || clickable.getAttribute("aria-disabled") === "true";
            if (disabled) return;

            const label = normalizeText(
                clickable.getAttribute("aria-label") || clickable.getAttribute("title") || clickable.getAttribute("alt") || clickable.textContent || ""
            );
            const textScore = isCloseTextLike(label) ? 120 : 0;
            const hrefScore = normalizePath(clickable.getAttribute("href") || "").includes("/followers/") ? 20 : 0;

            let score = textScore + hrefScore + scoreBoost;
            if (score > 0) {
                candidates.push({ clickable, score, reason, label, rect, node: el.tagName });
                seen.add(clickable);
            }
        };

        const svgNodes = Array.from(dialog.querySelectorAll('svg[aria-label], svg[title]'));
        for (const svg of svgNodes) {
            const label = normalizeText(svg.getAttribute("aria-label") || svg.getAttribute("title") || "");
            if (isCloseTextLike(label) || label.includes("닫")) {
                pick(svg, 160, "svg-닫기");
            }
        }

        const labeledNodes = Array.from(dialog.querySelectorAll("[aria-label], [title], [alt]"));
        for (const node of labeledNodes) {
            const label = normalizeText(node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("alt") || "");
            if (isCloseTextLike(label) || label.includes("닫기")) {
                pick(node, 140, "labeled");
            }
        }

        const closeBtnFallbacks = Array.from(dialog.querySelectorAll(
            'button[aria-label="닫기"], button[aria-label="Close"], button[title="Close"], [role="button"][aria-label="닫기"], [role="button"][aria-label="Close"]'
        ));
        for (const btn of closeBtnFallbacks) {
            pick(btn, 200, "fallback-button");
        }

        return candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.rect.width * b.rect.height - a.rect.width * a.rect.height;
        });
    }

    async function closeActiveDialog() {
        if (!isDialogOpen()) {
            return true;
        }

        const candidates = getCloseButtonCandidates();
        if (candidates.length > 0) {
            for (let i = 0; i < candidates.length; i++) {
                const target = candidates[i];
                console.log(`🧭 닫기 후보 선택: #${i + 1}`, target.label, target.reason, target.rect.width, target.rect.height);
                const el = target.clickable;
                humanLikeElementClick(el);
                if (await waitForDialogClosed()) {
                    return true;
                }
                await wait(350, 200);
            }
        }

        const fallbackTargets = [
            'div[role="dialog"] [aria-label="닫기"], div[role="dialog"] button[aria-label="Close"], div[role="dialog"] [aria-label="Close"]'
        ];
        for (const selector of fallbackTargets) {
            const closeButton = document.querySelector(selector);
            if (closeButton) {
                closeButton.click();
                if (await waitForDialogClosed()) return true;
                await wait(350, 200);
            }
        }

        // 가장 바닥 fallback: 닫기 아이콘 좌상단 영역 클릭
        const dialog = findDialogElement();
        if (dialog) {
            const rect = dialog.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return false;
            }
            const probeX = rect.left + Math.max(16, rect.width * 0.92);
            const probeY = rect.top + 16;
            const element = document.elementFromPoint(probeX, probeY);
            if (element) {
                console.log("🧭 닫기 fallback 좌표 클릭 시도");
                humanLikeElementClick(element);
                if (await waitForDialogClosed()) return true;
            }
        }

        const esc = new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true
        });
        document.dispatchEvent(esc);
        await wait(700, 200);
        if (!isDialogOpen()) return true;
        return false;
    }

    function recordScrollDiagnostic(scrollBox, modeLabel, currentCount, beforeDom, stableTicks) {
        const domUsernames = getDOMUsernames(scrollBox);
        const diagnostic = {
            mode: modeLabel,
            tick: state.scrollDiagnostics.length + 1,
            at: new Date().toISOString(),
            count: currentCount,
            domAdded: beforeDom,
            domVisibleUserCount: domUsernames.length,
            lastVisibleUsers: domUsernames.slice(-5),
            scrollTop: Math.round(scrollBox.scrollTop),
            scrollHeight: Math.round(scrollBox.scrollHeight),
            clientHeight: Math.round(scrollBox.clientHeight),
            stableTicks,
            candidate: state.lastScrollBoxCandidates[0] || null
        };

        state.scrollDiagnostics.push(diagnostic);
        if (state.scrollDiagnostics.length > 60) {
            state.scrollDiagnostics.shift();
        }

        console.log(
            `🧭 ${modeLabel} 스크롤 진단: top=${diagnostic.scrollTop}, height=${diagnostic.scrollHeight}, client=${diagnostic.clientHeight}, visibleUsers=${diagnostic.domVisibleUserCount}, stable=${stableTicks}, last=${diagnostic.lastVisibleUsers.join(", ")}`
        );

        return diagnostic;
    }

    async function performListScroll(scrollBox) {
        if (scrollBox instanceof HTMLElement) {
            if (!scrollBox.hasAttribute("tabindex")) {
                scrollBox.setAttribute("tabindex", "-1");
            }
            try {
                scrollBox.focus({ preventScroll: true });
            } catch {
                scrollBox.focus();
            }
        }

        const lastProfileLink = getProfileLinksIn(scrollBox).slice(-1)[0];

        scrollBox.dispatchEvent(new WheelEvent("wheel", {
            view: window,
            bubbles: true,
            cancelable: true,
            deltaY: Math.max(700, scrollBox.clientHeight * 0.9),
            deltaMode: 0
        }));

        if (lastProfileLink) {
            lastProfileLink.scrollIntoView({ behavior: "auto", block: "end" });
        }

        scrollBox.scrollTop = Math.min(
            scrollBox.scrollHeight,
            scrollBox.scrollTop + Math.max(520, scrollBox.clientHeight * 0.85)
        );

        await wait(260, 120);

        scrollBox.dispatchEvent(new KeyboardEvent("keydown", {
            key: "PageDown",
            code: "PageDown",
            keyCode: 34,
            which: 34,
            bubbles: true
        }));

        await wait(260, 120);
        scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior: "auto" });
    }

    function getCoverageRatio(currentCount, targetCount) {
        return targetCount > 0 ? currentCount / targetCount : 1;
    }

    function shouldAttemptScrollRecovery(currentCount, targetCount, stableTicks, recoveryAttempts) {
        if (targetCount <= 0) return false;
        if (recoveryAttempts >= MAX_SCROLL_RECOVERY_ATTEMPTS) return false;
        if (stableTicks < LOW_COVERAGE_STABLE_TICKS) return false;
        return getCoverageRatio(currentCount, targetCount) < LOW_COVERAGE_RECOVERY_RATIO;
    }

    function recordScrollRecovery(modeLabel, record) {
        const bucket = state.scrollRecovery[modeLabel];
        if (!bucket) return;
        bucket.push(record);
        if (bucket.length > 30) {
            bucket.shift();
        }
    }

    async function attemptScrollRecovery(currentScrollBox, targetCount, targetSet, modeLabel, attempt, stableTicks) {
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";
        const beforeCount = targetSet.size;
        const coverageRatio = getCoverageRatio(beforeCount, targetCount);
        const beforeBox = currentScrollBox;

        console.log(
            `⚠️ ${baseLog} 목표 ${targetCount}명 중 ${beforeCount}명에서 정체 감지 ` +
            `(coverage ${(coverageRatio * 100).toFixed(1)}%, stable=${stableTicks}).`
        );
        console.log(`🔁 ${baseLog} 복구 시도 ${attempt}/${MAX_SCROLL_RECOVERY_ATTEMPTS}: 스크롤 박스 재탐색`);

        const nextScrollBox = findFollowerListBox() || currentScrollBox;
        const scrollBoxChanged = !!nextScrollBox && nextScrollBox !== beforeBox;
        const activeScrollBox = nextScrollBox || beforeBox;

        if (!activeScrollBox) {
            const record = {
                at: new Date().toISOString(),
                attempt,
                mode: modeLabel,
                beforeCount,
                afterCount: beforeCount,
                targetCount,
                coverageRatio,
                scrollBoxChanged: false,
                recovered: false,
                reason: "no_scroll_box"
            };
            recordScrollRecovery(modeLabel, record);
            console.log(`❌ ${baseLog} 복구 실패: 스크롤 박스를 찾지 못했습니다.`);
            return { scrollBox: currentScrollBox, recovered: false, record };
        }

        const domBefore = collectFromDOM(activeScrollBox, targetSet);
        await performListScroll(activeScrollBox);
        await wait(1200, 400);
        const domAfter = collectFromDOM(activeScrollBox, targetSet);
        const afterCount = targetSet.size;
        const recovered = afterCount > beforeCount;

        const record = {
            at: new Date().toISOString(),
            attempt,
            mode: modeLabel,
            beforeCount,
            afterCount,
            targetCount,
            coverageRatio,
            stableTicks,
            scrollBoxChanged,
            domBefore,
            domAfter,
            recovered,
            candidate: state.lastScrollBoxCandidates[0] || null,
            reason: recovered ? "count_increased" : "no_new_users_after_recovery"
        };
        recordScrollRecovery(modeLabel, record);

        if (scrollBoxChanged) {
            console.log(`🧭 ${baseLog} 복구: 새 스크롤 박스로 교체했습니다.`);
        }
        if (recovered) {
            console.log(`✅ ${baseLog} 복구 성공: +${afterCount - beforeCount}명 / ${afterCount}/${targetCount}명`);
        } else {
            console.log(`⚠️ ${baseLog} 복구 후에도 새 계정이 없습니다. 다음 복구 또는 partial 종료를 준비합니다.`);
        }

        return { scrollBox: activeScrollBox, recovered, record };
    }

    async function reverifyCurrentListCollection(targetCount, targetSet, modeLabel, maxPasses = MAX_MISMATCH_REVERIFY_PASSES) {
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";
        if (targetCount <= 0 || targetSet.size >= targetCount) {
            return { ok: true, passes: 0, finalCount: targetSet.size, reason: "already_complete" };
        }

        for (let pass = 1; pass <= maxPasses; pass++) {
            const scrollBox = findFollowerListBox();
            if (!scrollBox) {
                return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "no_scroll_box" };
            }

            console.log(`🔁 ${baseLog} 누락 재검증 ${pass}/${maxPasses}: ${targetSet.size}/${targetCount}명`);

            const maxTop = Math.max(0, scrollBox.scrollHeight - scrollBox.clientHeight);
            const checkpoints = [0, 0.25, 0.5, 0.75, 1];

            for (const point of checkpoints) {
                scrollBox.scrollTop = Math.floor(maxTop * point);
                await wait(520, 180);

                const addedBeforeScroll = collectFromDOM(scrollBox, targetSet);
                console.log(`🔎 ${baseLog} 재검증 지점 ${Math.round(point * 100)}%: ${targetSet.size}/${targetCount}명 (DOM 추가 ${addedBeforeScroll})`);
                if (targetSet.size >= targetCount) {
                    return { ok: true, passes: pass, finalCount: targetSet.size, reason: "target_reached_checkpoint" };
                }

                await performListScroll(scrollBox);
                await wait(760, 240);

                const addedAfterScroll = collectFromDOM(scrollBox, targetSet);
                if (addedAfterScroll > 0) {
                    console.log(`➕ ${baseLog} 재검증 추가 수집: +${addedAfterScroll} / ${targetSet.size}/${targetCount}명`);
                }
                if (targetSet.size >= targetCount) {
                    return { ok: true, passes: pass, finalCount: targetSet.size, reason: "target_reached_scroll" };
                }
            }
        }

        return { ok: false, passes: maxPasses, finalCount: targetSet.size, reason: "count_mismatch_after_reverify" };
    }

    async function scrollUntilEnd(targetCount = TARGET_COUNT, targetSet = state.collectedUsers, modeLabel = "followers", options = {}) {
        let scrollBox = findFollowerListBox();
        if (!scrollBox) {
            console.log(`❌ ${modeLabel} 목록 스크롤 박스를 못 찾았어요. 목록이 열려 있는지 확인하세요.`);
            state.lastScrollEndReason = "no_scroll_box";
            return [];
        }

        const shouldKeepScrollBox = options.saveScrollBoxForFollow || false;
        const previousMode = state.activeCollectionMode;
        state.activeCollectionMode = modeLabel;
        state.lastScrollEndReason = "running";
        state.scrollDiagnostics = [];

        const limitLabel = Math.max(targetCount, 0);
        const targetDisplay = limitLabel > 0 ? `${limitLabel}` : "전체";
        let stableTicks = 0;
        let lastCount = 0;
        let recoveryAttempts = 0;
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";

        if (options.reset) targetSet.clear();

        console.log(`🚀 ${baseLog} 수집 시작: 목표 ${targetDisplay}명`);
        console.log("🧭 선택된 스크롤 후보:", state.lastScrollBoxCandidates[0] || "(진단 없음)");

        while (true) {
            const beforeDom = collectFromDOM(scrollBox, targetSet);
            const currentCount = targetSet.size;
            const diagnostic = recordScrollDiagnostic(scrollBox, modeLabel, currentCount, beforeDom, stableTicks);

            console.log(
                `⏳ 현재 ${baseLog} ${currentCount}명 / 목표 ${targetDisplay}명 (DOM 추가: ${beforeDom}, 네트워크 실시간 반영)`
            );

            if (limitLabel > 0 && currentCount >= limitLabel) {
                console.log(`✅ ${baseLog} 목표 달성: ${currentCount}명`);
                state.lastScrollEndReason = "target_reached";
                break;
            }

            if (scrollBox.scrollHeight <= scrollBox.clientHeight + 1) {
                console.log("📌 스크롤 가능한 여유가 없어요. 이미 끝이거나 구조 변경 가능성이 있습니다.");
            }

            await performListScroll(scrollBox);
            await wait(1800, 700);

            if (currentCount === lastCount && beforeDom === 0) {
                stableTicks++;
            } else {
                stableTicks = 0;
                lastCount = currentCount;
            }

            if (stableTicks > 0 && stableTicks % 2 === 0) {
                scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - 420);
                await wait(400, 200);
                await performListScroll(scrollBox);
            }

            if (shouldAttemptScrollRecovery(currentCount, limitLabel, stableTicks, recoveryAttempts)) {
                recoveryAttempts++;
                const recovery = await attemptScrollRecovery(scrollBox, limitLabel, targetSet, modeLabel, recoveryAttempts, stableTicks);
                scrollBox = recovery.scrollBox || scrollBox;
                if (recovery.recovered) {
                    stableTicks = 0;
                    lastCount = targetSet.size;
                    await wait(500, 300);
                    continue;
                }
            }

            if (stableTicks >= MAX_STABLE_TICKS) {
                console.log(`🏁 ${baseLog} 수집 정체. 목록 끝 또는 스크롤 컨테이너 불일치로 판단하고 종료합니다.`);
                if (limitLabel > 0 && getCoverageRatio(targetSet.size, limitLabel) < LOW_COVERAGE_RECOVERY_RATIO) {
                    console.log(
                        `⚠️ ${baseLog} 낮은 수집률(${(getCoverageRatio(targetSet.size, limitLabel) * 100).toFixed(1)}%)로 partial 종료합니다. ` +
                        `복구 시도 ${recoveryAttempts}/${MAX_SCROLL_RECOVERY_ATTEMPTS}회.`
                    );
                }
                console.log("🧪 마지막 스크롤 진단:", diagnostic);
                state.lastScrollEndReason = recoveryAttempts > 0 ? "stalled_after_recovery" : "stalled";
                break;
            }

            await wait(500, 500);
        }

        const result = Array.from(targetSet);
        if (modeLabel === "followers" && shouldKeepScrollBox) {
            state.followersScrollBox = scrollBox;
            state.lastFollowersScrollEndReason = state.lastScrollEndReason;
            state.lastFollowersScrollDiagnostics = state.scrollDiagnostics.slice();
        }

        state.activeCollectionMode = previousMode;
        console.log(`📦 ${baseLog} 최종 수집 ${result.length}명`);
        return result;
    }

    function getProfileKey() {
        const match = location.pathname.match(/^\/([a-zA-Z0-9._]+)/);
        return match ? match[1] : "unknown_profile";
    }

    function getStorageKey() {
        return `${STORAGE_PREFIX}:${getProfileKey()}`;
    }

    function compareFollowSets() {
        const followers = new Set(Array.from(state.collectedUsers).map((u) => u.toLowerCase()));
        const following = new Set(Array.from(state.followingUsers).map((u) => u.toLowerCase()));

        const onlyFollowers = Array.from(followers).filter((u) => !following.has(u)).sort();
        const onlyFollowing = Array.from(following).filter((u) => !followers.has(u)).sort();
        const both = followers.size + following.size - onlyFollowers.length - onlyFollowing.length;

        return {
            basis: FINAL_DIFF_POLICY,
            followersWithoutMeFollowing: onlyFollowers,
            iFollowButNotReturned: onlyFollowing,
            mutualCount: Math.max(both, 0)
        };
    }

    function printAccountList(title, users, mode = null) {
        console.log(`📌 ${title}: ${users.length}명`);
        if (users.length === 0) {
            console.log("   없음");
            return;
        }

        users.forEach((username, index) => {
            const provenance = mode ? ` [${getUsernameProvenance(username, mode)}]` : "";
            console.log(`   ${index + 1}. ${username}${provenance}`);
        });
    }

    function getUnconfirmedCandidates(mode) {
        const confirmed = mode === "following" ? state.followingUsers : state.collectedUsers;
        return Array.from(state.candidateUsers[mode]).filter((username) => !confirmed.has(username)).sort();
    }

    function printCandidateUsers() {
        const followerCandidates = getUnconfirmedCandidates("followers");
        const followingCandidates = getUnconfirmedCandidates("following");
        const total = followerCandidates.length + followingCandidates.length;

        if (total === 0) {
            console.log("✅ 검증 필요 후보: 없음");
            return;
        }

        console.log("========== 검증 필요 후보 ==========");
        console.log("⚠️ 아래 계정은 애매한 network 응답에서만 발견되어 최종 diff 계산에는 넣지 않았습니다.");
        printAccountList("팔로워 후보", followerCandidates, "followers");
        printAccountList("팔로잉 후보", followingCandidates, "following");
    }

    function printFollowDiffs(diffs) {
        console.log("========== 맞팔 비교 요약 ==========");
        console.log("🧭 비교 기준:", diffs.basis || FINAL_DIFF_POLICY);
        console.log("ℹ️ 검증 필요 후보(candidate)는 아래 final diff 계산에서 제외했습니다.");
        if (diffs.reliability === "partial") {
            console.log("⚠️ 결과 신뢰도: partial (수집 불완전으로 오탐 가능)");
        }
        if (Array.isArray(diffs.warnings)) {
            diffs.warnings.forEach((warning) => console.log(`⚠️ ${warning.message}`));
        }
        console.log(`📌 맞팔 수: ${diffs.mutualCount}명`);
        printAccountList("팔로워지만 내가 팔로우하지 않는 계정", diffs.followersWithoutMeFollowing, "followers");
        printAccountList("내가 팔로우하지만 팔로워가 아닌 계정", diffs.iFollowButNotReturned, "following");
        printCandidateUsers();
    }

    function printSummary(summary) {
        console.log("========== 실행 결과 ==========");
        console.log("🧭 Run ID:", summary.runId || state.runId);
        console.log("🧭 실행 모드:", summary.executionMode || EXECUTION_MODE);
        console.log("🧭 final diff 기준:", summary.finalDiffPolicy || FINAL_DIFF_POLICY);
        console.log("🎯 결과 상태:", summary.status);
        console.log(`📦 팔로워 수집: ${summary.followersCount}명${summary.expectedFollowersCount ? ` / 화면 표시 ${summary.expectedFollowersCount}명` : ""}`);
        console.log(`📦 팔로잉 수집: ${summary.followingCount}명${summary.expectedFollowingCount ? ` / 화면 표시 ${summary.expectedFollowingCount}명` : ""}`);
        console.log(`👍 팔로우 클릭: ${summary.followClicks}명`);
        if (summary.expectedFollowersCount !== null && summary.expectedFollowersCount !== undefined) {
            console.log(`🧮 팔로워 수량 차이: ${summary.followersCount - summary.expectedFollowersCount}명`);
        }
        if (summary.expectedFollowingCount !== null && summary.expectedFollowingCount !== undefined) {
            console.log(`🧮 팔로잉 수량 차이: ${summary.followingCount - summary.expectedFollowingCount}명`);
        }
        if (summary.followersCollectionStatus) {
            console.log("🧪 팔로워 수집 상태:", summary.followersCollectionStatus);
        }
        if (summary.followingCollectionStatus) {
            console.log("🧪 팔로잉 수집 상태:", summary.followingCollectionStatus);
        }
        if (summary.followersReverify) {
            console.log(`🔁 팔로워 재검증: ${summary.followersReverify.ok ? "성공" : "미해결"} (${summary.followersReverify.finalCount}명, ${summary.followersReverify.reason})`);
        }
        if (summary.followingReverify) {
            console.log(`🔁 팔로잉 재검증: ${summary.followingReverify.ok ? "성공" : "미해결"} (${summary.followingReverify.finalCount}명, ${summary.followingReverify.reason})`);
        }
        if (summary.followersScrollEndReason) {
            console.log("🧪 팔로워 스크롤 종료 원인:", summary.followersScrollEndReason);
        }
        console.log("🧪 팔로워 열기:", summary.openedFollowers ? "성공" : "실패");
        console.log("🧪 팔로잉 열기:", summary.openedFollowing ? "성공" : "실패");
        if (summary.lastError) {
            console.log("⚠️ 마지막 실패 원인:", summary.lastError);
        }
        if (summary.followersMismatchDiagnostic) {
            printCollectionDiagnostic(summary.followersMismatchDiagnostic);
        }
        if (summary.followingMismatchDiagnostic) {
            printCollectionDiagnostic(summary.followingMismatchDiagnostic);
        }
        if (summary.diffs) {
            printFollowDiffs(summary.diffs);
        }
        if (summary.followers && summary.followers.length > 0) {
            console.log("📄 팔로워 목록 샘플(최대 20개):", summary.followers.slice(0, 20).join(", "));
        }
        if (summary.following && summary.following.length > 0) {
            console.log("📄 팔로잉 목록 샘플(최대 20개):", summary.following.slice(0, 20).join(", "));
        }
        if (summary.followingClickedUsers && summary.followingClickedUsers.length > 0) {
            console.log("✅ 이번 실행에서 팔로우 클릭한 계정:", summary.followingClickedUsers.join(", "));
        }
        console.log("📦 전체 결과 객체: window.__igFollowerResult");
    }

    function persistFollowers(followers, diffs) {
        const payload = {
            profile: getProfileKey(),
            runId: state.runId,
            collectedAt: new Date().toISOString(),
            source: location.href,
            executionMode: EXECUTION_MODE,
            followActionEnabled: FOLLOW_ACTION_ENABLED,
            finalDiffPolicy: FINAL_DIFF_POLICY,
            followers: followers,
            following: Array.from(state.followingUsers),
            snapshots: {
                followers: {
                    type: "followers",
                    confidence: getListReliability("followers", state.expectedCounts.followers || 0).status,
                    usernames: getVerifiedUsers("followers"),
                    candidates: getUnconfirmedCandidates("followers"),
                    sourceCounts: getSourceCounts("followers")
                },
                following: {
                    type: "following",
                    confidence: getListReliability("following", state.expectedCounts.following || 0).status,
                    usernames: getVerifiedUsers("following"),
                    candidates: getUnconfirmedCandidates("following"),
                    sourceCounts: getSourceCounts("following")
                }
            },
            provenance: {
                followers: serializeProvenanceMap("followers"),
                following: serializeProvenanceMap("following")
            },
            candidates: {
                followers: getUnconfirmedCandidates("followers"),
                following: getUnconfirmedCandidates("following")
            },
            diffs,
            expectedCounts: {
                followers: state.expectedCounts.followers,
                following: state.expectedCounts.following
            },
            scroll: {
                followersEndReason: state.lastFollowersScrollEndReason,
                followersDiagnostics: state.lastFollowersScrollDiagnostics.slice(-20)
            },
            collectionDiagnostics: state.collectionDiagnostics,
            followClicks: {
                count: state.followButtonsClicked,
                users: Array.from(state.followedUsers)
            }
        };
        payload.debugReport = buildDebugReport({ status: diffs ? "compared" : "collected" });

        const key = getStorageKey();
        const store = window.__igFollowerMemory || {};
        store[key] = payload;
        store.lastRun = payload;
        window.__igFollowerMemory = store;
        window.__igFollowerResult = payload;
        window.__igFollowerDebugReport = payload.debugReport;

        console.log("========== 결과 저장 ==========");
        console.log("📦 메모리 저장 완료:", key);
        console.log("👤 대상 프로필:", payload.profile);
        console.log("📅 저장 시각:", payload.collectedAt);
        console.log(`📦 저장된 팔로워/팔로잉: ${payload.followers.length}명 / ${payload.following.length}명`);
        console.log(`👍 저장된 팔로우 클릭 수: ${payload.followClicks.count}명`);
        console.log(`🔎 출처 기록: 팔로워 ${Object.keys(payload.provenance.followers).length}명 / 팔로잉 ${Object.keys(payload.provenance.following).length}명`);
        console.log(`🧪 검증 필요 후보: 팔로워 ${payload.candidates.followers.length}명 / 팔로잉 ${payload.candidates.following.length}명`);
        console.log("📌 전체 데이터 확인: window.__igFollowerResult");
        console.log("🔎 디버그 리포트 확인: window.__igFollowerDebugReport");
        printDebugReportSummary(window.__igFollowerDebugReport);

        return payload;
    }

    async function followVisibleButtons(targetCount = TARGET_COUNT) {
        const scrollBox = state.followersScrollBox;
        if (!scrollBox) {
            console.log("❌ 팔로우 처리할 스크롤 박스가 없습니다. 먼저 팔로워 수집을 먼저 실행하세요.");
            return;
        }

        console.log(`🚀 팔로우 처리 시작 (${targetCount > 0 ? `목표 ${targetCount}명` : "제한 없음"})`);

        let stable = 0;
        while (true) {
            const beforeCount = state.followButtonsClicked;
            const buttons = getVisibleFollowButtons(scrollBox);
            let clickedThisRound = 0;

            for (const button of buttons) {
                const username = getUsernameFromButton(button);
                if (username && state.followedUsers.has(username)) continue;

                const result = await clickFollowButton(button);
                if (!result.ok) {
                    if (result.reason === "unexpected-navigation") {
                        console.log("⚠️ 버튼 클릭으로 예상치 못한 이동이 감지되어 스킵합니다:", username || "(익명)");
                        continue;
                    }
                    if (result.reason === "navigation-blocked") {
                        console.log("🛡️ 버튼 클릭 중 네비게이션 차단으로 안전하게 스킵합니다:", username || "(익명)");
                        continue;
                    }
                    console.log(`⚠️ 팔로우 클릭이 반영되지 않았습니다: ${username || "(익명 버튼)"}`);
                    continue;
                }

                if (username) {
                    state.followedUsers.add(username);
                }

                state.followButtonsClicked++;
                clickedThisRound++;

                console.log(`👍 팔로우 클릭: ${username || "(익명 버튼)"}`);
                console.log("⏱️ 진행:", state.followButtonsClicked, "클릭");

                if (targetCount > 0 && state.followButtonsClicked >= targetCount) {
                    console.log(`✅ 팔로우 목표 달성: ${state.followButtonsClicked}명`);
                    return;
                }

                await wait(900, 600);
            }

            if (clickedThisRound === 0) {
                stable++;
            } else {
                stable = 0;
            }

            if (beforeCount === state.followButtonsClicked && clickedThisRound === 0) {
                stable += 1;
            }

            if (stable >= MAX_FOLLOW_STABLE_TICKS) {
                console.log("🏁 더 이상 팔로우 버튼이 새로 뜨지 않아 종료합니다.");
                break;
            }

            scrollBox.scrollTop = scrollBox.scrollHeight;
            await wait(1200, 400);
            if (scrollBox.scrollHeight <= scrollBox.clientHeight + 1) {
                stable++;
            }
        }

        console.log("🏁 팔로우 처리 종료:", state.followButtonsClicked, "명");
    }

    async function main() {
        const summary = {
            status: "running",
            startedAt: new Date().toISOString(),
            runId: "",
            executionMode: EXECUTION_MODE,
            followActionEnabled: FOLLOW_ACTION_ENABLED,
            finalDiffPolicy: FINAL_DIFF_POLICY,
            followersCount: 0,
            followingCount: 0,
            followClicks: 0,
            openedFollowers: false,
            openedFollowing: false,
            lastError: null,
            diffs: null,
            expectedFollowersCount: null,
            expectedFollowingCount: null,
            followersCollectionStatus: null,
            followingCollectionStatus: null,
            followersReverify: null,
            followingReverify: null,
            followersSettled: null,
            followingSettled: null,
            followersMismatchDiagnostic: null,
            followingMismatchDiagnostic: null,
            followersScrollEndReason: null,
            followersScrollDiagnostics: [],
            followersScrollRecovery: [],
            followingClickedUsers: [],
            followers: [],
            following: []
        };

        state.runId = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        summary.runId = state.runId;
        state.collectedUsers.clear();
        state.followingUsers.clear();
        state.followedUsers.clear();
        state.followButtonsClicked = 0;
        state.followersScrollBox = null;
        state.userProvenance.followers.clear();
        state.userProvenance.following.clear();
        state.candidateUsers.followers.clear();
        state.candidateUsers.following.clear();
        state.scrollRecovery.followers = [];
        state.scrollRecovery.following = [];
        state.collectionDiagnostics.followers = null;
        state.collectionDiagnostics.following = null;

        hookNetwork();
        installExtensionMessageBridge();

        console.log("%c1) 네트워크 감시 후크 설치 + 실행 시작", "color: #ff8c00; font-size: 1.1em;");
        const openedFollowers = await openPopupByType("followers");
        summary.openedFollowers = openedFollowers;
        summary.expectedFollowersCount = state.expectedCounts.followers;
        if (!openedFollowers) {
            summary.status = "failed_open_followers";
            summary.lastError = "팔로워 버튼 클릭/대화창 오픈 실패";
            printSummary(summary);
            return;
        }

        console.log("2) 팔로워 목록 로딩 대기...");
        summary.followersSettled = await waitForListSettled("followers");
        await wait(700, 300);
        console.log("3) 팔로워 이중 수집 시작...");
        const followersTarget = state.expectedCounts.followers || TARGET_COUNT;
        console.log(`🎯 팔로워 목표 기준: 화면 표시 ${state.expectedCounts.followers || "없음"}명, 실제 목표 ${followersTarget}명`);
        let followers = await scrollUntilEnd(followersTarget, state.collectedUsers, "followers", { saveScrollBoxForFollow: true });
        if (followersTarget > 0 && followers.length < followersTarget) {
            summary.followersReverify = await reverifyCurrentListCollection(followersTarget, state.collectedUsers, "followers");
            followers = Array.from(state.collectedUsers);
        }
        summary.followersCount = followers.length;
        summary.followers = followers;
        summary.followersScrollEndReason = state.lastFollowersScrollEndReason;
        summary.followersScrollDiagnostics = state.lastFollowersScrollDiagnostics.slice(-20);
        summary.followersScrollRecovery = state.scrollRecovery.followers.slice(-20);

        if (followersTarget > 0 && followers.length < followersTarget) {
            summary.status = "collection_incomplete";
            summary.followersCollectionStatus = "incomplete";
            summary.lastError = `팔로워 수집이 목표 ${followersTarget}명보다 낮은 ${followers.length}명에서 종료되었습니다. 팔로우 단계는 실행하지 않습니다.`;
            summary.diffs = null;
            summary.followersMismatchDiagnostic = captureAndPrintCollectionDiagnostic(state.collectedUsers, followersTarget, "followers");
            console.log("🛑 팔로워 수집 미완료로 팔로우 처리를 중단합니다.");
            console.log("🧪 수집 종료 원인:", summary.followersScrollEndReason);
            console.log("🧪 최근 스크롤 진단:", summary.followersScrollDiagnostics.slice(-5));
            await closeActiveDialog();
            persistFollowers(followers, summary.diffs);
            printSummary(summary);
            return;
        }
        summary.followersCollectionStatus = "complete";

        if (FOLLOW_ACTION_ENABLED) {
            console.log("4) 팔로우 처리 시작...");
            await followVisibleButtons(followersTarget);
            summary.followingClickedUsers = Array.from(state.followedUsers);
            summary.followClicks = state.followButtonsClicked;
        } else {
            console.log("4) collect/compare 안전 모드: 팔로우 액션을 실행하지 않습니다.");
            console.log("ℹ️ 팔로우 실행은 비교 결과를 검토한 뒤 별도 follow-action 단계에서만 수행하는 구조로 분리합니다.");
            summary.followingClickedUsers = [];
            summary.followClicks = 0;
        }

        console.log("5) 팔로워 목록 닫기...");
        const closedFollowersDialog = await closeActiveDialog();
        if (!closedFollowersDialog) {
            console.log("⚠️ 팔로워 모달 닫기 실패. 마지막 시도 후 1회 더 시도합니다.");
            await wait(800, 0);
            const recheckClosed = await closeActiveDialog();
            if (!recheckClosed) {
                summary.status = "failed_close_followers_modal";
                summary.lastError = "팔로워 모달을 닫지 못해 팔로잉 수집을 진행할 수 없습니다.";
                summary.diffs = null;
                summary.followingCount = state.followingUsers.size;
                persistFollowers(followers, summary.diffs);
                printSummary(summary);
                return;
            }
        }

        console.log("5-1) 모달 닫기 완료 후 2초 대기...");
        await wait(2000, 0);

        console.log("6) 팔로잉 목록 열기...");
        const openedFollowing = await openPopupByType("following");
        summary.openedFollowing = openedFollowing;
        summary.expectedFollowingCount = state.expectedCounts.following;
        if (!openedFollowing) {
            console.log("⚠️ 팔로잉 목록 오픈 실패. 팔로워 기준 비교는 불가");
            summary.diffs = null;
            summary.followingCount = state.followingUsers.size;
            summary.status = "failed_open_following";
            summary.lastError = "팔로잉 버튼 클릭/대화창 오픈 실패";
            persistFollowers(followers, summary.diffs);
            printSummary(summary);
            return;
        }

        summary.followingSettled = await waitForListSettled("following");
        await wait(500, 200);
        console.log("7) 팔로잉 목록 수집 시작...");
        const followingTarget = state.expectedCounts.following || 0;
        let following = await scrollUntilEnd(followingTarget, state.followingUsers, "following", { reset: true });
        if (followingTarget > 0 && following.length < followingTarget) {
            summary.followingReverify = await reverifyCurrentListCollection(followingTarget, state.followingUsers, "following");
            following = Array.from(state.followingUsers);
        }
        summary.followingCount = following.length;
        summary.following = following;
        if (followingTarget > 0 && following.length < followingTarget) {
            summary.followingCollectionStatus = "count_mismatch";
            summary.status = "completed_with_count_mismatch";
            summary.lastError = `팔로잉 목록이 ${followingTarget}명 중 ${following.length}명만 수집되어 맞팔 비교 결과에 오탐이 포함될 수 있습니다.`;
            summary.diffs = {
                ...compareFollowSets(),
                reliability: "partial",
                warnings: [
                    {
                        code: "following_count_mismatch",
                        severity: "warning",
                        message: "팔로잉 수집이 화면 표시 수보다 적어 diff 결과에 오탐이 포함될 수 있습니다. 특히 '팔로워지만 내가 팔로우하지 않는 계정'은 실제보다 많이 표시될 수 있습니다.",
                        expectedFollowingCount: followingTarget,
                        collectedFollowingCount: following.length,
                        missingFollowingCount: followingTarget - following.length,
                        affectedFields: ["followersWithoutMeFollowing", "mutualCount"]
                    }
                ]
            };
            summary.followingMismatchDiagnostic = captureAndPrintCollectionDiagnostic(state.followingUsers, followingTarget, "following");
            console.log("⚠️ 팔로잉 수집 수량 불일치:", summary.lastError);
            console.log("⚠️ 아래 맞팔 비교는 참고용 partial 결과입니다.");
            printFollowDiffs(summary.diffs);
            persistFollowers(followers, summary.diffs);
            printSummary(summary);
            console.log("8) 팔로잉 수집이 불완전하지만 partial diff 저장 완료");
            return;
        } else {
            summary.followingCollectionStatus = "complete";
        }

        const diffs = compareFollowSets();
        summary.diffs = diffs;
        if (summary.status !== "completed_with_count_mismatch") {
            summary.status = "completed";
        }
        printFollowDiffs(diffs);
        persistFollowers(followers, diffs);
        printSummary(summary);
        console.log("8) 전체 저장 완료");
    }

    main();
}
