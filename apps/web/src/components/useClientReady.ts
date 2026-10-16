"use client";
import { useSyncExternalStore } from "react";

const noop = () => {};
const subscribe = () => noop;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Inert SSR controls until hydration installs client handlers; not authority. */
export function useClientReady(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
