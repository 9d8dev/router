import { describe, expect, it } from "vitest";
import { createLatestSaveQueue } from "../lib/forms/latest-save-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createLatestSaveQueue", () => {
  it("does not resolve until edits made during a save are persisted", async () => {
    let current = { title: "First edit" };
    let persisted = JSON.stringify({ title: "Initial" });
    const firstSave = deferred<boolean>();
    const savedTitles: string[] = [];
    const queue = createLatestSaveQueue({
      getSnapshot: () => current,
      getPersistedFingerprint: () => persisted,
      fingerprint: JSON.stringify,
      save: async (snapshot, fingerprint) => {
        savedTitles.push(snapshot.title);
        if (savedTitles.length === 1) await firstSave.promise;
        persisted = fingerprint;
        return true;
      },
    });

    const completion = queue.persist();
    current = { title: "Edit made while saving" };
    firstSave.resolve(true);

    await expect(completion).resolves.toBe(true);
    expect(savedTitles).toEqual(["First edit", "Edit made while saving"]);
    expect(persisted).toBe(JSON.stringify(current));
  });

  it("shares an active save while still draining the latest snapshot", async () => {
    let current = { title: "First edit" };
    let persisted = JSON.stringify({ title: "Initial" });
    const firstSave = deferred<boolean>();
    const savedTitles: string[] = [];
    const queue = createLatestSaveQueue({
      getSnapshot: () => current,
      getPersistedFingerprint: () => persisted,
      fingerprint: JSON.stringify,
      save: async (snapshot, fingerprint) => {
        savedTitles.push(snapshot.title);
        if (savedTitles.length === 1) await firstSave.promise;
        persisted = fingerprint;
        return true;
      },
    });

    const firstCompletion = queue.persist();
    current = { title: "Queued edit" };
    const secondCompletion = queue.persist();
    firstSave.resolve(true);

    await expect(Promise.all([firstCompletion, secondCompletion])).resolves.toEqual([
      true,
      true,
    ]);
    expect(savedTitles).toEqual(["First edit", "Queued edit"]);
  });
});
