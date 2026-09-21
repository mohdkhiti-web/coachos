import { documentFontClass } from "@/lib/document-fonts";

export default function DocumentLayout({
  children,
}: LayoutProps<"/sessions/[sport]/[id]/document">) {
  return <div className={documentFontClass}>{children}</div>;
}
