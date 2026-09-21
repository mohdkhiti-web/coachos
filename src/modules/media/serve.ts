import type { LogoFile } from "./dto";

/**
 * How a stored image leaves the app. Defence in depth around the parsers: the type is the one we decided (never
 * sniffed), `nosniff` stops a browser second-guessing it, and the response carries its own CSP — an SVG opened directly
 * gets no scripts, no styles from outside, and no network at all (`sandbox` + `default-src 'none'`).
 * The bytes never change for an id, so the SHA-256 is a perfect validator (`304` on revisit).
 */
export function imageResponse(request: Request, file: LogoFile): Response {
  const etag = `"${file.sha256}"`;
  const headers = new Headers({
    "content-type": file.mime,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "content-disposition": "inline",
    etag,
    // private: it is behind a session (or a share link); short, so a deleted logo stops showing soon
    "cache-control": "private, max-age=300",
  });
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  headers.set("content-length", String(file.bytes.length));
  return new Response(new Uint8Array(file.bytes), { headers });
}
