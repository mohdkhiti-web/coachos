/**
 * `npm run dev` preflight (runs automatically as the `predev` script).
 *
 * The local database is an embedded PostgreSQL started by `npm run db:dev`, in its own terminal. When it
 * is not running, every page fails with a raw `ECONNREFUSED 127.0.0.1:54329`. Say what is wrong and how
 * to fix it instead. Only LOCAL databases are checked; a hosted URL (Neon) is left alone.
 */
import { readFileSync } from "node:fs";
import { connect } from "node:net";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** DATABASE_URL from the environment, else from `.env.local` (which Next loads for `next dev`). */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    return line
      ?.slice("DATABASE_URL=".length)
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

function accepts(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2000 });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  const raw = databaseUrl();
  if (!raw) return; // missing configuration is reported, with its own message, by src/lib/env.ts
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return; // ditto: a malformed URL is env validation's job
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || 5432);
  if (await accepts(host, port)) return;

  console.error(
    [
      "",
      `✖ The local database is not running (nothing is listening on ${host}:${port}).`,
      "",
      "  Start it first, in a separate terminal, and leave that terminal open:",
      "",
      "      npm run db:dev",
      "",
      "  Then run `npm run dev` again.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

void main();
