"use client";

import * as React from "react";
import { fail, type Result } from "@/lib/result";

/**
 * One line for every change a coach makes to a session — the details form, a duration, a reorder, an added drill.
 * Every change presents the session's version (optimistic concurrency), and each one bumps it, so two requests
 * from the same screen must never overlap: this runs them strictly one after another, each with the version the
 * previous one returned. That is also what keeps rapid clicking (five "Move up"s in a row) correct.
 *
 * A CONFLICT means another tab or person changed the session: the queue records it, so the screen can offer a
 * reload instead of silently overwriting their work.
 */
export type QueueFailure = "CONFLICT" | "ERROR" | null;

export function useMutationQueue(initialVersion: number) {
  const version = React.useRef(initialVersion);
  const chain = React.useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = React.useState(0);
  const [failure, setFailure] = React.useState<QueueFailure>(null);
  // the same failure, readable from an event handler that runs after an await (state would be stale there)
  const failureRef = React.useRef<QueueFailure>(null);

  /** Tell the queue about a version the server has shown us (a page refresh): it never goes backwards. */
  const observe = React.useCallback((v: number) => {
    version.current = Math.max(version.current, v);
  }, []);

  const enqueue = React.useCallback(
    <T extends { version: number }>(
      run: (version: number) => Promise<Result<T>>,
    ): Promise<Result<T>> => {
      setPending((n) => n + 1);
      const job = chain.current.then(async (): Promise<Result<T>> => {
        try {
          const result = await run(version.current);
          if (result.ok) {
            version.current = result.data.version;
            if (failureRef.current === "ERROR") failureRef.current = null;
            setFailure((f) => (f === "ERROR" ? null : f)); // a later success clears a transient failure
          } else if (result.error.code === "CONFLICT") {
            failureRef.current = "CONFLICT";
            setFailure("CONFLICT");
          }
          return result;
        } catch {
          failureRef.current = "ERROR";
          setFailure("ERROR"); // the request never got an answer (offline, server down)
          return fail("INTERNAL");
        } finally {
          setPending((n) => n - 1);
        }
      });
      chain.current = job;
      return job;
    },
    [],
  );

  const clearFailure = React.useCallback(() => {
    failureRef.current = null;
    setFailure(null);
  }, []);

  /** Resolves once everything queued so far has finished, with the failure (if any) it ended in. */
  const whenIdle = React.useCallback(async (): Promise<QueueFailure> => {
    await chain.current;
    return failureRef.current;
  }, []);

  return { pending, failure, enqueue, observe, clearFailure, whenIdle };
}
