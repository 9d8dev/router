type LatestSaveQueueOptions<T> = {
  getSnapshot: () => T;
  fingerprint: (snapshot: T) => string;
  getPersistedFingerprint: () => string;
  save: (snapshot: T, fingerprint: string) => Promise<boolean>;
};

export function createLatestSaveQueue<T>(options: LatestSaveQueueOptions<T>) {
  let active: Promise<boolean> | null = null;
  let queued = false;

  async function drain(): Promise<boolean> {
    while (true) {
      queued = false;
      const snapshot = options.getSnapshot();
      const fingerprint = options.fingerprint(snapshot);

      if (fingerprint !== options.getPersistedFingerprint()) {
        const saved = await options.save(snapshot, fingerprint);
        if (!saved) return false;
      }

      const latestFingerprint = options.fingerprint(options.getSnapshot());
      if (!queued && latestFingerprint === options.getPersistedFingerprint()) {
        return true;
      }
    }
  }

  function persist(): Promise<boolean> {
    if (active) {
      queued = true;
      return active.then((saved) => (saved ? persist() : false));
    }

    let tracked: Promise<boolean>;
    tracked = drain().finally(() => {
      if (active === tracked) active = null;
    });
    active = tracked;
    return tracked;
  }

  return { persist };
}
