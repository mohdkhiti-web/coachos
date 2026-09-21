import "server-only";
import type { Actor } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";

/** Thrown inside a transaction to roll it back with an expected failure (a returned Result does not roll back). */
class Abort extends Error {
  constructor(readonly failure: Result<never>) {
    super("aborted");
  }
}

/**
 * A tenant transaction whose failed Result rolls everything back: a command returns `fail(...)` from anywhere inside
 * and nothing it wrote survives, while a real error still propagates.
 */
export async function inTx<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await tenantTx(actor, async (tx) => {
      const result = await fn(tx);
      if (!result.ok) throw new Abort(result);
      return result;
    });
  } catch (err) {
    if (err instanceof Abort) return err.failure;
    throw err;
  }
}
