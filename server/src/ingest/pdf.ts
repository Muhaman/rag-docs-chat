import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "../errors.js";

export interface PdfPage {
  page: number;
  text: string;
}

export async function extractPages(data: Buffer): Promise<PdfPage[]> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
  } catch {
    throw new AppError(400, "invalid_pdf", "The file could not be parsed as a PDF.");
  }
}
