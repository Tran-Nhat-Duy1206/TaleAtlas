"use client";
import { useRef, useState } from "react";
/** Local D report-attempt locks protect mounted frozen keys; never confer server authority. */
export function useReportLocks() {
  const current = useRef(new Set<string>());
  const [count, setCount] = useState(0);
  function update(id: string, locked: boolean) {
    if (locked) current.current.add(id);
    else current.current.delete(id);
    setCount(current.current.size);
  }
  return {
    count,
    update,
    blocked: () => current.current.size > 0,
    other: (id: string) => current.current.size > 0 && !current.current.has(id),
  };
}
