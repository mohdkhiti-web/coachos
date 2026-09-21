import type { Metadata } from "next";
import { documentFontClass } from "@/lib/document-fonts";

/**
 * The public shared-session area (Step 7). No app shell, no account: just the document, in the document typefaces.
 * Never indexed, never cached, and it sends no referrer (the address itself is the secret).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SharedLayout({ children }: LayoutProps<"/s">) {
  return <div className={documentFontClass}>{children}</div>;
}
