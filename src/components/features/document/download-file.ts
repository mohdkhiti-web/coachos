/**
 * Fetching an export and handing it to the browser as a download. The server names the file (RFC 5987 `filename*`);
 * a failure comes back as `{ error: { code, fields? } }` and is returned, not thrown, so the caller can say it in words.
 */

export type FetchedFile =
  | { ok: true; blob: Blob; fileName: string }
  | { ok: false; code: string; fields?: Record<string, string[]> };

export async function fetchFile(path: string, fallbackName: string): Promise<FetchedFile> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; fields?: Record<string, string[]> };
    } | null;
    return { ok: false, code: body?.error?.code ?? "INTERNAL", fields: body?.error?.fields };
  }
  const named = /filename\*=UTF-8''([^;]+)/i.exec(res.headers.get("content-disposition") ?? "");
  return {
    ok: true,
    blob: await res.blob(),
    fileName: named?.[1] ? decodeURIComponent(named[1]) : fallbackName,
  };
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
