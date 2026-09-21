import { PDFDocument } from "pdf-lib";

/**
 * The document information of an exported PDF (what a PDF reader shows under "Properties"). Chromium writes its own
 * (a title taken from the page, a Skia producer); this replaces it with what a coach expects to see, and — just as
 * important — with nothing internal: no ids, no addresses, no workspace names. Only what is already printed on the
 * document itself (its title, coach and objectives) goes in.
 */

export interface PdfMeta {
  title: string;
  /** The coach named on the session, or empty. Never the account holder's name or email. */
  author: string;
  subject: string;
  keywords: string[];
  created: Date;
}

const clip = (s: string, n: number) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, n);

export async function stampPdf(bytes: Buffer, meta: PdfMeta): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false });
  pdf.setTitle(clip(meta.title, 200), { showInWindowTitleBar: true });
  pdf.setAuthor(clip(meta.author, 120));
  pdf.setSubject(clip(meta.subject, 200));
  pdf.setKeywords(
    meta.keywords
      .map((k) => clip(k, 40))
      .filter(Boolean)
      .slice(0, 12),
  );
  pdf.setCreator("CoachOS");
  pdf.setProducer("CoachOS PDF export");
  pdf.setLanguage("en");
  pdf.setCreationDate(meta.created);
  pdf.setModificationDate(meta.created);
  return Buffer.from(await pdf.save());
}
