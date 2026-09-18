(function installSessionRetention(globalObject) {
  "use strict";

  const SNAPSHOT_PREFIX = "ig_follower_snapshot:";
  const LAST_RUN = `${SNAPSHOT_PREFIX}lastRun`;
  const PROGRESS_PREFIX = "ig_run_progress:tab:";

  function createStore(session, { budgetBytes = 8 * 1024 * 1024, maxSnapshots = 10 } = {}) {
    let queue = Promise.resolve();
    const estimateBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length * 2;

    async function write(patch) {
      // Frequent progress updates are small; avoid reading every saved result
      // on each scroll tick. Prune on snapshot saves or actual quota pressure.
      if (!Object.keys(patch).some((key) => key.startsWith(SNAPSHOT_PREFIX))) {
        try {
          await session.set(patch);
          return { evictedCount: 0 };
        } catch (error) {
          if (!/quota/i.test(error?.message || "")) throw error;
        }
      }
      const stored = await session.get(null);
      const merged = { ...stored, ...patch };
      const snapshots = Object.keys(merged).filter((key) => key.startsWith(SNAPSHOT_PREFIX) && key !== LAST_RUN);
      const protectedProfiles = new Set(Object.entries(merged)
        .filter(([key, value]) => key.startsWith(PROGRESS_PREFIX) && value?.stage !== "finished")
        .map(([, value]) => value?.profile).filter(Boolean));
      const latestKey = merged[LAST_RUN]?.ref;
      const candidates = snapshots.filter((key) => !Object.hasOwn(patch, key) && key !== latestKey &&
        !protectedProfiles.has(stored[key]?.profile))
        .sort((left, right) => (Date.parse(stored[left]?.collectedAt) || 0) - (Date.parse(stored[right]?.collectedAt) || 0));
      const sizes = await Promise.all(candidates.map((key) => session.getBytesInUse(key)));
      let projectedBytes = await session.getBytesInUse(null) - await session.getBytesInUse(Object.keys(patch)) + estimateBytes(patch);
      let remainingCount = snapshots.length;
      const removals = [];
      for (let index = 0; index < candidates.length; index++) {
        if (projectedBytes <= budgetBytes && remainingCount <= maxSnapshots) break;
        removals.push(candidates[index]);
        projectedBytes -= sizes[index];
        remainingCount--;
      }
      if (removals.length) {
        // If the replacement save fails, do not leave a pointer to an evicted
        // result. The successful patch installs its own lastRun reference.
        const oldRef = stored[LAST_RUN]?.ref;
        await session.remove(removals.includes(oldRef) ? [...removals, LAST_RUN] : removals);
      }
      await session.set(patch);
      return { evictedCount: removals.length };
    }

    return Object.freeze({
      set(patch) {
        // A failed save must not poison subsequent writes. Serialize progress
        // and snapshots so concurrent tabs cannot choose the same budget.
        const result = queue.then(() => write(patch));
        queue = result.catch(() => {});
        return result;
      }
    });
  }

  globalObject.IGSessionRetention = Object.freeze({ createStore });
})(globalThis);
