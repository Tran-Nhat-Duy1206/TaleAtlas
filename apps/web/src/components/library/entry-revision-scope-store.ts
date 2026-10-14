// Page-local coordination only: no private values, request bodies, UUIDs or I/O.
export type EntryRevisionOwner = object;
export type EntryRevisionSnapshot = Readonly<{
  revision: number;
  owner: EntryRevisionOwner | null;
  waitingForRevision: number | null;
  removed: boolean;
  unavailable: boolean;
}>;
function validRevision(value: number) {
  return Number.isSafeInteger(value) && value >= 1;
}
export function createEntryRevisionScopeStore(initialRevision: number) {
  if (!validRevision(initialRevision))
    throw new Error("Invalid entry revision");
  const serverSnapshot: EntryRevisionSnapshot = Object.freeze({
    revision: initialRevision,
    owner: null,
    waitingForRevision: null,
    removed: false,
    unavailable: false,
  });
  let snapshot = serverSnapshot;
  // The submitted seed revision, not later Root metadata, defines a 409 floor.
  let leaseRevision: number | null = null;
  const listeners = new Set<() => void>();
  function publish(next: EntryRevisionSnapshot) {
    if (next.owner === null) leaseRevision = null;
    snapshot = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  }
  function blocked(consumerRevision: number) {
    return (
      consumerRevision !== snapshot.revision ||
      snapshot.owner !== null ||
      snapshot.waitingForRevision !== null ||
      snapshot.removed ||
      snapshot.unavailable
    );
  }
  function waitFor(nextRevision: number) {
    publish({
      ...snapshot,
      waitingForRevision: Math.max(
        snapshot.waitingForRevision ?? nextRevision,
        nextRevision,
      ),
    });
  }
  return {
    getSnapshot: () => snapshot,
    // Stable initial metadata for SSR/hydration; never includes a live lease.
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canEdit: (consumerRevision: number) => !blocked(consumerRevision),
    start(owner: EntryRevisionOwner, consumerRevision: number) {
      if (
        consumerRevision !== snapshot.revision ||
        snapshot.waitingForRevision !== null ||
        snapshot.removed ||
        snapshot.unavailable
      )
        return false;
      // The owning component must also retain its original frozen pending body.
      // This lease is not authority to create a replacement command or UUID.
      if (snapshot.owner !== null) return snapshot.owner === owner;
      leaseRevision = consumerRevision;
      publish({ ...snapshot, owner });
      return true;
    },
    commit(owner: EntryRevisionOwner, nextRevision: number, removed = false) {
      if (snapshot.owner !== owner || snapshot.removed || snapshot.unavailable)
        return;
      if (!validRevision(nextRevision)) return;
      if (removed) {
        publish({ ...snapshot, removed: true });
      } else if (nextRevision > snapshot.revision) {
        waitFor(nextRevision);
      } else if (snapshot.waitingForRevision === null) {
        // Root metadata may already have advanced while this request was open.
        // Consumers with an older seed still fail the revision equality fence.
        publish({ ...snapshot, owner: null, waitingForRevision: null });
      }
    },
    fail(owner: EntryRevisionOwner, ambiguous: boolean, status?: number) {
      if (snapshot.owner !== owner || snapshot.removed || snapshot.unavailable)
        return;
      if (status === 401 || status === 403 || status === 404) {
        publish({ ...snapshot, unavailable: true });
      } else if (status === 409) {
        // This is a waiting floor, NOT a claim about the actual next revision.
        const floor = Math.max(
          (leaseRevision ?? snapshot.revision) + 1,
          snapshot.waitingForRevision ?? 0,
        );
        if (!validRevision(floor)) {
          publish({ ...snapshot, unavailable: true });
        } else if (snapshot.revision >= floor) {
          publish({ ...snapshot, owner: null, waitingForRevision: null });
        } else {
          waitFor(floor);
        }
      } else if (!ambiguous && snapshot.waitingForRevision === null) {
        publish({ ...snapshot, owner: null });
      }
    },
    observe(nextRevision: number) {
      if (
        validRevision(nextRevision) &&
        nextRevision > snapshot.revision &&
        !snapshot.removed &&
        !snapshot.unavailable
      )
        waitFor(nextRevision);
    },
    acceptRevision(revision: number) {
      if (
        !validRevision(revision) ||
        revision < snapshot.revision ||
        snapshot.removed ||
        snapshot.unavailable
      )
        return;
      const resolved =
        snapshot.waitingForRevision !== null &&
        revision >= snapshot.waitingForRevision;
      if (revision === snapshot.revision && !resolved) return;
      publish({
        ...snapshot,
        revision,
        ...(resolved ? { owner: null, waitingForRevision: null } : {}),
      });
    },
  };
}
export type EntryRevisionScopeStore = ReturnType<
  typeof createEntryRevisionScopeStore
>;
