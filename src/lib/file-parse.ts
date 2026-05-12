// File parsing — single function handles all formats supported across the app.
// Reuses CDN pdfjs (pdf-loader.ts), tesseract.js, mammoth, xlsx.
// Used by ChunkTab, ConvertImportPanel, and EditorTab.

import { extractPdfText, extractPdfTextWithOcr } from './pdf-loader';

export type ParseProgress = (msg: string) => void;

export interface ParseOptions {
  enableOcr?: boolean;       // OCR scanned PDF pages
  enableImages?: boolean;    // OCR PNG/JPG/etc image files
  onProgress?: ParseProgress;
}

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'json', 'jsonl']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']);

export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function isSupported(filename: string, opts: { enableImages?: boolean } = {}): boolean {
  const ext = getExtension(filename);
  if (TEXT_EXTS.has(ext)) return true;
  if (['csv', 'docx', 'pdf', 'xlsx', 'xls'].includes(ext)) return true;
  if (opts.enableImages && IMAGE_EXTS.has(ext)) return true;
  return false;
}

// CSV → readable text helper
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(field); field = ''; }
      else { field += ch; }
    }
  }
  fields.push(field);
  return fields;
}

function csvToText(raw: string): string {
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return raw;
  const headers = parseCsvRow(lines[0]);
  const records: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvRow(lines[i]);
    const parts = headers.map((h, j) => {
      const v = (vals[j] ?? '').trim();
      return v ? `${h.trim()}: ${v}` : null;
    }).filter(Boolean);
    if (parts.length > 0) records.push(parts.join(' | '));
  }
  return records.join('\n');
}

// Main parse function
export async function parseFile(file: File, opts: ParseOptions = {}): Promise<string> {
  const ext = getExtension(file.name);
  const { enableOcr = false, enableImages = false, onProgress } = opts;

  if (TEXT_EXTS.has(ext)) {
    return file.text();
  }

  if (ext === 'csv') {
    const raw = await file.text();
    return csvToText(raw);
  }

  if (ext === 'docx') {
    onProgress?.(`reading ${file.name}…`);
    const { default: mammoth } = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    let text = result.value;

    if (enableOcr) {
      const images: { contentType: string; data: string }[] = [];
      try {
        await mammoth.convertToHtml({ arrayBuffer: buffer }, {
          convertImage: mammoth.images.imgElement(async (image: any) => {
            try {
              const data = await image.read('base64');
              images.push({ contentType: image.contentType || 'image/png', data });
            } catch {}
            return { src: '' };
          }),
        });
      } catch {}
      if (images.length > 0) {
        onProgress?.(`OCR ${images.length} image${images.length > 1 ? 's' : ''} in ${file.name}…`);
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const ocrTexts: string[] = [];
        for (let i = 0; i < images.length; i++) {
          onProgress?.(`OCR image ${i + 1}/${images.length} in ${file.name}…`);
          try {
            const { data: { text: t } } = await worker.recognize(`data:${images[i].contentType};base64,${images[i].data}`);
            if (t.trim()) ocrTexts.push(t.trim());
          } catch {}
        }
        await worker.terminate();
        if (ocrTexts.length > 0) {
          text = text.trim() ? `${text}\n\n${ocrTexts.join('\n\n')}` : ocrTexts.join('\n\n');
        }
      }
    }
    return text;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    onProgress?.(`reading ${file.name}…`);
    if (file.size > 5_000_000) throw new Error('XLSX too large (max 5MB) — open in spreadsheet app first');
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    let cellCount = 0;
    for (const sheet of Object.values(wb.Sheets) as any[]) {
      cellCount += Object.keys(sheet).filter(k => !k.startsWith('!')).length;
    }
    if (cellCount > 100_000) throw new Error('XLSX has too many cells (max 100,000)');
    return wb.SheetNames.map((name: string) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return wb.SheetNames.length > 1 ? `--- ${name} ---\n${csv}` : csv;
    }).join('\n\n');
  }

  if (ext === 'pdf') {
    onProgress?.(`loading ${file.name}…`);
    if (enableOcr) {
      return extractPdfTextWithOcr(file, onProgress);
    }
    return extractPdfText(file);
  }

  if (enableImages && IMAGE_EXTS.has(ext)) {
    onProgress?.(`OCR ${file.name}…`);
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const blobUrl = URL.createObjectURL(file);
    try {
      const { data: { text: ocrText } } = await worker.recognize(blobUrl);
      return ocrText.trim();
    } finally {
      URL.revokeObjectURL(blobUrl);
      await worker.terminate();
    }
  }

  throw new Error(`${ext.toUpperCase()} not supported`);
}
