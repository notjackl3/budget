// pdf-parse ships types for its package root but not the deep implementation
// path we import (to bypass its index.js debug shim).
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }
  function pdf(dataBuffer: Buffer, options?: unknown): Promise<PDFData>;
  export default pdf;
}
