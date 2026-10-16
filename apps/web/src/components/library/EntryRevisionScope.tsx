"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createEntryRevisionScopeStore,
  type EntryRevisionScopeStore,
  type EntryRevisionSnapshot,
} from "./entry-revision-scope-store";

const ScopeContext = createContext<EntryRevisionScopeStore | null>(null);
const standaloneSnapshot = Object.freeze({
  revision: 0,
  owner: null,
  waitingForRevision: null,
  removed: false,
  unavailable: false,
});
const standaloneSubscribe = () => () => {};
const getStandaloneSnapshot = () => standaloneSnapshot;

// Keep this provider keyed by page identity, not revision. Only the individual
// editors remount on revision; coordination survives their RSC replacement.
export function EntryRevisionScope({
  revision,
  children,
}: {
  revision: number;
  children: ReactNode;
}) {
  const [store] = useState(() => createEntryRevisionScopeStore(revision));
  useEffect(() => {
    store.acceptRevision(revision);
  }, [store, revision]);
  return (
    <ScopeContext.Provider value={store}>{children}</ScopeContext.Provider>
  );
}

export function useEntryRevisionFence(revision: number) {
  const store = useContext(ScopeContext);
  // Opaque page-local ownership, not a mutation UUID or serialized identity.
  const [owner] = useState<object>(() => Object.freeze({}));
  const snapshot = useSyncExternalStore<EntryRevisionSnapshot>(
    store?.subscribe ?? standaloneSubscribe,
    store?.getSnapshot ?? getStandaloneSnapshot,
    store?.getServerSnapshot ?? getStandaloneSnapshot,
  );
  const blocked =
    store !== null &&
    (snapshot.revision !== revision ||
      snapshot.owner !== null ||
      snapshot.waitingForRevision !== null ||
      snapshot.removed ||
      snapshot.unavailable);
  const canEdit = useCallback(
    () => store?.canEdit(revision) ?? true,
    [store, revision],
  );
  const start = useCallback(
    () => store?.start(owner, revision) ?? true,
    [store, owner, revision],
  );
  const commit = useCallback(
    (nextRevision: number, removed = false) =>
      store?.commit(owner, nextRevision, removed),
    [store, owner],
  );
  const fail = useCallback(
    (ambiguous: boolean, status?: number) =>
      store?.fail(owner, ambiguous, status),
    [store, owner],
  );
  const observe = useCallback(
    (nextRevision: number) => store?.observe(nextRevision),
    [store],
  );
  return { blocked, canEdit, start, commit, fail, observe };
}
