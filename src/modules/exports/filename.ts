/**
 * The name of a downloaded file, from a session's title. Pure and client-safe.
 *
 * A title is free text from a user, so it never reaches a header untouched: control characters, path separators and
 * quotes are removed, whitespace is collapsed, and the length is capped. `contentDisposition` gives both an ASCII
 * fallback and the real name (RFC 6266 / 5987), so accents survive in every browser that understands `filename*`.
 */

const MAX_BASE = 80;

/** A safe base name (no extension): letters, digits, spaces, dots, hyphens and underscores, any script. */
export function safeBaseName(title: string, fallback: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, " ") // control characters
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "") // invisible and bidi-override characters
    .replace(/[\\/:*?"<>|%;,\u2028\u2029]/g, " ") // path separators, reserved and header-significant characters
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s]+$/g, "") // no leading dots (hidden files, "..") and no trailing dots or spaces
    .slice(0, MAX_BASE)
    .trim();
  return cleaned || fallback;
}

/** Fold accents and replace anything that is not plain ASCII, for the legacy `filename=` parameter. */
export function asciiName(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return folded.trim() || "download";
}

export function pdfFileName(title: string, fallback = "session"): string {
  return `${safeBaseName(title, fallback)}.pdf`;
}

/** `attachment; filename="…"; filename*=UTF-8''…` — the real name percent-encoded, plus a plain-ASCII fallback. */
export function contentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName(fileName)}"; filename*=UTF-8''${encoded}`;
}
