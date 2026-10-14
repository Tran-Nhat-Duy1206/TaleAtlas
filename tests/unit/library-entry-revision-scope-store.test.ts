import { describe, expect, it, vi } from "vitest";
import { createEntryRevisionScopeStore } from "../../apps/web/src/components/library/entry-revision-scope-store";

const owner = () => Object.freeze({});

describe("page-local entry revision coordination model", () => {
  it("has stable immutable metadata-only SSR snapshots and performs no I/O or UUID generation", () => {
    const uuid = vi.fn(),
      fetch = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: uuid });
    vi.stubGlobal("fetch", fetch);
    try {
      const store = createEntryRevisionScopeStore(1);
      const server = store.getServerSnapshot();
      expect(Object.isFrozen(server)).toBe(true);
      expect(server).toEqual({
        revision: 1,
        owner: null,
        waitingForRevision: null,
        removed: false,
        unavailable: false,
      });
      expect(store.getSnapshot()).toBe(server);
      expect(store.getServerSnapshot()).toBe(server);
      store.start(owner(), 1);
      expect(store.getServerSnapshot()).toBe(server);
      expect(Object.isFrozen(store.getSnapshot())).toBe(true);
      expect(uuid).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("acquires synchronously before listeners can start a sibling command", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner(),
      b = owner();
    const denied = vi.fn();
    store.subscribe(() => denied(store.start(b, 1)));
    expect(store.start(a, 1)).toBe(true);
    expect(denied).toHaveBeenCalledWith(false);
    expect(store.canEdit(1)).toBe(false);
    expect(store.start(b, 1)).toBe(false);
    expect(store.getSnapshot().owner).toBe(a);
  });

  it("holds ambiguous ownership and allows only the same owner's frozen retry", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner(),
      b = owner();
    store.start(a, 1);
    const held = store.getSnapshot();
    store.fail(a, true);
    expect(store.getSnapshot()).toBe(held);
    expect(store.start(a, 1)).toBe(true);
    expect(store.start(b, 1)).toBe(false);
    expect(store.canEdit(1)).toBe(false);
  });

  it("ignores another owner's settlement", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner(),
      b = owner();
    store.start(a, 1);
    const held = store.getSnapshot();
    store.fail(b, false, 400);
    store.commit(b, 2);
    expect(store.getSnapshot()).toBe(held);
  });

  it.each([400, 429])(
    "releases its own definite nonstale failure %s without advancing root metadata",
    (status) => {
      const store = createEntryRevisionScopeStore(1),
        a = owner();
      store.start(a, 1);
      store.fail(a, false, status);
      expect(store.canEdit(1)).toBe(true);
      expect(store.getSnapshot().revision).toBe(1);
      expect(store.start(owner(), 1)).toBe(true);
    },
  );

  it("holds higher committed revision through same and stale RSC metadata", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.commit(a, 3);
    expect(store.getSnapshot().waitingForRevision).toBe(3);
    expect(store.start(a, 1)).toBe(false);
    store.acceptRevision(1);
    store.acceptRevision(2);
    expect(store.getSnapshot().revision).toBe(2);
    expect(store.canEdit(2)).toBe(false);
    const held = store.getSnapshot();
    store.acceptRevision(1);
    expect(store.getSnapshot()).toBe(held);
    store.acceptRevision(3);
    expect(store.canEdit(3)).toBe(true);
    expect(store.canEdit(1)).toBe(false);
    expect(store.canEdit(2)).toBe(false);
    expect(store.getSnapshot().owner).toBeNull();
  });

  it("accepts a root revision beyond the committed target without permitting old consumers", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.commit(a, 2);
    store.acceptRevision(4);
    expect(store.canEdit(4)).toBe(true);
    expect(store.start(owner(), 1)).toBe(false);
    expect(store.start(owner(), 2)).toBe(false);
    expect(store.start(owner(), 4)).toBe(true);
  });

  it("releases a validated same-revision no-op without waiting for refresh", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.commit(a, 1);
    expect(store.canEdit(1)).toBe(true);
    expect(store.getSnapshot().waitingForRevision).toBeNull();
  });

  it("409 creates only a waiting floor and rejects old retries until newer root metadata", () => {
    const store = createEntryRevisionScopeStore(5),
      a = owner();
    store.start(a, 5);
    store.fail(a, false, 409);
    expect(store.getSnapshot()).toMatchObject({
      revision: 5,
      waitingForRevision: 6,
    });
    expect(store.start(a, 5)).toBe(false);
    expect(store.start(owner(), 5)).toBe(false);
    store.acceptRevision(5);
    expect(store.canEdit(5)).toBe(false);
    store.acceptRevision(6);
    expect(store.canEdit(6)).toBe(true);
    expect(store.canEdit(5)).toBe(false);
  });

  it("409 after newer Root metadata settles against the submitted lease revision, not Root plus one", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.acceptRevision(3);
    expect(store.canEdit(3)).toBe(false);
    store.fail(a, false, 409);
    expect(store.getSnapshot()).toMatchObject({
      revision: 3,
      owner: null,
      waitingForRevision: null,
    });
    expect(store.canEdit(3)).toBe(true);
    expect(store.canEdit(1)).toBe(false);
    expect(store.start(owner(), 1)).toBe(false);
    expect(store.start(owner(), 3)).toBe(true);
  });

  it("late 409 cannot release a higher known GET floor beyond current Root metadata", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.acceptRevision(3);
    store.observe(5);
    store.fail(a, false, 409);
    expect(store.getSnapshot()).toMatchObject({
      revision: 3,
      owner: a,
      waitingForRevision: 5,
    });
    expect(store.canEdit(3)).toBe(false);
    expect(store.start(a, 3)).toBe(false);
    store.acceptRevision(5);
    expect(store.canEdit(5)).toBe(true);
    expect(store.canEdit(3)).toBe(false);
  });

  it.each([401, 403, 404])(
    "authority/unavailability failure %s stays terminal until provider unmount",
    (status) => {
      const store = createEntryRevisionScopeStore(1),
        a = owner();
      store.start(a, 1);
      store.fail(a, false, status);
      expect(store.getSnapshot().unavailable).toBe(true);
      store.acceptRevision(2);
      store.fail(a, false, 400);
      expect(store.start(a, 1)).toBe(false);
      expect(store.canEdit(1)).toBe(false);
      expect(store.canEdit(2)).toBe(false);
      expect(createEntryRevisionScopeStore(2).canEdit(2)).toBe(true);
    },
  );

  it("removal remasks all consumers until provider unmount, without requiring navigation", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.commit(a, 2, true);
    expect(store.getSnapshot().removed).toBe(true);
    store.acceptRevision(2);
    store.fail(a, false);
    expect(store.canEdit(1)).toBe(false);
    expect(store.canEdit(2)).toBe(false);
    expect(store.start(a, 1)).toBe(false);
  });

  it("a higher authoritative GET fences siblings without creating a command owner", () => {
    const store = createEntryRevisionScopeStore(1);
    store.observe(3);
    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      owner: null,
      waitingForRevision: 3,
    });
    expect(store.start(owner(), 1)).toBe(false);
    store.observe(2);
    expect(store.getSnapshot().waitingForRevision).toBe(3);
    store.acceptRevision(2);
    expect(store.canEdit(2)).toBe(false);
    store.acceptRevision(3);
    expect(store.canEdit(3)).toBe(true);
  });

  it("a same-revision command settlement or definite error cannot undo a known higher GET fence", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.observe(2);
    store.commit(a, 1);
    store.fail(a, false, 400);
    expect(store.canEdit(1)).toBe(false);
    expect(store.getSnapshot().waitingForRevision).toBe(2);
    store.acceptRevision(2);
    expect(store.canEdit(2)).toBe(true);
  });

  it("does not release an unsettled ambiguous owner just because root metadata advances", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner();
    store.start(a, 1);
    store.fail(a, true);
    store.acceptRevision(2);
    expect(store.canEdit(2)).toBe(false);
    expect(store.start(a, 1)).toBe(false);
    expect(store.start(owner(), 2)).toBe(false);
    store.commit(a, 2);
    expect(store.canEdit(2)).toBe(true);
    expect(store.canEdit(1)).toBe(false);
  });

  it("subscriptions notify only changed snapshots and unsubscribe cleanly", () => {
    const store = createEntryRevisionScopeStore(1),
      a = owner(),
      listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.acceptRevision(1);
    expect(listener).not.toHaveBeenCalled();
    store.start(a, 1);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.fail(a, false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("rejects invalid initial metadata and ignores invalid revision observations", () => {
    expect(() => createEntryRevisionScopeStore(0)).toThrow(
      "Invalid entry revision",
    );
    const store = createEntryRevisionScopeStore(1);
    const initial = store.getSnapshot();
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
      store.observe(invalid);
      store.acceptRevision(invalid);
      expect(store.getSnapshot()).toBe(initial);
      expect(store.start(owner(), invalid)).toBe(false);
    }
  });
});
