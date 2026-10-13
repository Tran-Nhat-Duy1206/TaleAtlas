"use client";
import { useSyncExternalStore } from "react";

const noop = () => {};
const subscribe = () => noop;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Readiness only, never authority: SSR/initial hydration stays inert until React installs handlers. */
export function useCommunityReady(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
