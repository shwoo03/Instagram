(function installIGAccuracyEngine(globalObject) {
    "use strict";

    if (globalObject.IGAccuracyEngine && Object.isFrozen(globalObject.IGAccuracyEngine)) {
        return;
    }

    const UNSAFE_FALLBACK_REASONS = Object.freeze(new Set([
        "rate_limited",
        "time_cap_reached",
        "profile_changed",
        "scroll_box_detached",
        "modal_closed",
        "run_superseded"
    ]));
    const SAFE_DOM_END_REASONS = Object.freeze(new Set([
        "list_end_observed",
        "stalled_at_list_end",
        "target_reached"
    ]));
    const SOURCE_PRIORITY = Object.freeze({
        "aria-label": 0,
        "accessibility-label": 0,
        title: 1,
        "sibling-value": 2,
        sibling: 2,
        "visible-label": 3,
        visible: 3,
        unknown: 4
    });
    const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) {
            return value;
        }
        seen.add(value);
        for (const child of Object.values(value)) deepFreeze(child, seen);
        return Object.freeze(value);
    }

    function finiteNonNegativeInteger(value, fallback = 0) {
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
    }

    function normalizeDigits(value) {
        return String(value ?? "")
            .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10))
            .replace(/[\u00A0\u202F]/g, " ")
            .trim();
    }

    function normalizeCountCandidates(candidates) {
        const list = Array.isArray(candidates) ? candidates : [candidates];
        return list.map((candidate, index) => {
            if (typeof candidate === "number" || typeof candidate === "string") {
                return { raw: candidate, source: "unknown", priority: SOURCE_PRIORITY.unknown, index };
            }
            if (!candidate || typeof candidate !== "object") return null;
            const raw = candidate.value ?? candidate.text ?? candidate.label ?? candidate.content ?? candidate.notation;
            const source = String(candidate.source || candidate.kind || "unknown").toLowerCase();
            const priority = Number.isFinite(candidate.priority)
                ? candidate.priority
                : (SOURCE_PRIORITY[source] ?? SOURCE_PRIORITY.unknown);
            return { raw, source, priority, index };
        }).filter((candidate) => candidate && candidate.raw !== null && candidate.raw !== undefined);
    }

    function parseGroupedInteger(notation) {
        const compact = notation.trim();
        if (/^\d+$/.test(compact)) {
            const value = Number(compact);
            return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, reason: "count-out-of-range" };
        }

        const separators = [...compact].filter((character) => /[ ,.\u0027\u2019]/.test(character));
        if (separators.length === 0) return { ok: false, reason: "malformed-count" };
        const normalizedSeparators = new Set(separators.map((separator) => separator === "’" ? "'" : separator));
        if (normalizedSeparators.size !== 1) return { ok: false, reason: "ambiguous-separators" };

        const separator = [...normalizedSeparators][0];
        const comparable = compact.replace(/’/g, "'");
        const escaped = separator === " " ? " " : `\\${separator}`;
        const groupedPattern = new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`);
        if (!groupedPattern.test(comparable)) return { ok: false, reason: "ambiguous-grouping" };
        if (separator === "." && separators.length === 1) {
            return { ok: false, reason: "ambiguous-decimal-or-grouping" };
        }
        const value = Number(comparable.split(separator).join(""));
        return Number.isSafeInteger(value)
            ? { ok: true, value }
            : { ok: false, reason: "count-out-of-range" };
    }

    function parseApproximateNumber(notation) {
        const compact = notation.replace(/\s/g, "");
        if (!/^\d+(?:[.,]\d{1,3})?$/.test(compact)) {
            return { ok: false, reason: "malformed-abbreviated-count" };
        }
        const value = Number(compact.replace(",", "."));
        return Number.isFinite(value) && value >= 0
            ? { ok: true, value }
            : { ok: false, reason: "count-out-of-range" };
    }

    function parseSingleDisplayedCount(raw) {
        if (typeof raw === "number") {
            if (Number.isSafeInteger(raw) && raw >= 0) {
                return { valid: true, value: raw, exact: true, notation: String(raw), reason: "exact-count" };
            }
            return { valid: false, reason: "malformed-count" };
        }

        const text = normalizeDigits(raw);
        if (!text) return { valid: false, reason: "empty-count" };
        const matches = [...text.matchAll(/\d(?:[\d\s,.\u0027\u2019]*\d|\d)?\s*(?:[kKmM]|천|만|억)?/gu)]
            .map((match) => match[0].trim())
            .filter(Boolean);
        if (matches.length !== 1) {
            return { valid: false, reason: matches.length > 1 ? "multiple-counts" : "no-count" };
        }

        const notation = matches[0];
        const suffixMatch = notation.match(/(천|만|억|[kKmM])$/u);
        if (suffixMatch) {
            const suffix = suffixMatch[1];
            const numberPart = notation.slice(0, -suffix.length).trim();
            const parsed = parseApproximateNumber(numberPart);
            if (!parsed.ok) return { valid: false, reason: parsed.reason };
            const multiplier = suffix.toLowerCase() === "k" || suffix === "천"
                ? 1_000
                : suffix.toLowerCase() === "m"
                    ? 1_000_000
                    : suffix === "만"
                        ? 10_000
                        : 100_000_000;
            const value = Math.round(parsed.value * multiplier);
            if (!Number.isSafeInteger(value)) return { valid: false, reason: "count-out-of-range" };
            return { valid: true, value, exact: false, notation, reason: "abbreviated-count" };
        }

        const parsed = parseGroupedInteger(notation);
        return parsed.ok
            ? { valid: true, value: parsed.value, exact: true, notation, reason: "exact-count" }
            : { valid: false, reason: parsed.reason };
    }

    function parseDisplayedCount(candidates) {
        const normalized = normalizeCountCandidates(candidates);
        const parsed = normalized.map((candidate) => ({
            ...candidate,
            result: parseSingleDisplayedCount(candidate.raw)
        }));
        const valid = parsed.filter((candidate) => candidate.result.valid);
        if (valid.length === 0) {
            const failureReasons = [...new Set(parsed.map((candidate) => candidate.result.reason))];
            return deepFreeze({
                value: null,
                exact: false,
                source: null,
                notation: null,
                reason: failureReasons[0] || "no-safe-count",
                rejectedReasons: failureReasons
            });
        }

        const exactCandidates = valid.filter((candidate) => candidate.result.exact);
        const pool = exactCandidates.length > 0 ? exactCandidates : valid;
        const bestPriority = Math.min(...pool.map((candidate) => candidate.priority));
        const preferred = pool.filter((candidate) => candidate.priority === bestPriority);
        const distinctValues = new Set(preferred.map((candidate) => candidate.result.value));
        if (distinctValues.size > 1) {
            return deepFreeze({
                value: null,
                exact: false,
                source: null,
                notation: null,
                reason: "conflicting-counts",
                rejectedReasons: ["conflicting-counts"]
            });
        }

        preferred.sort((left, right) => left.index - right.index);
        const selected = preferred[0];
        return deepFreeze({
            value: selected.result.value,
            exact: selected.result.exact,
            source: selected.source,
            notation: selected.result.notation,
            reason: selected.result.reason
        });
    }

    function getOwnListCount(value) {
        if (!value || typeof value !== "object") return null;
        const lengths = ["users", "items", "edges", "nodes"]
            .filter((key) => Object.prototype.hasOwnProperty.call(value, key) && Array.isArray(value[key]))
            .map((key) => value[key].length);
        return lengths.length > 0 ? Math.max(...lengths) : null;
    }

    function extractPaginationEvidence(payload) {
        const observations = [];
        const seen = new WeakSet();

        function record(key, value, itemCount) {
            if (typeof value !== "boolean") return;
            observations.push({
                hasMore: value,
                reason: `${key}_${value ? "true" : "false"}`,
                itemCount: itemCount === null ? 0 : itemCount
            });
        }

        function isTrustedListContainer(path, depth) {
            if (depth === 0) return true;
            const key = String(path[path.length - 1] || "").toLowerCase();
            return /^(edge_followed_by|edge_follow|edge_following|followers|following)$/.test(key);
        }

        function visit(value, depth = 0, path = [], parentTrustedList = false, parentItemCount = null) {
            if (!value || typeof value !== "object" || depth > 10 || seen.has(value)) return;
            seen.add(value);
            const itemCount = getOwnListCount(value);
            const trustedOwnList = itemCount !== null && isTrustedListContainer(path, depth);
            const listContext = trustedOwnList || parentTrustedList;
            const contextualCount = itemCount ?? parentItemCount;

            if (listContext) {
                record("has_more", value.has_more, contextualCount);
                record("has_next_page", value.has_next_page, contextualCount);
                record("more_available", value.more_available, contextualCount);
            }

            for (const [key, child] of Object.entries(value)) {
                if (!child || typeof child !== "object") continue;
                if (key === "page_info" || key === "pagination" || key === "paging") {
                    visit(child, depth + 1, [...path, key], trustedOwnList, itemCount);
                } else {
                    visit(child, depth + 1, [...path, key], false, null);
                }
            }
        }

        visit(payload);
        if (observations.length === 0) {
            return deepFreeze({
                paginationRecognized: false,
                hasMore: null,
                terminal: false,
                terminalReason: "pagination_unrecognized",
                itemCount: 0
            });
        }

        const values = new Set(observations.map((observation) => observation.hasMore));
        if (values.size > 1) {
            return deepFreeze({
                paginationRecognized: true,
                hasMore: null,
                terminal: false,
                terminalReason: "conflicting_pagination_signals",
                itemCount: Math.max(...observations.map((observation) => observation.itemCount))
            });
        }

        const hasMore = observations[0].hasMore;
        const matching = observations.find((observation) => observation.hasMore === hasMore);
        return deepFreeze({
            paginationRecognized: true,
            hasMore,
            terminal: hasMore === false,
            terminalReason: matching.reason,
            itemCount: Math.max(...observations.map((observation) => observation.itemCount))
        });
    }

    function classifyEvidence(input = {}) {
        const devtoolsExactPayloadCount = finiteNonNegativeInteger(input.devtoolsExactPayloadCount ?? input.devtoolsConfirmedPayloadCount);
        const devtoolsCandidatePayloadCount = finiteNonNegativeInteger(input.devtoolsCandidatePayloadCount);
        const debuggerExactPayloadCount = finiteNonNegativeInteger(input.debuggerExactPayloadCount ?? input.debuggerConfirmedPayloadCount);
        const debuggerCandidatePayloadCount = finiteNonNegativeInteger(input.debuggerCandidatePayloadCount);
        const pageNetworkExactPayloadCount = finiteNonNegativeInteger(input.pageNetworkExactPayloadCount ?? input.pageNetworkConfirmedPayloadCount);
        const pageNetworkCandidatePayloadCount = finiteNonNegativeInteger(input.pageNetworkCandidatePayloadCount);
        const domEvidenceCount = finiteNonNegativeInteger(input.domEvidenceCount ?? input.domCount);
        let code;

        if (devtoolsExactPayloadCount > 0 || input.hasDevtoolsExactEvidence === true) {
            code = "DEVTOOLS_EXACT";
        } else if (debuggerExactPayloadCount > 0 || input.hasDebuggerExactEvidence === true) {
            code = "DEBUGGER_EXACT";
        } else if (devtoolsCandidatePayloadCount > 0) {
            code = "DEVTOOLS_CANDIDATES_ONLY";
        } else if (debuggerCandidatePayloadCount > 0) {
            code = "DEBUGGER_CANDIDATES_ONLY";
        } else if (input.devtoolsConnected === true) {
            code = "DEVTOOLS_CONNECTED_NO_PAYLOAD";
        } else if (input.debuggerConnected === true) {
            code = "DEBUGGER_CONNECTED_NO_PAYLOAD";
        } else if (pageNetworkExactPayloadCount > 0 || input.hasPageNetworkEvidence === true) {
            code = "PAGE_NETWORK_ASSISTED";
        } else if (pageNetworkCandidatePayloadCount > 0) {
            code = "PAGE_NETWORK_CANDIDATES_ONLY";
        } else {
            code = "DOM_PREVIEW";
        }

        return deepFreeze({
            code,
            strictEligible: code === "DEVTOOLS_EXACT" || code === "DEBUGGER_EXACT",
            assistedEligible: code === "PAGE_NETWORK_ASSISTED" || code === "DOM_PREVIEW",
            devtoolsConnected: input.devtoolsConnected === true,
            devtoolsExactPayloadCount,
            devtoolsCandidatePayloadCount,
            debuggerConnected: input.debuggerConnected === true,
            debuggerExactPayloadCount,
            debuggerCandidatePayloadCount,
            pageNetworkExactPayloadCount,
            pageNetworkCandidatePayloadCount,
            domEvidenceCount
        });
    }

    function normalizeExpectedCount(expectedCount) {
        if (expectedCount && typeof expectedCount === "object") {
            return {
                value: Number.isSafeInteger(expectedCount.value) && expectedCount.value >= 0 ? expectedCount.value : null,
                exact: expectedCount.exact === true
            };
        }
        return {
            value: Number.isSafeInteger(expectedCount) && expectedCount >= 0 ? expectedCount : null,
            exact: Number.isSafeInteger(expectedCount) && expectedCount >= 0
        };
    }

    function assessListCompletion(input = {}) {
        const expected = normalizeExpectedCount(input.expectedCount);
        const confirmedCount = finiteNonNegativeInteger(input.confirmedCount ?? input.verifiedCount);
        const assistedCount = finiteNonNegativeInteger(input.assistedCount);
        const assistedTotalCount = finiteNonNegativeInteger(input.assistedTotalCount, confirmedCount + assistedCount);
        const nonDomCandidateCount = finiteNonNegativeInteger(input.nonDomCandidateCount);
        const domCandidateCount = finiteNonNegativeInteger(input.domCandidateCount);
        const repeatDomCandidateCount = finiteNonNegativeInteger(input.repeatDomCandidateCount);
        const correctlyIdentifiedDomCandidateCount = finiteNonNegativeInteger(
            input.correctlyIdentifiedDomCandidateCount,
            input.correctModalIdentified === true ? domCandidateCount : 0
        );
        const tolerance = finiteNonNegativeInteger(input.smallGapTolerance, 5);
        const evidence = classifyEvidence(input);
        const pagination = input.pagination && typeof input.pagination === "object" ? input.pagination : {};
        const endReasons = [...new Set([
            ...(Array.isArray(input.endReasons) ? input.endReasons : []),
            input.endReason
        ].filter((reason) => typeof reason === "string" && reason))];
        const unsafeReasons = endReasons.filter((reason) => UNSAFE_FALLBACK_REASONS.has(reason));
        const domEndObserved = input.domEndObserved === true || endReasons.some((reason) => SAFE_DOM_END_REASONS.has(reason));
        const gap = expected.value === null ? null : expected.value - confirmedCount;
        const assistedGap = expected.value === null ? null : expected.value - assistedTotalCount;
        const fallbackBlockReasons = [];
        const capturePending = finiteNonNegativeInteger(input.capturePendingCount);
        const captureFailed = finiteNonNegativeInteger(input.captureFailedCount);
        if (capturePending || captureFailed) fallbackBlockReasons.push("capture_unresolved");

        if (!expected.exact) fallbackBlockReasons.push("expected_count_not_exact");
        if (!evidence.strictEligible) fallbackBlockReasons.push("no_confirmed_cdp_evidence");
        if (gap === null || gap <= 0) fallbackBlockReasons.push("no_missing_count_gap");
        for (const reason of unsafeReasons) fallbackBlockReasons.push(`unsafe_end_reason:${reason}`);
        if (correctlyIdentifiedDomCandidateCount <= 0) fallbackBlockReasons.push("modal_not_identified");
        if (repeatDomCandidateCount <= 0) fallbackBlockReasons.push("repeat_dom_evidence_missing");
        if (domCandidateCount <= 0) fallbackBlockReasons.push("no_dom_candidates");

        const fallbackAllowed = fallbackBlockReasons.length === 0;
        const maxAssistedPromotions = fallbackAllowed
            ? Math.min(gap, domCandidateCount, repeatDomCandidateCount, correctlyIdentifiedDomCandidateCount)
            : 0;
        let state = "PARTIAL";
        const reasons = [];

        if (input.integrityOk === false) {
            state = "RETRY_REQUIRED";
            reasons.push("integrity_failed");
        } else if (capturePending || captureFailed) {
            state = "PARTIAL";
            if (capturePending) reasons.push("capture_pending");
            if (captureFailed) reasons.push("capture_failed");
        } else if ([
            "DEVTOOLS_CONNECTED_NO_PAYLOAD",
            "DEVTOOLS_CANDIDATES_ONLY",
            "DEBUGGER_CONNECTED_NO_PAYLOAD",
            "DEBUGGER_CANDIDATES_ONLY"
        ].includes(evidence.code)) {
            state = "RETRY_REQUIRED";
            reasons.push("cdp_connected_no_exact_payload");
        } else if (evidence.strictEligible && expected.exact && gap === 0 && unsafeReasons.length === 0) {
            state = "CONFIRMED_EXACT_COUNT";
            reasons.push("exact_displayed_count_matches_cdp");
        } else if (
            evidence.strictEligible &&
            expected.exact &&
            gap !== null && gap > 0 && gap <= tolerance &&
            pagination.paginationRecognized === true && pagination.terminal === true &&
            domEndObserved && nonDomCandidateCount === 0 && unsafeReasons.length === 0
        ) {
            state = "CONFIRMED_NETWORK_END";
            reasons.push("cdp_pagination_terminal", "dom_list_end_observed", "small_gap_within_tolerance");
        } else if (!evidence.strictEligible && unsafeReasons.length === 0) {
            const exactAssistedMatch = expected.exact && assistedGap === 0 && assistedTotalCount > 0;
            const endedAssistedRun = domEndObserved && (assistedTotalCount > 0 || evidence.pageNetworkExactPayloadCount > 0);
            if (exactAssistedMatch || endedAssistedRun) {
                state = "ASSISTED_COMPLETE";
                reasons.push(exactAssistedMatch ? "assisted_exact_count_match" : "assisted_dom_end_observed");
            }
        }

        if (state === "PARTIAL") {
            if (unsafeReasons.length > 0) reasons.push(...unsafeReasons.map((reason) => `unsafe_end_reason:${reason}`));
            else if (evidence.strictEligible && gap !== null && gap > 0 && pagination.terminal !== true) reasons.push("pagination_terminal_not_proven");
            else if (expected.value === null) reasons.push("expected_count_unknown");
            else if (!expected.exact) reasons.push("expected_count_approximate");
            else reasons.push("safe_completion_not_proven");
        }

        return deepFreeze({
            state,
            capturePendingCount: capturePending,
            captureFailedCount: captureFailed,
            complete: state === "CONFIRMED_EXACT_COUNT" || state === "CONFIRMED_NETWORK_END" || state === "ASSISTED_COMPLETE",
            strictComplete: state === "CONFIRMED_EXACT_COUNT" || state === "CONFIRMED_NETWORK_END",
            expectedCount: expected.value,
            expectedCountExact: expected.exact,
            confirmedCount,
            assistedCount,
            assistedTotalCount,
            gap,
            domEndObserved,
            unsafeEndReasons: unsafeReasons,
            fallbackAllowed,
            maxAssistedPromotions,
            fallbackBlockReasons,
            reasons,
            evidence
        });
    }

    function completionReason(prefix, completion) {
        const suffix = {
            CONFIRMED_EXACT_COUNT: "exact",
            CONFIRMED_NETWORK_END: "network_end",
            ASSISTED_COMPLETE: "assisted",
            PARTIAL: "partial",
            RETRY_REQUIRED: "retry_required"
        }[completion?.state] || "missing";
        return `${prefix}_${suffix}`;
    }

    function buildTrustVerdict(input = {}) {
        const followers = input.followers || input.followersCompletion;
        const following = input.following || input.followingCompletion;
        const integrityOk = input.integrityOk !== undefined
            ? input.integrityOk === true
            : input.integrity?.ok === true;
        const states = [followers?.state, following?.state];
        let code;

        if (!integrityOk || states.includes("RETRY_REQUIRED")) code = "RETRY_REQUIRED";
        else if (states.every((state) => state === "CONFIRMED_EXACT_COUNT" || state === "CONFIRMED_NETWORK_END")) code = "CONFIRMED";
        else if (states.includes("PARTIAL") || states.includes(undefined)) code = "PARTIAL";
        else code = "REFERENCE_ONLY";

        const metadata = {
            CONFIRMED: {
                labelKo: "확정 비교 가능",
                severity: "success",
                recommendedActionKo: "없음"
            },
            REFERENCE_ONLY: {
                labelKo: "참고용 결과",
                severity: "info",
                recommendedActionKo: "정확한 비교가 필요하면 Instagram 탭을 새로고침한 뒤 다시 실행하세요."
            },
            PARTIAL: {
                labelKo: "부분 결과",
                severity: "warning",
                recommendedActionKo: "완료되지 않은 목록의 종료 원인을 확인한 뒤 다시 실행하세요."
            },
            RETRY_REQUIRED: {
                labelKo: "네트워크 수집 재실행 필요",
                severity: "error",
                recommendedActionKo: "Instagram 탭을 새로고침한 뒤 다시 실행하세요. 계속 실패하면 DevTools를 연 상태에서 재시도하세요."
            }
        }[code];

        return deepFreeze({
            code,
            ...metadata,
            reasons: [
                completionReason("followers", followers),
                completionReason("following", following),
                integrityOk ? "integrity_passed" : "integrity_failed"
            ]
        });
    }

    function normalizeUsers(users) {
        const normalized = new Set();
        const rejected = [];
        for (const raw of users || []) {
            const username = String(raw ?? "").trim().toLowerCase();
            if (USERNAME_PATTERN.test(username)) normalized.add(username);
            else rejected.push(String(raw ?? ""));
        }
        return { users: normalized, rejected };
    }

    function mergePaginationEvidence(current = {}, incoming = {}, source = "unknown", order = 0) {
        const orders = { ...current.requestOrders };
        const nextOrder = Number(order) || 0;
        if (nextOrder > 0 && nextOrder < (orders[source] || 0)) return { ...current };
        if (nextOrder > 0 && nextOrder === orders[source] &&
            (current.terminal !== (incoming.terminal === true) || current.hasMore !== incoming.hasMore)) {
            return { ...current, recognized: false, terminal: false, hasMore: null, terminalReason: "conflicting_same_order" };
        }
        if (nextOrder > 0) orders[source] = nextOrder;
        return {
            ...current,
            requestOrders: orders,
            recognized: incoming.recognized === true,
            hasMore: typeof incoming.hasMore === "boolean" ? incoming.hasMore : null,
            terminal: incoming.recognized === true && incoming.terminal === true,
            terminalReason: incoming.terminalReason || "pagination_unrecognized"
        };
    }

    function sortedDifference(left, right) {
        return [...left].filter((username) => !right.has(username)).sort();
    }

    function sortedIntersection(left, right) {
        return [...left].filter((username) => right.has(username)).sort();
    }

    function comparePair(followers, following) {
        const mutualUsers = sortedIntersection(followers, following);
        return {
            followersWithoutMeFollowing: sortedDifference(followers, following),
            iFollowButNotReturned: sortedDifference(following, followers),
            mutualUsers,
            mutualCount: mutualUsers.length,
            compareCounts: {
                followers: followers.size,
                following: following.size
            }
        };
    }

    function compareStrictSets(input = {}) {
        const strictFollowers = normalizeUsers(input.strictFollowers ?? input.followers?.strictUsers ?? input.followers ?? []);
        const strictFollowing = normalizeUsers(input.strictFollowing ?? input.following?.strictUsers ?? input.following ?? []);
        const assistedFollowers = normalizeUsers(input.assistedFollowers ?? input.followers?.assistedUsers ?? []);
        const assistedFollowing = normalizeUsers(input.assistedFollowing ?? input.following?.assistedUsers ?? []);
        const assistedFollowersUnion = new Set([...strictFollowers.users, ...assistedFollowers.users]);
        const assistedFollowingUnion = new Set([...strictFollowing.users, ...assistedFollowing.users]);
        const strict = comparePair(strictFollowers.users, strictFollowing.users);
        const assistedPreview = comparePair(assistedFollowersUnion, assistedFollowingUnion);

        return deepFreeze({
            ...strict,
            assistedPreview,
            rejectedUsernames: {
                strictFollowers: strictFollowers.rejected.length,
                strictFollowing: strictFollowing.rejected.length,
                assistedFollowers: assistedFollowers.rejected.length,
                assistedFollowing: assistedFollowing.rejected.length
            }
        });
    }

    function validateCompareIntegrity(input = {}) {
        const comparison = input.comparison || input.result || input;
        const followersCount = finiteNonNegativeInteger(
            input.followersCount ?? input.strictFollowersCount ?? comparison.compareCounts?.followers
        );
        const followingCount = finiteNonNegativeInteger(
            input.followingCount ?? input.strictFollowingCount ?? comparison.compareCounts?.following
        );
        const followersOnly = Array.isArray(comparison.followersWithoutMeFollowing)
            ? comparison.followersWithoutMeFollowing : [];
        const followingOnly = Array.isArray(comparison.iFollowButNotReturned)
            ? comparison.iFollowButNotReturned : [];
        const hasMutualUsers = Array.isArray(comparison.mutualUsers);
        const mutualUsers = hasMutualUsers ? comparison.mutualUsers : [];
        const mutualCount = finiteNonNegativeInteger(comparison.mutualCount);
        const checks = [
            {
                code: "followers_partition",
                ok: mutualCount + followersOnly.length === followersCount,
                actual: mutualCount + followersOnly.length,
                expected: followersCount
            },
            {
                code: "following_partition",
                ok: mutualCount + followingOnly.length === followingCount,
                actual: mutualCount + followingOnly.length,
                expected: followingCount
            },
            {
                code: "mutual_array_count",
                ok: !hasMutualUsers || mutualUsers.length === mutualCount,
                actual: mutualUsers.length,
                expected: mutualCount
            },
            {
                code: "diff_sets_disjoint",
                ok: !followersOnly.some((username) => followingOnly.includes(username)),
                actual: followersOnly.filter((username) => followingOnly.includes(username)).length,
                expected: 0
            }
        ];
        return deepFreeze({
            ok: checks.every((check) => check.ok),
            checks
        });
    }

    const namespace = Object.freeze({
        mergePaginationEvidence,
        parseDisplayedCount,
        extractPaginationEvidence,
        assessListCompletion,
        classifyEvidence,
        buildTrustVerdict,
        compareStrictSets,
        validateCompareIntegrity
    });

    Object.defineProperty(globalObject, "IGAccuracyEngine", {
        value: namespace,
        writable: false,
        configurable: true,
        enumerable: true
    });
})(globalThis);
