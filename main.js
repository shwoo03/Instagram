{
    // --- [공통 도우미 함수: 랜덤 대기] ---
    const wait = (base, jitter = 0) => new Promise(resolve => setTimeout(resolve, base + Math.random() * jitter));

    const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
    const FOLLOWERS_URL_RE = /(friendships|followers|following|graphql)/i;
    const IGNORED_URL_RE = /(edge-chat|mqtt|realtime|presence|logging|analytics|beacon|direct_v2|\/direct\/|upload|media\/upload)/i;
    const MAX_BODY_CHARS = 512_000;
    const MAX_STABLE_TICKS = 16;
    const DISPLAYED_COUNT_GAP_TOLERANCE = 5; // 표시 수와 목록 끝 확정 수집 수의 허용 격차(비활성 계정 추정 범위)
    const MAX_FOLLOW_STABLE_TICKS = 12;
    const MAX_MISMATCH_REVERIFY_PASSES = 1;
    const LIST_SETTLE_REQUIRED_TICKS = 3;
    const LIST_SETTLE_MAX_TICKS = 12;
    const MAX_COLLECTION_MS = 10 * 60 * 1000;
    const DEVTOOLS_READY_STALE_MS = 12000;
    const STORAGE_PREFIX = "ig_follower_snapshot";
    const EXECUTION_MODE = "collect-and-compare";
    const FOLLOW_ACTION_ENABLED = false;
    const FINAL_DIFF_POLICY = "verified_members_only";
    const LOW_COVERAGE_RECOVERY_RATIO = 0.7;
    const LOW_COVERAGE_STABLE_TICKS = 3;
    const MAX_SCROLL_RECOVERY_ATTEMPTS = 3;
    const MAX_USERNAME_EVIDENCE_EVENTS = 8;
    const MAX_RUN_TIMELINE_EVENTS = 80;
    const DEFAULT_PRINT_LIST_LIMIT = 50;
    const SCROLL_VERBOSE_EVERY_TICKS = 3;
    const DEVTOOLS_PREFLIGHT_GRACE_MS = 2200;
    const PAGE_NETWORK_AUTO_ASSIST_ENABLED = false;
    const RATE_LIMIT_BASE_PAUSE_MS = 60_000;
    const RATE_LIMIT_MAX_PAUSE_MS = 240_000;
    const RATE_LIMIT_MAX_EVENTS = 3;
    const RATE_LIMIT_DEDUP_WINDOW_MS = 10_000;
    const DOM_TIER_SOURCES = new Set(["DOM", "dom-observer"]);
    const DOM_CANDIDATE_SOURCES = new Set(["dom-candidate", "dom-observer-candidate"]);

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
        runProfile: null,
        lastCount: 0,
        stableTicks: 0,
        followButtonsClicked: 0,
        followedUsers: new Set(),
        followersScrollBox: null,
        cachedScrollBox: null,
        lastScrollBoxCandidates: [],
        scrollDiagnostics: [],
        scrollRecovery: {
            followers: [],
            following: []
        },
        lastScrollEndReason: null,
        lastFollowersScrollEndReason: null,
        lastFollowersScrollDiagnostics: [],
        lastFollowingScrollEndReason: null,
        lastFollowingScrollDiagnostics: [],
        collectionDiagnostics: {
            followers: null,
            following: null
        },
        userProvenance: {
            followers: new Map(),
            following: new Map()
        },
        sourceCountsCache: {
            followers: Object.create(null),
            following: Object.create(null)
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
            confirmedPayloadCount: 0,
            candidatePayloadCount: 0,
            addedCount: 0,
            lastReadyAt: null,
            lastStatusAt: null,
            lastPayloadAt: null,
            lastError: null,
            lastStatus: null
        },
        pageNetworkBridge: {
            listenerInstalledAt: null,
            ready: false,
            enabled: false,
            autoEnabled: false,
            enableRequestedAt: null,
            statusCount: 0,
            payloadCount: 0,
            candidatePayloadCount: 0,
            confirmedPayloadCount: 0,
            addedCount: 0,
            lastPayloadAt: null,
            lastStatusAt: null,
            lastError: null,
            lastStatus: null
        },
        activeCollectionMode: "followers",
        accuracyPreflight: null,
        rateLimit: {
            count: 0,
            lastDetectedAtMs: 0,
            pausedUntilMs: 0,
            lastOrigin: null
        },
        runTimeline: []
    };

    function isRunSuperseded() {
        return window.__igFollowerActiveRunId !== state.runId;
    }

    function hasProfileChanged() {
        return Boolean(state.runProfile) &&
            state.runProfile !== "unknown_profile" &&
            getProfileKey() !== state.runProfile;
    }

    function isUsableScrollBox(scrollBox) {
        return scrollBox instanceof Element &&
            scrollBox.isConnected &&
            isElementVisible(scrollBox) &&
            scrollBox.scrollHeight >= scrollBox.clientHeight;
    }

    function shouldAbortLongTask(startedAt, maxMs = MAX_COLLECTION_MS) {
        return isRunSuperseded() || Date.now() - startedAt > maxMs;
    }

    function registerRateLimitSignal(origin) {
        const now = Date.now();
        if (state.rateLimit.lastDetectedAtMs && now - state.rateLimit.lastDetectedAtMs < RATE_LIMIT_DEDUP_WINDOW_MS) {
            return;
        }

        state.rateLimit.count++;
        state.rateLimit.lastDetectedAtMs = now;
        state.rateLimit.lastOrigin = origin;
        const pauseMs = Math.min(
            RATE_LIMIT_BASE_PAUSE_MS * 2 ** (state.rateLimit.count - 1),
            RATE_LIMIT_MAX_PAUSE_MS
        );
        state.rateLimit.pausedUntilMs = Math.max(state.rateLimit.pausedUntilMs, now + pauseMs);
        recordRunEvent("rate_limit_detected", { origin, count: state.rateLimit.count, pauseMs });
        console.log(`🚦 Instagram 요청 제한(429) 신호 감지 (출처: ${origin}, ${state.rateLimit.count}회째). 스크롤을 약 ${Math.round(pauseMs / 1000)}초 일시정지합니다.`);
    }

    function isVerboseLogging() {
        return window.__igFollowerVerbose === true;
    }

    function getDebugLevel() {
        const level = String(window.__igFollowerDebugLevel || "").toLowerCase();
        if (["silent", "normal", "verbose", "trace"].includes(level)) return level;
        return isVerboseLogging() ? "verbose" : "normal";
    }

    function shouldLogDetailedProgress(diagnostic, beforeDom, stableTicks) {
        const level = getDebugLevel();
        if (level === "silent") return false;
        if (level === "verbose" || level === "trace") return true;
        return diagnostic.tick === 1 || diagnostic.tick % 8 === 0 || stableTicks >= 4;
    }

    function recordRunEvent(type, detail = {}) {
        const event = {
            at: new Date().toISOString(),
            type,
            mode: detail.mode || state.activeCollectionMode || null,
            detail
        };
        state.runTimeline.push(event);
        if (state.runTimeline.length > MAX_RUN_TIMELINE_EVENTS) {
            state.runTimeline.shift();
        }
        return event;
    }

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
        const confidence = detail.confidence || "confirmed";
        const reason = detail.reason || "";
        const existing = bucket.get(username) || {
            sources: new Set(),
            confidences: new Set(),
            reasons: new Set(),
            firstSeenAt: now,
            lastSeenAt: now,
            seenCount: 0,
            sourceSeenCounts: {},
            recentEvidence: []
        };

        const isNewUsername = existing.seenCount === 0;
        const isNewSource = !existing.sources.has(label);
        const isNewConfidence = !existing.confidences.has(confidence);
        const isNewReason = reason && !existing.reasons.has(reason);

        existing.sources.add(label);
        existing.confidences.add(confidence);
        if (reason) existing.reasons.add(reason);
        existing.lastSeenAt = now;
        existing.seenCount++;
        existing.sourceSeenCounts[label] = (existing.sourceSeenCounts[label] || 0) + 1;
        if (isNewSource) {
            const cache = state.sourceCountsCache[mode];
            if (cache) cache[label] = (cache[label] || 0) + 1;
        }

        if (isNewUsername || isNewSource || isNewConfidence || isNewReason || detail.forceEvidence) {
            existing.recentEvidence.push({
                at: now,
                mode,
                source: label,
                confidence,
                reason: reason || "not-specified",
                phase: detail.phase || state.activeCollectionMode || mode,
                scrollTick: detail.scrollTick || null,
                visibleIndex: Number.isFinite(detail.visibleIndex) ? detail.visibleIndex : null,
                payloadUsernameCount: detail.payloadUsernameCount || null,
                requestSeq: detail.requestSeq || null,
                safeUrlLabel: detail.safeUrlLabel || null
            });
            if (existing.recentEvidence.length > MAX_USERNAME_EVIDENCE_EVENTS) {
                existing.recentEvidence.shift();
            }
        }

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
                    seenCount: info.seenCount,
                    sourceSeenCounts: info.sourceSeenCounts || {},
                    recentEvidence: (info.recentEvidence || []).slice(-MAX_USERNAME_EVIDENCE_EVENTS)
                }
            ];
        }));
    }

    function getVerifiedUsers(mode) {
        return mode === "following" ? Array.from(state.followingUsers).sort() : Array.from(state.collectedUsers).sort();
    }

    function getSourceCounts(mode) {
        return { ...(state.sourceCountsCache[mode] || {}) };
    }

    function hasConfirmedNetworkEvidence(mode) {
        const counts = getSourceCounts(mode);
        return Boolean(
            (counts.DevTools || 0) > 0 ||
            (counts.XHR || 0) > 0 ||
            (counts.fetch || 0) > 0 ||
            (counts["page-XHR"] || 0) > 0 ||
            (counts["page-fetch"] || 0) > 0
        );
    }

    // [ig-compare:assess] tools/compare-fixtures.mjs가 이 함수를 추출해 검증한다. state 접근 금지(순수 함수 유지).
    function assessListCompletion({ expectedCount, verifiedCount, endReason, hasNetworkEvidence, nonDomCandidateCount }) {
        const gap = expectedCount > 0 ? expectedCount - verifiedCount : 0;
        const listEndConfirmed = endReason === "stalled_at_list_end" || endReason === "target_reached";
        const completeAtListEnd = Boolean(
            expectedCount > 0 &&
            gap > 0 &&
            gap <= DISPLAYED_COUNT_GAP_TOLERANCE &&
            listEndConfirmed &&
            hasNetworkEvidence &&
            nonDomCandidateCount === 0
        );
        return { gap, listEndConfirmed, completeAtListEnd };
    }

    function compareCandidateEvidence(aInfo, bInfo) {
        const aSeen = aInfo?.seenCount || 0;
        const bSeen = bInfo?.seenCount || 0;
        if (aSeen !== bSeen) return bSeen - aSeen;
        const aSources = aInfo?.sources?.size ?? (Array.isArray(aInfo?.sources) ? aInfo.sources.length : 0);
        const bSources = bInfo?.sources?.size ?? (Array.isArray(bInfo?.sources) ? bInfo.sources.length : 0);
        if (aSources !== bSources) return bSources - aSources;
        const aLast = aInfo?.lastSeenAt || "";
        const bLast = bInfo?.lastSeenAt || "";
        if (aLast !== bLast) return aLast > bLast ? -1 : 1;
        return 0;
    }

    function promoteDomCandidatesToConfirmed(mode, targetSet, expectedCount, reason = "network-shortfall") {
        if (!targetSet || expectedCount <= 0 || targetSet.size >= expectedCount) return [];

        const bucket = state.userProvenance[mode];
        const candidates = Array.from(state.candidateUsers[mode] || [])
            .filter((username) => {
                if (targetSet.has(username)) return false;
                const info = bucket?.get(username);
                const sources = Array.from(info?.sources || []);
                return sources.some((source) => DOM_CANDIDATE_SOURCES.has(source));
            })
            .sort((a, b) => compareCandidateEvidence(bucket?.get(a), bucket?.get(b)) || a.localeCompare(b));

        const promoted = [];
        const missing = expectedCount - targetSet.size;
        for (const username of candidates.slice(0, missing)) {
            if (addUsername(username, targetSet, "dom-fallback", mode, {
                reason: `promoted-dom-candidate-${reason}`,
                phase: `${mode}-candidate-promotion`,
                forceEvidence: true
            })) {
                promoted.push(username);
            }
        }

        if (promoted.length > 0) {
            const label = mode === "following" ? "팔로잉" : "팔로워";
            console.log(`🧩 ${label} DOM 후보 ${promoted.length}명을 부족분 보정으로 승격했습니다. (${targetSet.size}/${expectedCount})`);
            recordRunEvent("dom_candidates_promoted_ranked", {
                mode,
                promoted: promoted.slice(0, 20).map((username) => ({
                    username,
                    seenCount: bucket?.get(username)?.seenCount || 0,
                    sourceCount: bucket?.get(username)?.sources?.size || 0
                }))
            });
        }

        return promoted;
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
        const accuracyMode = getAccuracyMode(summary);
        const warnings = [...followers.warnings, ...following.warnings, ...accuracyMode.warnings.map((warning) => warning.message)];
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
            targetProfile: state.runProfile || getProfileKey(),
            timeline: state.runTimeline.slice(-MAX_RUN_TIMELINE_EVENTS),
            executionMode: EXECUTION_MODE,
            followActionEnabled: FOLLOW_ACTION_ENABLED,
            finalDiffPolicy: FINAL_DIFF_POLICY,
            rateLimit: { ...state.rateLimit },
            overallReliability,
            warnings,
            accuracyMode,
            followers,
            following,
            sources: {
                devtoolsBridge: getDevtoolsBridgeSnapshot(),
                pageNetworkBridge: getPageNetworkBridgeSnapshot(),
                dom: {
                    followersEndReason: state.lastFollowersScrollEndReason,
                    followersDiagnostics: state.lastFollowersScrollDiagnostics.slice(-10),
                    followingEndReason: state.lastFollowingScrollEndReason,
                    followingDiagnostics: state.lastFollowingScrollDiagnostics.slice(-10),
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
        if (report.accuracyMode) {
            console.log("🧭 정확도 모드:", report.accuracyMode.label);
        }
        console.log("🎯 전체 신뢰도:", report.overallReliability);
        console.log(`📦 팔로워 검증: ${report.followers.verifiedCount}명 / 화면 표시 ${report.followers.expectedCount || "알 수 없음"}명 / 후보 ${report.followers.candidateCount}명`);
        console.log(`📦 팔로잉 검증: ${report.following.verifiedCount}명 / 화면 표시 ${report.following.expectedCount || "알 수 없음"}명 / 후보 ${report.following.candidateCount}명`);
        const compareCounts = window.__igFollowerResult?.diffs?.compareCounts;
        if (compareCounts) {
            console.log(`📌 final diff 계산 기준: 팔로워 ${compareCounts.followers}명 / 팔로잉 ${compareCounts.following}명`);
        }
        if (report.warnings.length > 0) {
            report.warnings.forEach((warning) => console.log("⚠️", warning));
        }
        console.log("🔎 상세 진단: window.__igFollowerDebugReport");
    }

    function printReadableDebugSummary(report = window.__igFollowerDebugReport || buildDebugReport({ status: "debug" })) {
        if (!report) {
            console.log("⚠️ 아직 디버그 리포트가 없습니다. 먼저 수집을 실행하세요.");
            return null;
        }

        printDebugReportSummary(report);
        console.log("========== 실행 판단 ==========");
        if (report.overallReliability === "COMPLETE_HIGH_CONFIDENCE") {
            console.log("✅ 현재 결과는 화면 표시 수와 후보 상태 기준으로 높은 신뢰도입니다.");
        } else {
            console.log("⚠️ 현재 결과는 참고용/partial일 수 있습니다. 아래 경고와 제외 후보를 함께 확인하세요.");
        }

        if (report.accuracyMode) {
            console.log("🧭 정확도 판단:", report.accuracyMode.label);
            console.log("ℹ️ 다음 권장 행동:", report.accuracyMode.recommendedAction);
        }

        const excludedFollowers = report.excludedFromDiff?.followersCandidates?.length || 0;
        const excludedFollowing = report.excludedFromDiff?.followingCandidates?.length || 0;
        console.log(`🧪 final diff 제외 후보: 팔로워 ${excludedFollowers}명 / 팔로잉 ${excludedFollowing}명`);
        console.log("📦 원본 결과 객체: window.__igFollowerResult");
        console.log("🔎 원본 디버그 객체: window.__igFollowerDebugReport");
        console.log("👤 특정 계정 진단: window.__igFollowerExplainUser?.('username')");
        console.log("📄 전체 목록 출력: window.__igFollowerPrintFullList?.('followers' | 'following' | 'followersWithoutMeFollowing' | 'iFollowButNotReturned')");
        console.log("🧭 실행 타임라인: window.__igFollowerPrintTimeline?.()");
        console.log("⚠️ 경고만 보기: window.__igFollowerPrintWarnings?.()");
        return report;
    }

    function explainUsername(username) {
        const normalized = String(username || "").trim().toLowerCase();
        if (!USERNAME_RE.test(normalized)) {
            console.log("⚠️ 올바른 Instagram username 형식이 아닙니다:", username);
            return null;
        }

        const result = window.__igFollowerResult || {};
        const currentProfile = getProfileKey();
        const savedProfile = result.profile || "unknown_profile";
        const collectedAt = result.collectedAt || "";
        const runId = result.runId || "";
        const followers = new Set((result.followers || []).map((value) => String(value).toLowerCase()));
        const following = new Set((result.following || []).map((value) => String(value).toLowerCase()));
        const followerCandidates = new Set((result.candidates?.followers || []).map((value) => String(value).toLowerCase()));
        const followingCandidates = new Set((result.candidates?.following || []).map((value) => String(value).toLowerCase()));
        const inFollowers = followers.has(normalized);
        const inFollowing = following.has(normalized);
        const inFollowerCandidates = followerCandidates.has(normalized);
        const inFollowingCandidates = followingCandidates.has(normalized);
        const followerProvenance = result.provenance?.followers?.[normalized] || null;
        const followingProvenance = result.provenance?.following?.[normalized] || null;
        const followersStatus = result.debugReport?.followers || {};
        const followingStatus = result.debugReport?.following || {};
        const scrollStatus = result.scroll || {};

        let interpretation = "현재 결과에 포함되지 않았습니다.";
        if (inFollowers && inFollowing) {
            interpretation = "맞팔로 분류됩니다. followers와 following 양쪽에 모두 있습니다.";
        } else if (inFollowers) {
            interpretation = "나를 팔로우하지만 내가 팔로우하지 않는 계정으로 분류됩니다.";
        } else if (inFollowing) {
            interpretation = "내가 팔로우하지만 나를 팔로우하지 않는 계정으로 분류됩니다.";
        } else if (inFollowerCandidates || inFollowingCandidates) {
            interpretation = "검증 필요 후보(candidate)로만 남아 final diff에는 들어가지 않았습니다.";
        }

        const explanation = {
            username: normalized,
            inFollowers,
            inFollowing,
            inFollowerCandidates,
            inFollowingCandidates,
            followerProvenance,
            followingProvenance,
            followersStatus,
            followingStatus,
            scrollStatus,
            interpretation
        };

        console.log("========== 계정 진단 ==========");
        console.log("👤 계정:", normalized);
        console.log("🧭 실행 정보:", {
            savedProfile,
            currentProfile,
            collectedAt: collectedAt || "알 수 없음",
            runId: runId || "알 수 없음"
        });
        if (savedProfile !== "unknown_profile" && currentProfile !== "unknown_profile" && savedProfile !== currentProfile) {
            console.log("⚠️ 현재 페이지와 저장된 결과의 프로필이 다릅니다. 이전 실행 결과를 보고 있을 수 있습니다.");
        }
        console.log("📥 followers 포함:", inFollowers, followerProvenance || "출처 없음");
        console.log("📤 following 포함:", inFollowing, followingProvenance || "출처 없음");
        if (followerProvenance?.recentEvidence?.length) {
            console.log("📥 followers 최근 증거:", followerProvenance.recentEvidence);
        }
        if (followingProvenance?.recentEvidence?.length) {
            console.log("📤 following 최근 증거:", followingProvenance.recentEvidence);
        }
        console.log("🧪 후보 상태:", {
            followersCandidate: inFollowerCandidates,
            followingCandidate: inFollowingCandidates
        });
        console.log("📊 수집 상태:", {
            followers: `${followersStatus.verifiedCount ?? "?"}/${followersStatus.expectedCount || "알 수 없음"}`,
            following: `${followingStatus.verifiedCount ?? "?"}/${followingStatus.expectedCount || "알 수 없음"}`,
            followersEndReason: scrollStatus.followersEndReason || "알 수 없음",
            followingEndReason: scrollStatus.followingEndReason || "알 수 없음"
        });
        if (!inFollowing && inFollowers) {
            if (followingStatus.expectedCount && followingStatus.verifiedCount === followingStatus.expectedCount && scrollStatus.followingEndReason === "target_reached") {
                console.log("🧭 following 누락 가능성: 낮음. 팔로잉 수집 수가 화면 표시 수와 일치하고 target_reached로 종료됐습니다.");
            } else {
                console.log("🧭 following 누락 가능성: 있음. 팔로잉 수량/종료 원인/후보 상태를 함께 확인하세요.");
            }
        }
        console.log("🧭 해석:", interpretation);
        return explanation;
    }

    function printIgFollowerHelp() {
        console.log("========== Instagram Follower Comparator 도움말 ==========");
        console.log("1) 전체 상태 빠르게 보기: window.__igFollowerDebug?.()");
        console.log('2) 특정 계정 판정 보기: window.__igFollowerExplainUser?.("username")');
        console.log('3) final diff 목록 보기: window.__igFollowerPrintFullList?.("followersWithoutMeFollowing" | "iFollowButNotReturned")');
        console.log('4) followers/following 원본 목록 보기: window.__igFollowerPrintFullList?.("followers" | "following")');
        console.log("5) 실행 타임라인 보기: window.__igFollowerPrintTimeline?.()");
        console.log("6) 경고만 보기: window.__igFollowerPrintWarnings?.()");
        console.log("7) DevTools 상태 보기: window.__igFollowerPrintDevToolsStatus?.()");
        console.log("8) DevTools 없이 수동 page-network 보조 켜기: window.__igFollowerEnablePageNetworkBridge?.()");
        console.log("판정 순서: DevTools 확정 payload > page-network 확정 payload > DOM_PREVIEW");
    }

    function countSources(...sourceCountMaps) {
        const totals = {};
        for (const sourceCounts of sourceCountMaps) {
            for (const [source, count] of Object.entries(sourceCounts || {})) {
                totals[source] = (totals[source] || 0) + count;
            }
        }
        return totals;
    }

    function isDevtoolsBridgeFresh() {
        if (!state.devtoolsBridge.ready) return false;
        const latest = [state.devtoolsBridge.lastReadyAt, state.devtoolsBridge.lastStatusAt, state.devtoolsBridge.lastPayloadAt]
            .map((value) => Date.parse(value || ""))
            .filter(Number.isFinite);
        if (latest.length === 0) return false;
        return Date.now() - Math.max(...latest) <= DEVTOOLS_READY_STALE_MS;
    }

    function getAccuracyMode(summary = {}) {
        const bridge = getDevtoolsBridgeSnapshot();
        const sourceTotals = countSources(getSourceCounts("followers"), getSourceCounts("following"));
        const pageBridge = getPageNetworkBridgeSnapshot();
        const networkHookCount = (sourceTotals.XHR || 0) + (sourceTotals.fetch || 0) + (sourceTotals["XHR-candidate"] || 0) + (sourceTotals["fetch-candidate"] || 0) +
            (sourceTotals["page-XHR"] || 0) + (sourceTotals["page-fetch"] || 0) + (sourceTotals["page-XHR-candidate"] || 0) + (sourceTotals["page-fetch-candidate"] || 0);
        const warnings = [];

        let status = "DOM_PREVIEW";
        let label = "미리보기 모드(DOM only)";
        let recommendedAction = "네트워크 확정 증거가 없어 DOM 결과는 preview/provisional로만 봐야 합니다. 정확도 우선 실행이 필요하면 DevTools를 먼저 열고 Instagram 탭을 새로고침한 뒤 다시 실행하세요.";

        if (bridge.confirmedPayloadCount > 0) {
            status = "DEVTOOLS_ASSISTED";
            label = "DevTools 보조 검증 모드";
            recommendedAction = "DevTools Network 캡처가 검증된 결과에 참여했습니다. 그래도 최종 diff는 후보와 경고를 함께 확인해야 합니다.";
        } else if (bridge.candidatePayloadCount > 0) {
            status = "DEVTOOLS_CANDIDATES_ONLY";
            label = "DevTools 후보만 수신";
            recommendedAction = "DevTools에서 애매한 후보 payload만 들어왔습니다. final diff는 아직 DOM/확정 출처 중심이므로 새로고침 후 목록 요청을 다시 캡처하세요.";
            warnings.push({
                code: "devtools_candidates_only",
                severity: "warning",
                message: "DevTools Network 캡처가 후보 계정만 제공했고 검증된 DevTools payload는 없었습니다. 후보는 final diff에서 제외됩니다."
            });
        } else if (pageBridge.confirmedPayloadCount > 0) {
            status = "PAGE_NETWORK_ASSISTED";
            label = state.pageNetworkBridge.autoEnabled ? "자동 보조 모드(page network + DOM)" : "편의 모드(page network + DOM)";
            recommendedAction = "페이지 네트워크 브리지가 검증된 결과에 참여했습니다. DevTools 보조 검증은 아니므로 부분 결과 경고도 함께 확인하세요.";
            warnings.push({
                code: state.pageNetworkBridge.autoEnabled ? "page_network_auto_assisted" : "devtools_not_connected_page_network_assisted",
                severity: "warning",
                message: "DevTools Network 캡처는 연결되지 않았지만 page-context XHR/fetch 브리지가 일부 네트워크 증거를 수집했습니다. DevTools 보조 검증보다는 낮은 신뢰도로 봐야 합니다."
            });
        } else if (pageBridge.candidatePayloadCount > 0) {
            status = "PAGE_NETWORK_CANDIDATES_ONLY";
            label = state.pageNetworkBridge.autoEnabled ? "자동 보조 모드(page network 후보만 수신)" : "편의 모드(page network 후보만 수신)";
            recommendedAction = "페이지 네트워크 브리지가 후보만 제공했습니다. 후보는 final diff에서 제외되므로 DevTools를 열고 새로고침한 뒤 다시 실행하는 편이 안전합니다.";
            warnings.push({
                code: "page_network_candidates_only",
                severity: "warning",
                message: "page-context XHR/fetch 브리지가 후보 계정만 제공했고 검증된 page network payload는 없었습니다. 후보는 final diff에서 제외됩니다."
            });
        } else if (isDevtoolsBridgeFresh()) {
            status = "DEVTOOLS_CONNECTED_NO_PAYLOAD";
            label = "DevTools 연결됨, 목록 payload 미수신";
            recommendedAction = "DevTools를 연 상태에서 Instagram 탭을 새로고침하고 followers/following 목록을 다시 열어 네트워크 캡처를 보강하세요.";
            warnings.push({
                code: "devtools_connected_no_payload",
                severity: "warning",
                message: "DevTools 브리지는 연결됐지만 followers/following 네트워크 payload가 들어오지 않았습니다. DevTools를 연 뒤 새로고침하지 않았다면 일부 요청이 누락됐을 수 있습니다."
            });
        } else if (networkHookCount > 0) {
            status = "XHR_FETCH_DOM_ONLY";
            label = "편의 모드(XHR/fetch + DOM, DevTools 없음)";
            warnings.push({
                code: "devtools_not_connected",
                severity: "warning",
                message: "DevTools Network 캡처가 연결되지 않아 XHR/fetch 후크와 DOM 수집만 사용했습니다. 정확도 우선 모드가 아닙니다."
            });
        } else {
            warnings.push({
                code: "dom_preview_no_network_evidence",
                severity: "warning",
                message: "DevTools와 page network 모두 확정 payload를 제공하지 않았습니다. DOM 결과는 미리보기이며 final diff를 확정 결과처럼 보면 안 됩니다."
            });
        }

        return {
            status,
            label,
            recommendedAction,
            devtoolsConnected: isDevtoolsBridgeFresh(),
            devtoolsPayloadCount: bridge.payloadCount,
            devtoolsConfirmedPayloadCount: bridge.confirmedPayloadCount,
            devtoolsCandidatePayloadCount: bridge.candidatePayloadCount,
            devtoolsAddedCount: bridge.addedCount,
            devtoolsLastReadyAt: bridge.lastReadyAt,
            devtoolsLastPayloadAt: bridge.lastPayloadAt,
            devtoolsLastStatusAt: bridge.lastStatusAt,
            pageNetworkBridge: pageBridge,
            networkHookEvidenceCount: networkHookCount,
            sourceTotals,
            warnings
        };
    }

    function printAccuracyModeNotice(summary = {}, reason = "status") {
        const accuracyMode = getAccuracyMode(summary);
        const style = accuracyMode.status === "DEVTOOLS_ASSISTED"
            ? "color: #007a3d; font-weight: bold;"
            : "color: #cc6600; font-weight: bold;";

        console.log(`%c🧭 정확도 모드(${reason}): ${accuracyMode.label}`, style);
        console.log("ℹ️", accuracyMode.recommendedAction);
        for (const warning of accuracyMode.warnings) {
            console.log(`⚠️ [${warning.code}] ${warning.message}`);
        }
        return accuracyMode;
    }

    function addAccuracyWarningsToDiffs(diffs, summary = {}) {
        if (!diffs) return diffs;
        const warnings = getAccuracyMode(summary).warnings.map((warning) => ({
            code: warning.code,
            severity: warning.severity,
            message: warning.message,
            affectedFields: ["followersWithoutMeFollowing", "iFollowButNotReturned", "mutualCount"]
        }));

        if (warnings.length === 0) return diffs;
        return {
            ...diffs,
            reliability: diffs.reliability || "partial",
            warnings: [...(Array.isArray(diffs.warnings) ? diffs.warnings : []), ...warnings]
        };
    }

    function getPageNetworkBridgeSnapshot() {
        return {
            ...state.pageNetworkBridge,
            followers: state.collectedUsers.size,
            following: state.followingUsers.size,
            activeCollectionMode: state.activeCollectionMode
        };
    }

    function installPageNetworkBridgeListener() {
        if (window.__igFollowerPageNetworkBridgeHandler) {
            window.removeEventListener("message", window.__igFollowerPageNetworkBridgeHandler);
        }

        const handler = (event) => {
            if (event.source !== window) return;
            const message = event.data;
            if (!message || message.source !== "ig-page-network-bridge" || message.schemaVersion !== 1) return;

            if (message.type === "IG_PAGE_NETWORK_STATUS") {
                state.pageNetworkBridge.ready = true;
                if (/enabled|ready-enabled|already-enabled/.test(message.reason || "")) {
                    state.pageNetworkBridge.enabled = true;
                }
                state.pageNetworkBridge.statusCount++;
                state.pageNetworkBridge.lastStatusAt = message.capturedAt || new Date().toISOString();
                state.pageNetworkBridge.lastStatus = message.reason || "";
                state.pageNetworkBridge.lastError = message.reason && /failed|too-large/.test(message.reason) ? message.reason : null;
                if (message.reason === "rate-limited") {
                    registerRateLimitSignal("page-network");
                }

                if (message.reason !== "already-installed" && message.reason !== "ready-passive") {
                    console.log(`🧪 page network 브리지 상태: ${message.reason}`);
                }
                return;
            }

            if (message.type !== "IG_PAGE_NETWORK_USERNAMES") return;
            if (typeof message.url !== "string" || !Array.isArray(message.usernames)) {
                state.pageNetworkBridge.lastError = "invalid-page-network-payload";
                return;
            }

            const mode = message.mode === "following" || message.mode === "followers"
                ? message.mode
                : message.mode === "active" && /followers|following/.test(state.activeCollectionMode)
                    ? state.activeCollectionMode
                    : "";
            if (!/followers|following/.test(mode)) return;

            const isCandidate = message.mode === "active";
            const source = `${message.transport || "page-network"}${isCandidate ? "-candidate" : ""}`;
            const beforeConfirmed = mode === "following" ? state.followingUsers.size : state.collectedUsers.size;
            const beforeCandidates = state.candidateUsers[mode].size;

            const targetSet = mode === "following" ? state.followingUsers : state.collectedUsers;
            for (const username of message.usernames.slice(0, 2000)) {
                if (isCandidate) {
                    addCandidateUsername(username, mode, source, "active-page-network");
                } else {
                    addUsername(username, targetSet, source, mode);
                }
            }

            const afterConfirmed = mode === "following" ? state.followingUsers.size : state.collectedUsers.size;
            const afterCandidates = state.candidateUsers[mode].size;
            const added = isCandidate ? afterCandidates - beforeCandidates : afterConfirmed - beforeConfirmed;
            if (!isCandidate && added > 0) {
                demoteDomOnlyConfirmedUsers(mode, "confirmed-network-payload-arrived");
            }

            state.pageNetworkBridge.ready = true;
            state.pageNetworkBridge.payloadCount++;
            if (isCandidate) {
                state.pageNetworkBridge.candidatePayloadCount++;
            } else {
                state.pageNetworkBridge.confirmedPayloadCount++;
            }
            state.pageNetworkBridge.addedCount += Math.max(added, 0);
            state.pageNetworkBridge.lastPayloadAt = message.capturedAt || new Date().toISOString();
            state.pageNetworkBridge.lastError = null;
        };

        window.addEventListener("message", handler);
        window.__igFollowerPageNetworkBridgeHandler = handler;
        window.__igFollowerDebug = printReadableDebugSummary;
        window.__igFollowerExplainUser = explainUsername;
        window.__igFollowerHelp = printIgFollowerHelp;
        window.__igFollowerPrintFullList = printFullStoredList;
        window.__igFollowerPrintTimeline = printStoredTimeline;
        window.__igFollowerPrintWarnings = printStoredWarnings;
        window.__igFollowerEnablePageNetworkBridge = enablePageNetworkBridge;
        state.pageNetworkBridge.listenerInstalledAt = new Date().toISOString();
        console.log("🧪 page network 브리지 listener 준비됨. 기본은 passive 모드입니다.");
        console.log("ℹ️ DevTools 없이 page XHR/fetch 보조 수집이 필요하면 window.__igFollowerEnablePageNetworkBridge?.() 를 실행하세요.");
        window.postMessage({
            source: "ig-follower-content",
            schemaVersion: 1,
            type: "IG_PAGE_NETWORK_PING",
            capturedAt: new Date().toISOString()
        }, "*");
    }

    function requestPageNetworkBridgeEnable(reason = "manual") {
        try {
            const isAuto = reason !== "manual";
            state.pageNetworkBridge.enableRequestedAt = new Date().toISOString();
            if (isAuto) state.pageNetworkBridge.autoEnabled = true;
            window.postMessage({
                source: "ig-follower-content",
                schemaVersion: 1,
                type: "IG_PAGE_NETWORK_ENABLE",
                reason,
                capturedAt: new Date().toISOString()
            }, "*");
            if (isAuto) {
                console.log("🧪 DevTools 미연결로 page network bridge 자동 보조 활성화 요청을 보냈습니다.");
            } else {
                console.log("🧪 page network 브리지 활성화 요청을 보냈습니다. 이후 page XHR/fetch 보조 증거가 수집될 수 있습니다.");
            }
            return true;
        } catch (e) {
            console.log("⚠️ page network bridge 활성화 요청 실패:", e?.message || e);
            return false;
        }
    }

    function enablePageNetworkBridge() {
        return requestPageNetworkBridgeEnable("manual");
    }

    function demoteDomOnlyConfirmedUsers(mode, reason = "network-evidence-arrived") {
        const confirmed = mode === "following" ? state.followingUsers : state.collectedUsers;
        const bucket = state.userProvenance[mode];
        if (!confirmed || !bucket) return 0;

        let demoted = 0;
        for (const username of Array.from(confirmed)) {
            const info = bucket.get(username);
            const sources = Array.from(info?.sources || []);
            if (sources.length === 0 || sources.some((source) => !DOM_TIER_SOURCES.has(source))) continue;
            confirmed.delete(username);
            state.candidateUsers[mode].add(username);
            recordUsernameProvenance(username, mode, "dom-candidate", {
                confidence: "candidate",
                reason,
                phase: state.currentPhase
            });
            demoted++;
        }

        if (demoted > 0) {
            console.log(`🧪 ${mode} 네트워크 확정 증거 도착 후 DOM-only 확정 ${demoted}명을 후보로 재분류했습니다.`);
            recordRunEvent("dom_confirmed_demoted_after_network", { mode, demoted, reason });
        }
        return demoted;
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

    function addUsername(username, targetSet, source = "unknown", mode = null, detail = {}) {
        if (typeof username !== "string") return false;
        const trimmed = username.trim();
        if (!USERNAME_RE.test(trimmed)) return false;
        const normalized = trimmed.toLowerCase();

        const setToUse = targetSet || state.collectedUsers;
        const collectionMode = mode || getCollectionModeForSet(setToUse);
        recordUsernameProvenance(normalized, collectionMode, source, {
            confidence: "confirmed",
            reason: detail.reason || "confirmed-source",
            phase: detail.phase,
            scrollTick: detail.scrollTick,
            visibleIndex: detail.visibleIndex,
            payloadUsernameCount: detail.payloadUsernameCount,
            requestSeq: detail.requestSeq,
            safeUrlLabel: detail.safeUrlLabel,
            forceEvidence: detail.forceEvidence
        });
        state.candidateUsers[collectionMode]?.delete(normalized);

        const before = setToUse.size;
        setToUse.add(normalized);
        return setToUse.size > before;
    }

    function collectFromPayload(payload, seen = new WeakSet(), depth = 0, targetSet = state.collectedUsers, mode = null, source = "network", confidence = "confirmed", insideListContainer = false) {
        if (!payload || typeof payload !== "object" || seen.has(payload) || depth > 12) return 0;
        seen.add(payload);
        let added = 0;
        if (Array.isArray(payload)) {
            for (const item of payload) added += collectFromPayload(item, seen, depth + 1, targetSet, mode, source, confidence, insideListContainer);
            return added;
        }
        const targetMode = mode || getCollectionModeForSet(targetSet);
        if (insideListContainer && Object.prototype.hasOwnProperty.call(payload, "username")) {
            if (confidence === "candidate") {
                if (addCandidateUsername(payload.username, targetMode, source, "ambiguous-network-username")) added++;
            } else if (addUsername(payload.username, targetSet, source, targetMode)) {
                added++;
            }
        }
        for (const field of ["users", "items", "edges", "nodes", "data"]) {
            if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
            const value = payload[field];
            if (field === "edges" && Array.isArray(value)) {
                for (const edge of value) if (edge?.node) added += collectFromPayload(edge.node, seen, depth + 1, targetSet, mode, source, confidence, true);
                continue;
            }
            const childInsideListContainer = insideListContainer || field !== "data";
            if (Array.isArray(value)) {
                for (const item of value) added += collectFromPayload(item, seen, depth + 1, targetSet, mode, source, confidence, childInsideListContainer);
            } else if (value && typeof value === "object") {
                added += collectFromPayload(value, seen, depth + 1, targetSet, mode, source, confidence, childInsideListContainer);
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

    function looksLikeJsonUserPayload(text) {
        if (!text || typeof text !== "string") return false;
        const trimmed = text.trim();
        if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
        return /"username"|"users"|"items"|"edges"|"nodes"|"data"/.test(trimmed);
    }

    function ingestApiResponse(payloadText, source = "network", targetSetMode = "followers", options = {}) {
        if (!payloadText) return 0;
        if (typeof payloadText === "string") {
            if (payloadText.length > MAX_BODY_CHARS) return 0;
            if (!looksLikeJsonUserPayload(payloadText)) return 0;
        }
        const targetSet = targetSetMode === "following" ? state.followingUsers : state.collectedUsers;
        const confidence = options.confidence || "confirmed";
        try {
            const parsed = typeof payloadText === "string" ? JSON.parse(payloadText) : payloadText;
            const added = collectFromPayload(parsed, new WeakSet(), 0, targetSet, targetSetMode, source, confidence);
            if (added > 0) {
                const modeLabel = targetSetMode === "following" ? "Following" : "Followers";
                if (confidence === "candidate") console.log(`%c🧪 [${source}] ${modeLabel} 검증 필요 후보 +${added} / 후보 총 ${state.candidateUsers[targetSetMode].size}`, "color: #cc8800; font-weight: bold;");
                else console.log(`%c📡 [${source}] ${modeLabel} +${added} / 총 ${targetSet.size}`, "color: #0099ff; font-weight: bold;");
            }
            return added;
        } catch (e) { return 0; }
    }

    function hookNetwork() {
        if (window.__igFollowerHooksInstalled) return;
        window.__igFollowerHooksInstalled = true;
        const oldSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function() {
            this.addEventListener("load", () => {
                const url = this.responseURL || "";
                if (this.status === 429 && FOLLOWERS_URL_RE.test(url) && !IGNORED_URL_RE.test(url)) {
                    registerRateLimitSignal("page-hook");
                    return;
                }
                if (this.status !== 200) return;
                if (!FOLLOWERS_URL_RE.test(url) || IGNORED_URL_RE.test(url)) return;
                const detectedMode = detectCollectionMode(url);
                const mode = detectedMode || state.activeCollectionMode || "followers";
                if (!/followers|following/.test(mode)) return;
                const responseText = this.responseText;
                if (typeof responseText !== "string" || responseText.length > MAX_BODY_CHARS || !looksLikeJsonUserPayload(responseText)) return;
                window.__igFollowerIngestApiResponse?.(responseText, detectedMode ? "XHR" : "XHR-candidate", mode, { confidence: detectedMode ? "confirmed" : "candidate" });
            }, { once: true });
            return oldSend.apply(this, arguments);
        };
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const req = args[0];
            const url = typeof req === "string" ? req : req?.url || "";
            const res = await originalFetch.apply(window, args);
            if (res.ok && FOLLOWERS_URL_RE.test(url) && !IGNORED_URL_RE.test(url)) {
                const detectedMode = detectCollectionMode(url);
                const mode = detectedMode || state.activeCollectionMode || "followers";
                if (/followers|following/.test(mode)) {
                    res.clone().text().then((bodyText) => {
                        if (bodyText.length > MAX_BODY_CHARS || !looksLikeJsonUserPayload(bodyText)) return;
                        window.__igFollowerIngestApiResponse?.(bodyText, detectedMode ? "fetch" : "fetch-candidate", mode, { confidence: detectedMode ? "confirmed" : "candidate" });
                    }).catch(() => {});
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
            activeCollectionMode: state.activeCollectionMode,
            fresh: isDevtoolsBridgeFresh()
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

            if (message.type === "IG_DEVTOOLS_DISCONNECTED") {
                state.devtoolsBridge.ready = false;
                state.devtoolsBridge.lastError = "devtools-port-disconnected";
                console.log("🔌 DevTools 브리지 연결이 해제되었습니다. 이후 결과는 DevTools 보조 없이 판정됩니다.");
                sendResponse?.({ ok: true });
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
                if (message.reason === "navigated") {
                    recordRunEvent("devtools_capture_navigated", { at: message.capturedAt || null });
                    console.log("🧭 DevTools 캡처 컨텍스트가 페이지 이동으로 초기화되었습니다. 수집 중이었다면 followers/following 목록을 다시 열어 주세요.");
                }
                if (message.reason === "rate-limited") {
                    registerRateLimitSignal("devtools");
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
            if (isAmbiguousNetwork) {
                state.devtoolsBridge.candidatePayloadCount++;
            } else {
                state.devtoolsBridge.confirmedPayloadCount++;
            }
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
        window.__igFollowerDebug = printReadableDebugSummary;
        window.__igFollowerExplainUser = explainUsername;

        state.devtoolsBridge.listenerInstalledAt = new Date().toISOString();
        console.log("🧪 DevTools 브리지 listener 준비됨. 상태 확인: window.__igFollowerPrintDevToolsStatus?.()");
        notifyContentBridgeReady();
    }

    function notifyContentBridgeReady() {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({
                    type: "IG_CONTENT_BRIDGE_READY",
                    source: "instagram-collector",
                    schemaVersion: 1,
                    capturedAt: new Date().toISOString()
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        state.devtoolsBridge.lastError = chrome.runtime.lastError.message || "content-bridge-ready-failed";
                        resolve({ ok: false, error: state.devtoolsBridge.lastError });
                        return;
                    }
                    if (response?.devtoolsConnected) {
                        console.log("🔌 background에 기존 DevTools 연결 상태가 있어 브리지 동기화를 요청했습니다.");
                    }
                    resolve({ ok: true, response });
                });
            } catch (e) {
                state.devtoolsBridge.lastError = e?.message || "content-bridge-ready-exception";
                resolve({ ok: false, error: state.devtoolsBridge.lastError });
            }
        });
    }

    async function runAccuracyPreflight(summary = {}) {
        const startedAt = new Date().toISOString();
        recordRunEvent("accuracy_preflight_start", { graceMs: DEVTOOLS_PREFLIGHT_GRACE_MS });

        const syncResponse = await notifyContentBridgeReady();
        await wait(DEVTOOLS_PREFLIGHT_GRACE_MS, 200);

        let autoEnabled = false;
        if (!isDevtoolsBridgeFresh() && PAGE_NETWORK_AUTO_ASSIST_ENABLED) {
            requestPageNetworkBridgeEnable("auto-assist-devtools-not-ready");
            autoEnabled = true;
            await wait(500, 200);
        }

        const result = {
            startedAt,
            finishedAt: new Date().toISOString(),
            graceMs: DEVTOOLS_PREFLIGHT_GRACE_MS,
            devtoolsReady: isDevtoolsBridgeFresh(),
            pageNetworkReady: Boolean(state.pageNetworkBridge.ready),
            pageNetworkEnabled: Boolean(state.pageNetworkBridge.enabled),
            pageNetworkAutoEnabled: Boolean(autoEnabled || state.pageNetworkBridge.autoEnabled),
            syncResponseOk: Boolean(syncResponse?.ok),
            reason: state.devtoolsBridge.ready ? "devtools-ready" : "devtools-not-ready-auto-assist"
        };

        state.accuracyPreflight = result;
        summary.accuracyPreflight = result;
        recordRunEvent("accuracy_preflight_end", result);

        if (result.devtoolsReady) {
            console.log("🔌 정확도 preflight: DevTools bridge 연결 확인");
        } else if (result.pageNetworkAutoEnabled) {
            console.log("🧪 정확도 preflight: DevTools bridge 미연결 → page network bridge 자동 보조 활성화");
        } else {
            console.log("⚠️ 정확도 preflight: DevTools bridge 미연결. page network 자동 보조는 오류 방지를 위해 기본 비활성입니다. 필요하면 window.__igFollowerEnablePageNetworkBridge?.() 를 수동 실행하세요.");
        }

        return result;
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

    function scoreScrollBoxCandidate(el, index, options = {}) {
        const style = getComputedStyle(el);
        const overflow = `${style.overflow} ${style.overflowY}`;
        const isScrollable = /(auto|scroll)/.test(overflow);
        const isVisible = isElementVisible(el);
        const hasRoom = el.scrollHeight > el.clientHeight + 24;
        const profileLinks = getProfileLinksIn(el);
        const followButtons = getFollowButtonsIn(el);
        const probe = options.skipProbe ? { canMove: false } : probeScrollMovement(el);
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
        return { el, index, score, isScrollable, isVisible, hasRoom, canMove: probe.canMove, scrollTop: Math.round(el.scrollTop), scrollHeight: Math.round(el.scrollHeight), clientHeight: Math.round(el.clientHeight), profileLinkCount: profileLinks.length, followButtonCount: followButtons.length, tag: el.tagName.toLowerCase(), className: String(el.className || "").slice(0, 80) };
    }

    function getLowCostScrollBoxCandidates(scope) {
        return Array.from(scope.querySelectorAll("div")).map((el, index) => ({ el, index, overflow: `${getComputedStyle(el).overflow} ${getComputedStyle(el).overflowY}`, scrollDelta: el.scrollHeight - el.clientHeight })).filter((item) => item.scrollDelta > 24 && /(auto|scroll|overlay)/i.test(item.overflow) && isElementVisible(item.el)).sort((a, b) => b.scrollDelta - a.scrollDelta).slice(0, 12);
    }

    function scoreScrollBoxCandidates(candidates) {
        const preliminary = candidates.map((item) => scoreScrollBoxCandidate(item.el, item.index, { skipProbe: true })).filter((item) => item.isVisible && item.isScrollable && item.hasRoom && item.profileLinkCount > 0).sort((a, b) => b.score - a.score);
        const probeTargets = new Set(preliminary.slice(0, 3).map((item) => item.el));
        return preliminary.map((item) => probeTargets.has(item.el) ? scoreScrollBoxCandidate(item.el, item.index) : item).sort((a, b) => b.score - a.score);
    }

    function findFollowerListBox(options = {}) {
        if (!options.forceRescan && state.cachedScrollBox?.isConnected && isElementVisible(state.cachedScrollBox) && state.cachedScrollBox.scrollHeight > state.cachedScrollBox.clientHeight) return state.cachedScrollBox;
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
        const allCandidates = [];
        for (const dialog of dialogs) allCandidates.push(...scoreScrollBoxCandidates(getLowCostScrollBoxCandidates(dialog)));
        if (allCandidates.length > 0) {
            allCandidates.sort((a, b) => b.score - a.score);
            state.lastScrollBoxCandidates = allCandidates.slice(0, 5).map(({ el, ...detail }) => detail);
            state.cachedScrollBox = allCandidates[0].el;
            return allCandidates[0].el;
        }
        const fallbackCandidates = Array.from(document.querySelectorAll('div[role="dialog"] div[style*="overflow: auto"], div[style*="overflow: auto"], div[style*="overflow: hidden auto"]')).filter(isElementVisible).map((el, index) => scoreScrollBoxCandidate(el, index)).filter((item) => item.hasRoom || item.profileLinkCount > 0).sort((a, b) => b.score - a.score);
        state.lastScrollBoxCandidates = fallbackCandidates.slice(0, 5).map(({ el, ...detail }) => detail);
        if (fallbackCandidates[0]?.el) state.cachedScrollBox = fallbackCandidates[0].el;
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
        const config = KIND_CONFIG[kind] || KIND_CONFIG.followers;
        const keywordSet = KIND_ALT_TEXTS[kind] || [];
        const direct = getDirectFollowersButtons(kind);
        if (direct.length > 0) return direct.map((item) => item.el);

        const nodes = Array.from(document.querySelectorAll("a,button,[role='button'],[role='link'],span,div"));
        const scored = [];
        const seen = new Set();

        for (const n of nodes) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.getAttribute("disabled")) continue;

            const rawHref = normalizePath(n.getAttribute("href") || n.getAttribute("data-href") || "");
            const rawLabel = normalizeText(n.getAttribute("aria-label") || n.textContent || "");
            const cheapMatch = rawHref.includes(config.path) ||
                config.textRe.test(rawLabel) ||
                keywordSet.some((keyword) => rawLabel.includes(normalizeText(keyword)));
            if (!cheapMatch) continue;

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
            if (isRunSuperseded()) return false;
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
            if (isRunSuperseded()) {
                return { ok: false, ticks: tick - 1, snapshot: lastSnapshot, reason: "run_superseded" };
            }

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

    function collectFromDOM(scrollBox, targetSet, options = {}) {
        const anchors = Array.isArray(options.profileLinks) ? options.profileLinks : getProfileLinksIn(scrollBox);
        const target = targetSet || state.collectedUsers;
        const mode = getCollectionModeForSet(target);
        const networkConfirmedForMode = hasConfirmedNetworkEvidence(mode);
        let added = 0;

        for (const [visibleIndex, a] of anchors.entries()) {
            const username = extractProfileUsername(a.getAttribute("href") || "");
            if (!username) continue;
            const normalized = username.trim().toLowerCase();

            if (networkConfirmedForMode && !target.has(normalized)) {
                addCandidateUsername(normalized, mode, "dom-candidate", "dom-visible-profile-link-after-network-confirmed");
                continue;
            }

            if (addUsername(normalized, target, "dom", mode, {
                reason: "dom-visible-profile-link",
                phase: options.phase || state.activeCollectionMode,
                scrollTick: options.scrollTick || null,
                visibleIndex,
                forceEvidence: options.forceEvidence
            })) {
                added++;
            }
        }

        return added;
    }

    function createRowObserver(scrollBox) {
        const queue = new Set();
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    const anchors = node.matches?.("a[href]")
                        ? [node]
                        : Array.from(node.querySelectorAll?.("a[href]") || []);
                    for (const anchor of anchors) {
                        const username = extractProfileUsername(anchor.getAttribute("href") || "");
                        if (username && queue.size < 5000) queue.add(username);
                    }
                }
            }
        });
        observer.observe(scrollBox, { childList: true, subtree: true });
        return { observer, queue };
    }

    function drainObserverQueue(queue, targetSet, mode) {
        if (!queue || queue.size === 0) return 0;
        const networkConfirmedForMode = hasConfirmedNetworkEvidence(mode);
        let added = 0;

        for (const username of queue) {
            if (networkConfirmedForMode && !targetSet.has(username)) {
                addCandidateUsername(username, mode, "dom-observer-candidate", "observer-row-after-network-confirmed");
                continue;
            }
            if (addUsername(username, targetSet, "dom-observer", mode, {
                reason: "observer-added-row",
                phase: `${mode}-observer`
            })) {
                added++;
            }
        }
        queue.clear();
        return added;
    }

    function createEndSentinel(scrollBox, endSignal) {
        if (typeof IntersectionObserver !== "function") {
            return {
                observe() {},
                unobserve() {},
                disconnect() {}
            };
        }
        return new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    endSignal.visible = true;
                    endSignal.atMs = Date.now();
                }
            }
        }, { root: scrollBox, threshold: 0.6 });
    }

    function getDOMUsernames(scrollBox, profileLinks = null) {
        const anchors = Array.isArray(profileLinks) ? profileLinks : getProfileLinksIn(scrollBox);
        return anchors
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
        const seenVisible = new Set();
        const duplicateVisible = new Set();
        for (const username of visibleUsernames) {
            if (seenVisible.has(username)) {
                duplicateVisible.add(username);
            } else {
                seenVisible.add(username);
            }
        }
        const duplicateUsernames = Array.from(duplicateVisible).slice(0, 20);
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
            if (isRunSuperseded()) return false;
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

    function recordScrollDiagnostic(scrollBox, modeLabel, currentCount, beforeDom, stableTicks, options = {}) {
        const domUsernames = getDOMUsernames(scrollBox, options.profileLinks || null);
        const diagnostic = {
            mode: modeLabel,
            tick: state.scrollDiagnostics.length + 1,
            at: new Date().toISOString(),
            count: currentCount,
            domAdded: beforeDom,
            observerAdded: options.observerAdded || 0,
            domVisibleUserCount: domUsernames.length,
            lastVisibleUsers: domUsernames.slice(-5),
            scrollTop: Math.round(scrollBox.scrollTop),
            scrollHeight: Math.round(scrollBox.scrollHeight),
            clientHeight: Math.round(scrollBox.clientHeight),
            stableTicks,
            scrollStrategy: options.scrollStrategy || "pending",
            candidate: state.lastScrollBoxCandidates[0] || null
        };

        state.scrollDiagnostics.push(diagnostic);
        if (state.scrollDiagnostics.length > 60) {
            state.scrollDiagnostics.shift();
        }

        if (shouldLogDetailedProgress(diagnostic, beforeDom, stableTicks)) {
            console.log(
                `🧭 ${modeLabel} 스크롤 진단: top=${diagnostic.scrollTop}, height=${diagnostic.scrollHeight}, client=${diagnostic.clientHeight}, visibleUsers=${diagnostic.domVisibleUserCount}, stable=${stableTicks}, observer 추가: ${diagnostic.observerAdded}, last=${diagnostic.lastVisibleUsers.join(", ")}`
            );
        }

        return diagnostic;
    }

    async function performListScroll(scrollBox, options = {}) {
        const profileLinks = Array.isArray(options.profileLinks) ? options.profileLinks : getProfileLinksIn(scrollBox);
        const stableTicks = Number(options.stableTicks || 0);
        const forceRecovery = options.forceRecovery === true;
        const useStrongScroll = forceRecovery || stableTicks >= 2;
        const useFullRecoveryScroll = forceRecovery || stableTicks >= 4;

        if (useStrongScroll && scrollBox instanceof HTMLElement) {
            if (!scrollBox.hasAttribute("tabindex")) {
                scrollBox.setAttribute("tabindex", "-1");
            }
            try {
                scrollBox.focus({ preventScroll: true });
            } catch {
                scrollBox.focus();
            }
        }

        const lastProfileLink = profileLinks.slice(-1)[0];

        if (useStrongScroll) {
            scrollBox.dispatchEvent(new WheelEvent("wheel", {
                view: window,
                bubbles: true,
                cancelable: true,
                deltaY: Math.max(700, scrollBox.clientHeight * 0.9),
                deltaMode: 0
            }));
        }

        if (useStrongScroll && lastProfileLink) {
            lastProfileLink.scrollIntoView({ behavior: "auto", block: "end" });
        }

        scrollBox.scrollTop = Math.min(
            scrollBox.scrollHeight,
            scrollBox.scrollTop + Math.max(520, scrollBox.clientHeight * 0.85)
        );

        await wait(useStrongScroll ? 260 : 180, 120);

        if (useFullRecoveryScroll) {
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

        if (useFullRecoveryScroll) return "full-recovery";
        if (useStrongScroll) return "strong";
        return "light";
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

        const recoveryLinks = getProfileLinksIn(activeScrollBox);
        const domBefore = collectFromDOM(activeScrollBox, targetSet, {
            profileLinks: recoveryLinks,
            phase: `${modeLabel}-recovery`,
            forceEvidence: true
        });
        await performListScroll(activeScrollBox, { profileLinks: recoveryLinks, forceRecovery: true });
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
        const startedAt = Date.now();
        let pausedTotalMs = 0;
        if (targetCount <= 0 || targetSet.size >= targetCount) {
            return { ok: true, passes: 0, finalCount: targetSet.size, reason: "already_complete" };
        }

        for (let pass = 1; pass <= maxPasses; pass++) {
            const scrollBox = findFollowerListBox();
            if (hasProfileChanged()) {
                console.log(`🛑 ${baseLog} 재검증 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
                state.lastScrollEndReason = "profile_changed";
                return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "profile_changed" };
            }
            if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
                console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
                state.lastScrollEndReason = "rate_limited";
                return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "rate_limited" };
            }
            while (Date.now() < state.rateLimit.pausedUntilMs) {
                const remainMs = state.rateLimit.pausedUntilMs - Date.now();
                console.log(`🚦 요청 제한 대기 중: 약 ${Math.ceil(remainMs / 1000)}초 후 재개합니다.`);
                const chunk = Math.min(remainMs, 5000);
                pausedTotalMs += chunk;
                await wait(chunk, 0);
                if (hasProfileChanged()) {
                    console.log(`🛑 ${baseLog} 재검증 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
                    state.lastScrollEndReason = "profile_changed";
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "profile_changed" };
                }
                if (isRunSuperseded()) {
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "run_superseded" };
                }
                if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
                    console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
                    state.lastScrollEndReason = "rate_limited";
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "rate_limited" };
                }
            }
            if (isRunSuperseded() || Date.now() - startedAt - pausedTotalMs > MAX_COLLECTION_MS) {
                return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: isRunSuperseded() ? "run_superseded" : "time_cap_reached" };
            }
            if (!isUsableScrollBox(scrollBox)) {
                return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "no_scroll_box" };
            }

            console.log(`🔁 ${baseLog} 누락 재검증 ${pass}/${maxPasses}: ${targetSet.size}/${targetCount}명`);

            const maxTop = Math.max(0, scrollBox.scrollHeight - scrollBox.clientHeight);
            const checkpoints = [0, 0.25, 0.5, 0.75, 1];

            for (const point of checkpoints) {
                if (hasProfileChanged()) {
                    console.log(`🛑 ${baseLog} 재검증 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
                    state.lastScrollEndReason = "profile_changed";
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "profile_changed" };
                }
                if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
                    console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
                    state.lastScrollEndReason = "rate_limited";
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "rate_limited" };
                }
                while (Date.now() < state.rateLimit.pausedUntilMs) {
                    const remainMs = state.rateLimit.pausedUntilMs - Date.now();
                    console.log(`🚦 요청 제한 대기 중: 약 ${Math.ceil(remainMs / 1000)}초 후 재개합니다.`);
                    const chunk = Math.min(remainMs, 5000);
                    pausedTotalMs += chunk;
                    await wait(chunk, 0);
                    if (hasProfileChanged()) {
                        console.log(`🛑 ${baseLog} 재검증 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
                        state.lastScrollEndReason = "profile_changed";
                        return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "profile_changed" };
                    }
                    if (isRunSuperseded()) {
                        return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "run_superseded" };
                    }
                    if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
                        console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
                        state.lastScrollEndReason = "rate_limited";
                        return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "rate_limited" };
                    }
                }
                if (isRunSuperseded() || Date.now() - startedAt - pausedTotalMs > MAX_COLLECTION_MS) {
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: isRunSuperseded() ? "run_superseded" : "time_cap_reached" };
                }
                if (!isUsableScrollBox(scrollBox)) {
                    return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "scroll_box_detached" };
                }
                scrollBox.scrollTop = Math.floor(maxTop * point);
                await wait(520, 180);

                const addedBeforeScroll = collectFromDOM(scrollBox, targetSet);
                console.log(`🔎 ${baseLog} 재검증 지점 ${Math.round(point * 100)}%: ${targetSet.size}/${targetCount}명 (DOM 추가 ${addedBeforeScroll})`);
                if (targetSet.size >= targetCount) {
                    return { ok: true, passes: pass, finalCount: targetSet.size, reason: "target_reached_checkpoint" };
                }

                await performListScroll(scrollBox, { forceRecovery: true });
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

    async function scrollUntilEnd(targetCount = 0, targetSet = state.collectedUsers, modeLabel = "followers", options = {}) {
        const startedAt = Date.now();
        let scrollBox = findFollowerListBox();
        if (!isUsableScrollBox(scrollBox)) {
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
        let pausedTotalMs = 0;
        const baseLog = modeLabel === "following" ? "팔로잉" : "팔로워";

        if (options.reset) targetSet.clear();

        console.log(`🚀 ${baseLog} 수집 시작: 목표 ${targetDisplay}명`);
        console.log("🧭 선택된 스크롤 후보:", state.lastScrollBoxCandidates[0] || "(진단 없음)");
        recordRunEvent("scroll_start", {
            mode: modeLabel,
            targetCount: limitLabel,
            initialCount: targetSet.size
        });

        let rowObserver = createRowObserver(scrollBox);
        const endSignal = { visible: false, atMs: 0 };
        let endSentinel = createEndSentinel(scrollBox, endSignal);
        let observedLastAnchor = null;

        try {
        while (true) {
            if (isRunSuperseded()) {
                console.log(`🛑 ${baseLog} 수집이 새 실행으로 교체되어 현재 루프를 종료합니다.`);
                state.lastScrollEndReason = "run_superseded";
                break;
            }
            if (hasProfileChanged()) {
                console.log(`🛑 ${baseLog} 수집 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
                state.lastScrollEndReason = "profile_changed";
                break;
            }
            if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
                console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
                state.lastScrollEndReason = "rate_limited";
                break;
            }
            if (Date.now() < state.rateLimit.pausedUntilMs) {
                const remainMs = state.rateLimit.pausedUntilMs - Date.now();
                console.log(`🚦 요청 제한 대기 중: 약 ${Math.ceil(remainMs / 1000)}초 후 재개합니다.`);
                const chunk = Math.min(remainMs, 5000);
                pausedTotalMs += chunk;
                await wait(chunk, 0);
                continue;
            }
            if (Date.now() - startedAt - pausedTotalMs > MAX_COLLECTION_MS) {
                console.log(`⏱️ ${baseLog} 수집 시간이 길어져 안전 상한에서 partial 종료합니다.`);
                state.lastScrollEndReason = "time_cap_reached";
                break;
            }
            if (!isUsableScrollBox(scrollBox)) {
                console.log(`🧭 ${baseLog} 스크롤 박스가 사라져 현재 보유 결과 기준으로 종료합니다.`);
                state.lastScrollEndReason = "scroll_box_detached";
                break;
            }

            const profileLinks = getProfileLinksIn(scrollBox);
            const lastProfileLink = profileLinks.slice(-1)[0] || null;
            if (lastProfileLink !== observedLastAnchor) {
                if (observedLastAnchor) endSentinel.unobserve(observedLastAnchor);
                if (lastProfileLink) endSentinel.observe(lastProfileLink);
                observedLastAnchor = lastProfileLink;
            }

            const beforeDom = collectFromDOM(scrollBox, targetSet, {
                profileLinks,
                phase: `${modeLabel}-scroll`,
                scrollTick: state.scrollDiagnostics.length + 1
            });
            const observerAdded = drainObserverQueue(rowObserver.queue, targetSet, modeLabel);
            const currentCount = targetSet.size;
            let diagnostic = recordScrollDiagnostic(scrollBox, modeLabel, currentCount, beforeDom, stableTicks, {
                profileLinks,
                observerAdded
            });

            if (shouldLogDetailedProgress(diagnostic, beforeDom, stableTicks)) {
                console.log(
                    `⏳ 현재 ${baseLog} ${currentCount}명 / 목표 ${targetDisplay}명 (DOM 추가: ${beforeDom}, observer 추가: ${observerAdded}, 네트워크 실시간 반영)`
                );
            }

            if (limitLabel > 0 && currentCount >= limitLabel) {
                console.log(`✅ ${baseLog} 목표 달성: ${currentCount}명`);
                state.lastScrollEndReason = "target_reached";
                break;
            }

            if (scrollBox.scrollHeight <= scrollBox.clientHeight + 1) {
                console.log("📌 스크롤 가능한 여유가 없어요. 이미 끝이거나 구조 변경 가능성이 있습니다.");
            }

            const scrollStrategy = await performListScroll(scrollBox, {
                profileLinks,
                stableTicks
            });
            diagnostic.scrollStrategy = scrollStrategy;
            const waitBase = beforeDom > 0 || observerAdded > 0 || currentCount !== lastCount
                ? 650
                : stableTicks >= 2
                    ? 1400
                    : 950;
            await wait(waitBase, 300);

            if (currentCount === lastCount && beforeDom === 0 && observerAdded === 0) {
                stableTicks++;
            } else {
                stableTicks = 0;
                lastCount = currentCount;
            }

            if (stableTicks > 0 && stableTicks % 2 === 0) {
                scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - 420);
                await wait(400, 200);
                await performListScroll(scrollBox, { stableTicks, forceRecovery: stableTicks >= 4 });
            }

            if (shouldAttemptScrollRecovery(currentCount, limitLabel, stableTicks, recoveryAttempts)) {
                recoveryAttempts++;
                const recovery = await attemptScrollRecovery(scrollBox, limitLabel, targetSet, modeLabel, recoveryAttempts, stableTicks);
                const previousScrollBox = scrollBox;
                scrollBox = recovery.scrollBox || scrollBox;
                if (scrollBox !== previousScrollBox) {
                    rowObserver.observer.disconnect();
                    rowObserver = createRowObserver(scrollBox);
                    endSentinel.disconnect();
                    endSignal.visible = false;
                    endSignal.atMs = 0;
                    endSentinel = createEndSentinel(scrollBox, endSignal);
                    observedLastAnchor = null;
                }
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
                const endConfirmed = endSignal.visible && Date.now() - endSignal.atMs < 8000;
                state.lastScrollEndReason = recoveryAttempts > 0
                    ? "stalled_after_recovery"
                    : endConfirmed ? "stalled_at_list_end" : "stalled";
                if (endConfirmed) console.log(`✅ ${baseLog} 마지막 행이 화면에 보이는 상태로 정체 → 목록 끝 도달 가능성이 높습니다.`);
                break;
            }

            await wait(stableTicks > 0 ? 300 : 150, 250);
        }
        } finally {
            rowObserver.observer.disconnect();
            endSentinel.disconnect();
        }

        const result = Array.from(targetSet);
        if (modeLabel === "followers" && shouldKeepScrollBox) {
            state.followersScrollBox = scrollBox;
            state.lastFollowersScrollEndReason = state.lastScrollEndReason;
            state.lastFollowersScrollDiagnostics = state.scrollDiagnostics.slice();
        }
        if (modeLabel === "following") {
            state.lastFollowingScrollEndReason = state.lastScrollEndReason;
            state.lastFollowingScrollDiagnostics = state.scrollDiagnostics.slice();
        }

        state.activeCollectionMode = previousMode;
        recordRunEvent("scroll_end", {
            mode: modeLabel,
            finalCount: result.length,
            targetCount: limitLabel,
            endReason: state.lastScrollEndReason,
            diagnosticsCount: state.scrollDiagnostics.length
        });
        console.log(`📦 ${baseLog} 최종 수집 ${result.length}명`);
        return result;
    }

    function getProfileKey() {
        const match = location.pathname.match(/^\/([a-zA-Z0-9._]+)/);
        return match ? match[1] : "unknown_profile";
    }

    function getStorageKey() {
        return `${STORAGE_PREFIX}:${state.runProfile || getProfileKey()}`;
    }

    function compareFollowSets() {
        recordRunEvent("compare_sets", {
            followersCount: state.collectedUsers.size,
            followingCount: state.followingUsers.size
        });
        const rawFollowers = new Set(Array.from(state.collectedUsers).map((u) => u.toLowerCase()));
        const rawFollowing = new Set(Array.from(state.followingUsers).map((u) => u.toLowerCase()));
        const excludedFollowers = getOvercountLowConfidenceExclusions("followers", rawFollowers, rawFollowing, state.expectedCounts.followers || 0);
        const excludedFollowing = getOvercountLowConfidenceExclusions("following", rawFollowing, rawFollowers, state.expectedCounts.following || 0);
        const followers = new Set(Array.from(rawFollowers).filter((u) => !excludedFollowers.has(u)));
        const following = new Set(Array.from(rawFollowing).filter((u) => !excludedFollowing.has(u)));

        const onlyFollowers = Array.from(followers).filter((u) => !following.has(u)).sort();
        const onlyFollowing = Array.from(following).filter((u) => !followers.has(u)).sort();
        const mutualUsers = Array.from(followers).filter((u) => following.has(u)).sort();
        const diffs = {
            basis: FINAL_DIFF_POLICY,
            followersWithoutMeFollowing: onlyFollowers,
            iFollowButNotReturned: onlyFollowing,
            mutualCount: mutualUsers.length,
            mutualSample: mutualUsers.slice(0, 20),
            excludedFromCompare: {
                followersOvercountLowConfidence: Array.from(excludedFollowers).sort(),
                followingOvercountLowConfidence: Array.from(excludedFollowing).sort()
            },
            rawCounts: {
                followers: rawFollowers.size,
                following: rawFollowing.size
            },
            compareCounts: {
                followers: followers.size,
                following: following.size
            }
        };

        diffs.integrity = getCompareIntegrity(diffs, followers.size, following.size);
        diffs.calculationStatus = diffs.integrity.ok ? "passed" : "failed_integrity_check";
        return diffs;
    }

    function getOvercountLowConfidenceExclusions(mode, sourceSet, oppositeSet, expectedCount, bucket = state.userProvenance[mode]) {
        const overcount = expectedCount > 0 ? sourceSet.size - expectedCount : 0;
        if (overcount <= 0) return new Set();

        const candidates = Array.from(sourceSet)
            .filter((username) => {
                const info = bucket?.get(username);
                if (!info) return false;
                const sources = Array.from(info.sources || []);
                return sources.length > 0 && sources.every((source) => DOM_TIER_SOURCES.has(source));
            })
            .sort((a, b) => {
                const aCreatesDiff = oppositeSet.has(a) ? 1 : 0;
                const bCreatesDiff = oppositeSet.has(b) ? 1 : 0;
                if (aCreatesDiff !== bCreatesDiff) return aCreatesDiff - bCreatesDiff;
                const evidence = compareCandidateEvidence(bucket?.get(b), bucket?.get(a));
                if (evidence !== 0) return evidence;
                return a.localeCompare(b);
            });

        return new Set(candidates.slice(0, overcount));
    }

    function getCompareIntegrity(diffs, followersCount, followingCount) {
        const checks = [
            {
                code: "mutual_not_over_followers",
                ok: diffs.mutualCount <= followersCount,
                expected: `<= ${followersCount}`,
                actual: diffs.mutualCount
            },
            {
                code: "mutual_not_over_following",
                ok: diffs.mutualCount <= followingCount,
                expected: `<= ${followingCount}`,
                actual: diffs.mutualCount
            },
            {
                code: "followers_partition",
                ok: diffs.followersWithoutMeFollowing.length + diffs.mutualCount === followersCount,
                expected: followersCount,
                actual: diffs.followersWithoutMeFollowing.length + diffs.mutualCount
            },
            {
                code: "following_partition",
                ok: diffs.iFollowButNotReturned.length + diffs.mutualCount === followingCount,
                expected: followingCount,
                actual: diffs.iFollowButNotReturned.length + diffs.mutualCount
            }
        ];

        return {
            ok: checks.every((check) => check.ok),
            followersCount,
            followingCount,
            checks
        };
    }

    function printAccountList(title, users, mode = null, options = {}) {
        console.log(`📌 ${title}: ${users.length}명`);
        if (users.length === 0) {
            console.log("   없음");
            return;
        }

        const limit = Number.isFinite(options.limit)
            ? options.limit
            : isVerboseLogging()
                ? users.length
                : DEFAULT_PRINT_LIST_LIMIT;
        const visibleUsers = users.slice(0, Math.max(0, limit));

        visibleUsers.forEach((username, index) => {
            const provenance = mode ? ` [${getUsernameProvenance(username, mode)}]` : "";
            console.log(`   ${index + 1}. ${username}${provenance}`);
        });

        if (users.length > visibleUsers.length) {
            console.log(`   ... 나머지 ${users.length - visibleUsers.length}명은 window.__igFollowerResult 또는 window.__igFollowerVerbose=true 후 다시 확인하세요.`);
        }
    }

    function printFullStoredList(name = "diffs") {
        const result = window.__igFollowerResult;
        if (!result) {
            console.log("⚠️ 아직 저장된 결과가 없습니다. 먼저 수집을 실행하세요.");
            return null;
        }

        if (name === "followers") {
            printAccountList("전체 팔로워", result.followers || [], "followers", { limit: Number.MAX_SAFE_INTEGER });
            return result.followers || [];
        }
        if (name === "following") {
            printAccountList("전체 팔로잉", result.following || [], "following", { limit: Number.MAX_SAFE_INTEGER });
            return result.following || [];
        }
        if (name === "followersWithoutMeFollowing") {
            printAccountList("나를 팔로우하지만 내가 팔로우하지 않는 계정", result.diffs?.followersWithoutMeFollowing || [], "followers", { limit: Number.MAX_SAFE_INTEGER });
            return result.diffs?.followersWithoutMeFollowing || [];
        }
        if (name === "iFollowButNotReturned") {
            printAccountList("내가 팔로우하지만 나를 팔로우하지 않는 계정", result.diffs?.iFollowButNotReturned || [], "following", { limit: Number.MAX_SAFE_INTEGER });
            return result.diffs?.iFollowButNotReturned || [];
        }

        printFollowDiffs(result.diffs || {});
        return result.diffs || null;
    }

    function printStoredTimeline() {
        const timeline = window.__igFollowerDebugReport?.timeline || window.__igFollowerResult?.debugReport?.timeline || [];
        if (!timeline.length) {
            console.log("⚠️ 저장된 실행 타임라인이 없습니다. 먼저 수집을 실행하세요.");
            return [];
        }

        console.log("========== 실행 타임라인 ==========");
        timeline.forEach((event, index) => {
            console.log(`${index + 1}. ${event.at} ${event.type}`, event.detail || {});
        });
        return timeline;
    }

    function printStoredWarnings() {
        const report = window.__igFollowerDebugReport || window.__igFollowerResult?.debugReport;
        const warnings = report?.warnings || [];
        if (!warnings.length) {
            console.log("✅ 현재 저장된 경고가 없습니다.");
            return [];
        }

        console.log("========== 수집/비교 경고 ==========");
        warnings.forEach((warning, index) => console.log(`${index + 1}. ${warning}`));
        return warnings;
    }

    function getUnconfirmedCandidates(mode) {
        const confirmed = mode === "following" ? state.followingUsers : state.collectedUsers;
        return Array.from(state.candidateUsers[mode]).filter((username) => !confirmed.has(username)).sort();
    }

    function getListCompletionAssessment(mode, expectedCount) {
        const verifiedCount = mode === "following" ? state.followingUsers.size : state.collectedUsers.size;
        const endReason = mode === "following" ? state.lastFollowingScrollEndReason : state.lastFollowersScrollEndReason;
        const domTierCandidateFilter = (username) => {
            const sources = Array.from(state.userProvenance[mode]?.get(username)?.sources || []);
            return sources.length > 0 && sources.every((source) => DOM_TIER_SOURCES.has(source) || DOM_CANDIDATE_SOURCES.has(source));
        };
        const candidates = getUnconfirmedCandidates(mode);
        const nonDomCandidateCount = candidates.filter((username) => !domTierCandidateFilter(username)).length;
        return assessListCompletion({
            expectedCount: expectedCount || 0,
            verifiedCount,
            endReason,
            hasNetworkEvidence: hasConfirmedNetworkEvidence(mode),
            nonDomCandidateCount
        });
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
        console.log("⚠️ 아래 계정은 DOM 후보 또는 애매한 네트워크 후보라 final diff 계산에는 넣지 않았습니다.");
        printAccountList("팔로워 후보", followerCandidates, "followers");
        printAccountList("팔로잉 후보", followingCandidates, "following");
    }

    function getDevtoolsListStatus() {
        const bridge = getDevtoolsBridgeSnapshot();
        const followerDevtoolsUsers = getSourceCounts("followers").DevTools || 0;
        const followingDevtoolsUsers = getSourceCounts("following").DevTools || 0;
        let status = "CLOSED";
        let label = "연결 안 됨";

        if (bridge.confirmedPayloadCount > 0 && followerDevtoolsUsers > 0 && followingDevtoolsUsers > 0) {
            status = "CONFIRMED_BOTH";
            label = `followers/following payload 확인됨 (${followerDevtoolsUsers}/${followingDevtoolsUsers}명)`;
        } else if (bridge.confirmedPayloadCount > 0 && followerDevtoolsUsers > 0) {
            status = "CONFIRMED_FOLLOWERS_ONLY";
            label = `followers payload만 확인됨 (${followerDevtoolsUsers}명)`;
        } else if (bridge.confirmedPayloadCount > 0 && followingDevtoolsUsers > 0) {
            status = "CONFIRMED_FOLLOWING_ONLY";
            label = `following payload만 확인됨 (${followingDevtoolsUsers}명)`;
        } else if (bridge.candidatePayloadCount > 0) {
            status = "CONNECTED_CANDIDATE_ONLY";
            label = "후보 payload만 확인됨";
        } else if (isDevtoolsBridgeFresh()) {
            status = "CONNECTED_NO_PAYLOAD";
            label = "연결됐지만 followers/following payload 없음";
        }

        return {
            status,
            label,
            followerDevtoolsUsers,
            followingDevtoolsUsers,
            payloadCount: bridge.payloadCount || 0,
            lastPayloadAt: bridge.lastPayloadAt || null
        };
    }

    function printDecisionCard(summary) {
        const diffs = summary.diffs || {};
        const devtools = getDevtoolsListStatus();
        const pageBridge = getPageNetworkBridgeSnapshot();
        const accuracyMode = getAccuracyMode(summary);
        const compareCounts = diffs.compareCounts || {};
        const expectedFollowers = summary.expectedFollowersCount || state.expectedCounts.followers || 0;
        const expectedFollowing = summary.expectedFollowingCount || state.expectedCounts.following || 0;
        const followersMatch = !expectedFollowers || compareCounts.followers === expectedFollowers;
        const followingMatch = !expectedFollowing || compareCounts.following === expectedFollowing;
        let trustGate = "참고용 결과";
        if (diffs.integrity && !diffs.integrity.ok) {
            trustGate = "계산 무결성 확인 필요";
        } else if (accuracyMode.status === "DEVTOOLS_CONNECTED_NO_PAYLOAD" || accuracyMode.status === "DOM_PREVIEW") {
            trustGate = "DevTools 재실행 필요";
        } else if ((accuracyMode.status === "DEVTOOLS_ASSISTED" || accuracyMode.status === "PAGE_NETWORK_ASSISTED") && followersMatch && followingMatch) {
            trustGate = "확정 비교 가능";
        }

        console.log("========== Instagram 비교 결과 ==========");
        console.log("판정:", trustGate);
        console.log("정확도 모드:", accuracyMode.label);
        console.log("상태:", summary.status || "unknown");
        console.log(`팔로워: ${summary.followersCount ?? 0} / 예상 ${summary.expectedFollowersCount || "알 수 없음"}`);
        console.log(`팔로잉: ${summary.followingCount ?? 0} / 예상 ${summary.expectedFollowingCount || "알 수 없음"}`);
        console.log(`나를 팔로우하지만 내가 팔로우하지 않는 계정: ${diffs.followersWithoutMeFollowing?.length ?? 0}명`);
        console.log(`내가 팔로우하지만 나를 팔로우하지 않는 계정: ${diffs.iFollowButNotReturned?.length ?? 0}명`);
        console.log(`맞팔 수: ${diffs.mutualCount ?? 0}명`);

        if (diffs.calculationStatus) {
            console.log("계산 무결성:", diffs.calculationStatus);
        }
        if (diffs.integrity && !diffs.integrity.ok) {
            console.log("⚠️ 비교 계산 무결성 실패:", diffs.integrity.checks.filter((check) => !check.ok));
        }
        if (state.rateLimit.count > 0) {
            console.log(`🚦 요청 제한 감지 ${state.rateLimit.count}회: 일부 수집이 지연되었거나 중단되었습니다. 결과가 부족하면 몇 분 뒤 재실행하세요.`);
        }
        const excludedFollowers = diffs.excludedFromCompare?.followersOvercountLowConfidence || [];
        const excludedFollowing = diffs.excludedFromCompare?.followingOvercountLowConfidence || [];
        if (excludedFollowers.length > 0 || excludedFollowing.length > 0) {
            console.log(`⚠️ 화면 표시 수 초과로 final diff에서 제외한 DOM-only 계정: 팔로워 ${excludedFollowers.length}명 / 팔로잉 ${excludedFollowing.length}명`);
        }

        console.log("수집 근거:");
        console.log(`- DevTools: ${devtools.label}`);
        console.log(`- Page Network Bridge: ${pageBridge.ready ? (state.pageNetworkBridge.autoEnabled ? "auto-enabled" : state.pageNetworkBridge.enabled ? "활성" : "passive") : "연결 안 됨"} / 확정 ${pageBridge.confirmedPayloadCount || 0}개 / 후보 ${pageBridge.candidatePayloadCount || 0}개`);
        console.log(`- DOM Scroll: followers ${summary.followersScrollEndReason || "알 수 없음"}, following ${summary.followingScrollEndReason || "알 수 없음"}`);
        console.log("문제가 있으면:");
        console.log("__igFollowerHelp()");
        console.log('__igFollowerExplainUser("username")');
        console.log("__igFollowerDebug()");
        console.log('__igFollowerPrintFullList("following")');
    }

    function printFollowDiffs(diffs) {
        console.log("========== 맞팔 비교 요약 ==========");
        console.log("🧭 비교 기준:", diffs.basis || FINAL_DIFF_POLICY);
        console.log("ℹ️ 검증 필요 후보(candidate)는 아래 final diff 계산에서 제외했습니다.");
        if (diffs.calculationStatus) {
            console.log("🧮 계산 무결성:", diffs.calculationStatus);
        }
        if (diffs.integrity && !diffs.integrity.ok) {
            console.log("⚠️ 비교 계산 무결성 실패:", diffs.integrity.checks.filter((check) => !check.ok));
        }
        const excludedFollowers = diffs.excludedFromCompare?.followersOvercountLowConfidence || [];
        const excludedFollowing = diffs.excludedFromCompare?.followingOvercountLowConfidence || [];
        if (excludedFollowers.length > 0 || excludedFollowing.length > 0) {
            console.log("⚠️ 화면 표시 수보다 많이 수집된 DOM-only 계정은 final diff 확정 계산에서 제외했습니다.");
            if (excludedFollowers.length > 0) {
                printAccountList("팔로워 초과 제외 계정", excludedFollowers, "followers");
            }
            if (excludedFollowing.length > 0) {
                printAccountList("팔로잉 초과 제외 계정", excludedFollowing, "following");
            }
        }
        if (diffs.reliability === "partial") {
            console.log("⚠️ 결과 신뢰도: partial (수집 불완전으로 오탐 가능)");
        }
        if (Array.isArray(diffs.warnings)) {
            diffs.warnings.forEach((warning) => console.log(`⚠️ ${warning.message}`));
        }
        console.log(`📌 맞팔 수: ${diffs.mutualCount}명`);
        printAccountList("나를 팔로우하지만 내가 팔로우하지 않는 계정", diffs.followersWithoutMeFollowing, "followers");
        printAccountList("내가 팔로우하지만 나를 팔로우하지 않는 계정", diffs.iFollowButNotReturned, "following");
        printCandidateUsers();
    }

    function printSummary(summary) {
        printDecisionCard(summary);
        console.log("========== 실행 결과 ==========");
        console.log("🧭 Run ID:", summary.runId || state.runId);
        console.log("🧭 실행 모드:", summary.executionMode || EXECUTION_MODE);
        console.log("🧭 final diff 기준:", summary.finalDiffPolicy || FINAL_DIFF_POLICY);
        const accuracyMode = summary.accuracyMode || getAccuracyMode(summary);
        console.log("🧭 정확도 모드:", accuracyMode.label);
        console.log("🎯 결과 상태:", summary.status);
        console.log(`📦 팔로워 수집: ${summary.followersCount}명${summary.expectedFollowersCount ? ` / 화면 표시 ${summary.expectedFollowersCount}명` : ""}`);
        console.log(`📦 팔로잉 수집: ${summary.followingCount}명${summary.expectedFollowingCount ? ` / 화면 표시 ${summary.expectedFollowingCount}명` : ""}`);
        console.log(`👍 팔로우 클릭: ${summary.followClicks}명`);
        if (accuracyMode.warnings.length > 0) {
            accuracyMode.warnings.forEach((warning) => console.log(`⚠️ 정확도 경고: ${warning.message}`));
        }
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
        if (summary.followingScrollEndReason) {
            console.log("🧪 팔로잉 스크롤 종료 원인:", summary.followingScrollEndReason);
        }
        console.log("🧪 팔로워 열기:", summary.openedFollowers ? "성공" : "실패");
        console.log("🧪 팔로잉 열기:", summary.openedFollowing ? "성공" : "실패");
        if (summary.lastError) {
            console.log("⚠️ 마지막 실패 원인:", summary.lastError);
        }
        if (state.rateLimit.count > 0) {
            console.log(`🚦 요청 제한 감지 ${state.rateLimit.count}회: 일부 수집이 지연되었거나 중단되었습니다. 결과가 부족하면 몇 분 뒤 재실행하세요.`);
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

    function buildSessionMessagePayload(payload) {
        return {
            profile: payload.profile,
            collectedAt: payload.collectedAt,
            runId: payload.runId,
            executionMode: payload.executionMode,
            followActionEnabled: payload.followActionEnabled,
            finalDiffPolicy: payload.finalDiffPolicy,
            accuracyMode: payload.accuracyMode,
            followers: payload.followers,
            following: payload.following,
            snapshots: payload.snapshots,
            candidates: payload.candidates,
            diffs: payload.diffs,
            expectedCounts: payload.expectedCounts,
            scroll: {
                followersEndReason: payload.scroll?.followersEndReason || null,
                followersDiagnostics: (payload.scroll?.followersDiagnostics || []).slice(-5),
                followingEndReason: payload.scroll?.followingEndReason || null,
                followingDiagnostics: (payload.scroll?.followingDiagnostics || []).slice(-5)
            },
            collectionDiagnostics: payload.collectionDiagnostics,
            followClicks: payload.followClicks
        };
    }

    function persistRunSnapshotToExtensionSession(payload) {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
            console.log("ℹ️ 확장 세션 저장을 사용할 수 없어 페이지 메모리에만 저장했습니다.");
            return;
        }

        try {
            chrome.runtime.sendMessage({
                type: "IG_STORE_RUN_SNAPSHOT",
                source: "instagram-collector",
                schemaVersion: 1,
                storageKey: getStorageKey(),
                payload: buildSessionMessagePayload(payload)
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("⚠️ 확장 세션 저장 실패:", chrome.runtime.lastError.message);
                    return;
                }
                if (!response?.ok) {
                    console.log("⚠️ 확장 세션 저장 실패:", response?.error || "unknown-error");
                    return;
                }
                console.log(`📦 확장 세션 저장 완료: ${response.key} (약 ${Math.round((response.approxBytes || 0) / 1024)}KB)`);
                if (Array.isArray(response.truncatedSections) && response.truncatedSections.length > 0) {
                    console.log(`⚠️ 세션 스냅샷이 저장 한도 때문에 일부 절단되었습니다: ${response.truncatedSections.join(", ")}`);
                    console.log("ℹ️ 페이지 메모리(window.__igFollowerResult)에는 전체 데이터가 보존되어 있습니다.");
                }
            });
        } catch (e) {
            console.log("⚠️ 확장 세션 저장 중 예외:", e?.message || e);
        }
    }

    function persistFollowers(followers, diffs) {
        recordRunEvent("persist_snapshot", {
            followersCount: followers.length,
            followingCount: state.followingUsers.size,
            hasDiffs: !!diffs
        });
        const accuracyMode = getAccuracyMode({ status: diffs ? "compared" : "collected" });
        const profile = state.runProfile || getProfileKey();
        const payload = {
            profile,
            runId: state.runId,
            collectedAt: new Date().toISOString(),
            source: `instagram-profile:${profile}`,
            executionMode: EXECUTION_MODE,
            followActionEnabled: FOLLOW_ACTION_ENABLED,
            finalDiffPolicy: FINAL_DIFF_POLICY,
            accuracyMode,
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
                followersDiagnostics: state.lastFollowersScrollDiagnostics.slice(-20),
                followingEndReason: state.lastFollowingScrollEndReason,
                followingDiagnostics: state.lastFollowingScrollDiagnostics.slice(-20)
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
        persistRunSnapshotToExtensionSession(payload);

        console.log("========== 결과 저장 ==========");
        console.log("📦 메모리 저장 완료:", key);
        console.log("👤 대상 프로필:", payload.profile);
        console.log("📅 저장 시각:", payload.collectedAt);
        console.log("🧭 정확도 모드:", payload.accuracyMode.label);
        console.log(`📦 저장된 raw 팔로워/팔로잉: ${payload.followers.length}명 / ${payload.following.length}명`);
        if (payload.diffs?.compareCounts) {
            console.log(`📌 final diff 계산 기준: 팔로워 ${payload.diffs.compareCounts.followers}명 / 팔로잉 ${payload.diffs.compareCounts.following}명`);
        }
        console.log(`👍 저장된 팔로우 클릭 수: ${payload.followClicks.count}명`);
        console.log(`🔎 출처 기록: 팔로워 ${Object.keys(payload.provenance.followers).length}명 / 팔로잉 ${Object.keys(payload.provenance.following).length}명`);
        console.log(`🧪 검증 필요 후보: 팔로워 ${payload.candidates.followers.length}명 / 팔로잉 ${payload.candidates.following.length}명`);
        console.log("📌 전체 데이터 확인: window.__igFollowerResult");
        console.log("🔎 디버그 리포트 확인: window.__igFollowerDebugReport");
        printDebugReportSummary(window.__igFollowerDebugReport);

        return payload;
    }

    function finalizeIfProfileChanged(summary) {
        if (!hasProfileChanged()) return false;

        const currentProfile = getProfileKey();
        const followers = Array.from(state.collectedUsers);
        const following = Array.from(state.followingUsers);
        state.lastScrollEndReason = "profile_changed";
        summary.status = "aborted_profile_changed";
        summary.lastError = `실행 중 프로필이 ${state.runProfile}에서 ${currentProfile}(으)로 변경되어 중단했습니다.`;
        summary.followersCount = followers.length;
        summary.followingCount = following.length;
        summary.followers = followers;
        summary.following = following;
        summary.followersScrollEndReason = state.lastFollowersScrollEndReason || state.lastScrollEndReason;
        summary.followingScrollEndReason = state.lastFollowingScrollEndReason || state.lastScrollEndReason;
        summary.followersScrollDiagnostics = state.lastFollowersScrollDiagnostics.slice(-20);
        summary.followingScrollDiagnostics = state.lastFollowingScrollDiagnostics.slice(-20);
        summary.accuracyMode = getAccuracyMode(summary);
        recordRunEvent("run_aborted_profile_changed", {
            startedProfile: state.runProfile,
            currentProfile,
            followersCount: followers.length,
            followingCount: following.length
        });
        persistFollowers(followers, summary.diffs);
        printSummary(summary);
        return true;
    }

    async function followVisibleButtons(targetCount = 0) {
        const startedAt = Date.now();
        const scrollBox = state.followersScrollBox;
        if (!isUsableScrollBox(scrollBox)) {
            console.log("❌ 팔로우 처리할 스크롤 박스가 없습니다. 먼저 팔로워 수집을 먼저 실행하세요.");
            return;
        }

        console.log(`🚀 팔로우 처리 시작 (${targetCount > 0 ? `목표 ${targetCount}명` : "제한 없음"})`);

        let stable = 0;
        while (true) {
            if (isRunSuperseded()) {
                console.log("🛑 팔로우 처리가 새 실행으로 교체되어 종료합니다.");
                break;
            }
            if (Date.now() - startedAt > MAX_COLLECTION_MS) {
                console.log("⏱️ 팔로우 처리 시간이 길어져 안전 상한에서 종료합니다.");
                break;
            }
            if (!isUsableScrollBox(scrollBox)) {
                console.log("🧭 팔로우 처리 중 스크롤 박스가 사라져 종료합니다.");
                break;
            }

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
            followingScrollEndReason: null,
            followersScrollDiagnostics: [],
            followingScrollDiagnostics: [],
            followersScrollRecovery: [],
            followingScrollRecovery: [],
            followingClickedUsers: [],
            accuracyPreflight: null,
            accuracyMode: null,
            followers: [],
            following: []
        };

        try {
        state.runId = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.__igFollowerActiveRunId = state.runId;
        summary.runId = state.runId;
        state.runProfile = getProfileKey();
        state.collectedUsers.clear();
        state.followingUsers.clear();
        state.followedUsers.clear();
        state.followButtonsClicked = 0;
        state.followersScrollBox = null;
        state.cachedScrollBox = null;
        state.userProvenance.followers.clear();
        state.userProvenance.following.clear();
        state.sourceCountsCache.followers = Object.create(null);
        state.sourceCountsCache.following = Object.create(null);
        state.candidateUsers.followers.clear();
        state.candidateUsers.following.clear();
        state.scrollRecovery.followers = [];
        state.scrollRecovery.following = [];
        state.lastFollowersScrollEndReason = null;
        state.lastFollowersScrollDiagnostics = [];
        state.lastFollowingScrollEndReason = null;
        state.lastFollowingScrollDiagnostics = [];
        state.collectionDiagnostics.followers = null;
        state.collectionDiagnostics.following = null;
        state.accuracyPreflight = null;
        state.devtoolsBridge.payloadCount = 0;
        state.devtoolsBridge.confirmedPayloadCount = 0;
        state.devtoolsBridge.candidatePayloadCount = 0;
        state.devtoolsBridge.addedCount = 0;
        state.devtoolsBridge.lastPayloadAt = null;
        state.pageNetworkBridge.payloadCount = 0;
        state.pageNetworkBridge.confirmedPayloadCount = 0;
        state.pageNetworkBridge.candidatePayloadCount = 0;
        state.pageNetworkBridge.addedCount = 0;
        state.pageNetworkBridge.lastPayloadAt = null;
        state.pageNetworkBridge.autoEnabled = false;
        state.pageNetworkBridge.enableRequestedAt = null;
        state.rateLimit = {
            count: 0,
            lastDetectedAtMs: 0,
            pausedUntilMs: 0,
            lastOrigin: null
        };
        state.runTimeline = [];
        window.__igFollowerRunStartedAt = summary.startedAt;
        recordRunEvent("run_started", { runId: state.runId, startedAt: summary.startedAt });

        const isExtensionContentScript = typeof chrome !== "undefined" && Boolean(chrome.runtime?.onMessage);
        window.__igFollowerIngestApiResponse = ingestApiResponse;
        if (!isExtensionContentScript) {
            hookNetwork();
        } else {
            console.log("ℹ️ 확장 주입 모드: in-page XHR/fetch 후크는 건너뜁니다. (page-network-bridge가 해당 역할 수행)");
        }
        installExtensionMessageBridge();
        installPageNetworkBridgeListener();
        summary.accuracyPreflight = await runAccuracyPreflight(summary);
        printAccuracyModeNotice(summary, "실행 시작");

        console.log("%c1) 네트워크 감시 후크 설치 + 실행 시작", "color: #ff8c00; font-size: 1.1em;");
        recordRunEvent("open_followers_start", { mode: "followers" });
        const openedFollowers = await openPopupByType("followers");
        recordRunEvent("open_followers_end", { mode: "followers", ok: openedFollowers });
        summary.openedFollowers = openedFollowers;
        summary.expectedFollowersCount = state.expectedCounts.followers;
        if (finalizeIfProfileChanged(summary)) return;
        if (!openedFollowers) {
            summary.status = "failed_open_followers";
            summary.lastError = "팔로워 버튼 클릭/대화창 오픈 실패";
            printSummary(summary);
            return;
        }

        console.log("2) 팔로워 목록 로딩 대기...");
        recordRunEvent("followers_settle_start", { mode: "followers" });
        summary.followersSettled = await waitForListSettled("followers");
        recordRunEvent("followers_settle_end", { mode: "followers", result: summary.followersSettled });
        if (finalizeIfProfileChanged(summary)) return;
        await wait(700, 300);
        if (finalizeIfProfileChanged(summary)) return;
        console.log("3) 팔로워 이중 수집 시작...");
        const followersTarget = state.expectedCounts.followers || 0;
        console.log(`🎯 팔로워 목표 기준: 화면 표시 ${state.expectedCounts.followers || "없음"}명, 실제 목표 ${followersTarget > 0 ? `${followersTarget}명` : "전체(정체 시 종료)"}`);
        let followers = await scrollUntilEnd(followersTarget, state.collectedUsers, "followers", { saveScrollBoxForFollow: true });
        if (followersTarget > 0 && followers.length < followersTarget) {
            summary.followersReverify = await reverifyCurrentListCollection(followersTarget, state.collectedUsers, "followers");
            promoteDomCandidatesToConfirmed("followers", state.collectedUsers, followersTarget, "followers-reverify-shortfall");
            followers = Array.from(state.collectedUsers);
        }
        if (finalizeIfProfileChanged(summary)) return;
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
        summary.followersCollectionStatus = followersTarget > 0 && followers.length > followersTarget ? "overcount" : "complete";

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
        if (finalizeIfProfileChanged(summary)) return;
        if (!closedFollowersDialog) {
            console.log("⚠️ 팔로워 모달 닫기 실패. 마지막 시도 후 1회 더 시도합니다.");
            await wait(800, 0);
            const recheckClosed = await closeActiveDialog();
            if (finalizeIfProfileChanged(summary)) return;
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
        if (finalizeIfProfileChanged(summary)) return;

        console.log("6) 팔로잉 목록 열기...");
        recordRunEvent("open_following_start", { mode: "following" });
        const openedFollowing = await openPopupByType("following");
        recordRunEvent("open_following_end", { mode: "following", ok: openedFollowing });
        summary.openedFollowing = openedFollowing;
        summary.expectedFollowingCount = state.expectedCounts.following;
        if (finalizeIfProfileChanged(summary)) return;
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

        recordRunEvent("following_settle_start", { mode: "following" });
        summary.followingSettled = await waitForListSettled("following");
        recordRunEvent("following_settle_end", { mode: "following", result: summary.followingSettled });
        if (finalizeIfProfileChanged(summary)) return;
        await wait(500, 200);
        if (finalizeIfProfileChanged(summary)) return;
        console.log("7) 팔로잉 목록 수집 시작...");
        const followingTarget = state.expectedCounts.following || 0;
        let following = await scrollUntilEnd(followingTarget, state.followingUsers, "following");
        if (followingTarget > 0 && following.length < followingTarget) {
            summary.followingReverify = await reverifyCurrentListCollection(followingTarget, state.followingUsers, "following");
            promoteDomCandidatesToConfirmed("following", state.followingUsers, followingTarget, "following-reverify-shortfall");
            following = Array.from(state.followingUsers);
        }
        if (finalizeIfProfileChanged(summary)) return;
        summary.followingCount = following.length;
        summary.following = following;
        summary.followingScrollEndReason = state.lastFollowingScrollEndReason;
        summary.followingScrollDiagnostics = state.lastFollowingScrollDiagnostics.slice(-20);
        summary.followingScrollRecovery = state.scrollRecovery.following.slice(-20);
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
                        message: "팔로잉 수집이 화면 표시 수보다 적어 diff 결과에 오탐이 포함될 수 있습니다. 특히 '나를 팔로우하지만 내가 팔로우하지 않는 계정'은 실제보다 많이 표시될 수 있습니다.",
                        expectedFollowingCount: followingTarget,
                        collectedFollowingCount: following.length,
                        missingFollowingCount: followingTarget - following.length,
                        affectedFields: ["followersWithoutMeFollowing", "mutualCount"]
                    }
                ]
            };
            summary.diffs = addAccuracyWarningsToDiffs(summary.diffs, summary);
            summary.accuracyMode = getAccuracyMode(summary);
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

        const diffs = addAccuracyWarningsToDiffs(compareFollowSets(), summary);
        summary.diffs = diffs;
        summary.accuracyMode = getAccuracyMode(summary);
        const excludedFromCompareCount = (diffs.excludedFromCompare?.followersOvercountLowConfidence?.length || 0) +
            (diffs.excludedFromCompare?.followingOvercountLowConfidence?.length || 0);
        if (summary.accuracyMode.status === "DOM_PREVIEW") {
            summary.status = excludedFromCompareCount > 0 ? "completed_dom_preview_with_overcount_exclusions" : "completed_dom_preview";
        } else if (excludedFromCompareCount > 0) {
            summary.status = "completed_with_overcount_exclusions";
        } else if (summary.status !== "completed_with_count_mismatch") {
            summary.status = "completed";
        }
        printAccuracyModeNotice(summary, "완료");
        printFollowDiffs(diffs);
        persistFollowers(followers, diffs);
        printSummary(summary);
        console.log("8) 전체 저장 완료");
        } catch (error) {
            summary.status = "failed_unhandled_exception";
            summary.lastError = error?.message || String(error);
            summary.followersCount = state.collectedUsers.size;
            summary.followingCount = state.followingUsers.size;
            summary.followers = Array.from(state.collectedUsers);
            summary.following = Array.from(state.followingUsers);
            summary.followersScrollEndReason = state.lastFollowersScrollEndReason || state.lastScrollEndReason || null;
            summary.followingScrollEndReason = state.lastFollowingScrollEndReason || null;
            try {
                summary.accuracyMode = getAccuracyMode(summary);
                persistFollowers(summary.followers, summary.diffs);
            } catch (persistError) {
                console.log("❌ 예외 후 partial 저장에도 실패했습니다:", persistError?.message || String(persistError));
            }
            console.log("❌ 실행 중 예외가 발생해 partial 결과를 저장했습니다:", summary.lastError);
            printSummary(summary);
        } finally {
            if (window.__igFollowerActiveRunId === state.runId) {
                window.__igFollowerRunInProgress = false;
            }
        }
    }

    if (window.__igFollowerRunInProgress === true) {
        console.log("⚠️ 이전 수집 실행이 아직 진행 중입니다. 이전 실행을 중단하고 새 실행을 시작합니다.");
    }
    window.__igFollowerRunInProgress = true;
    main();
}
