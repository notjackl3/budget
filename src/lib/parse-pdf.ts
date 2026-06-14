// Server-only: PDF buffer -> text -> parsed statement.
import "server-only";
// Import the implementation directly to avoid pdf-parse's index.js debug shim,
// which reads a bundled sample file at import time and breaks in bundlers.
import pdf from "pdf-parse/lib/pdf-parse.js";
import { parseStatementText, type ParsedStatement } from "./parse-statement";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text as string;
}

export async function parseStatementPdf(
  buffer: Buffer,
): Promise<ParsedStatement> {
  const text = await extractPdfText(buffer);
  return parseStatementText(text);
}
