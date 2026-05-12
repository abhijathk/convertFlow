// Loads pdfjs v3 from CDN as a Blob URL so pdfjs never sees Vite's process polyfill.
// Vite injects process into the page; pdfjs v3 (and v5) checks process+"" === "[object process]"
// to detect Node.js, then calls require("canvas") — which throws in the browser.
// Wrapping the source in an IIFE that shadows process+require prevents this entirely.
const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let loading: Promise<any> | null = null;

export async function loadPdfJs(): Promise<any> {
  const win = window as any;
  if (win.pdfjsLib) return win.pdfjsLib;
  if (loading) return loading;

  loading = (async () => {
    const res = await fetch(`${PDFJS_BASE}/pdf.min.js`);
    if (!res.ok) throw new Error(`Failed to fetch pdf.js: HTTP ${res.status}`);
    const source = await res.text();

    // Shadow process and require so pdfjs sees isNodeJS=false and never calls require()
    const wrapped =
      `;(function(process,require){${source}})` +
      `({env:{},versions:{},toString:function(){return'[object Object]';}},undefined);`;

    await new Promise<void>((resolve, reject) => {
      const blob = new Blob([wrapped], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => { URL.revokeObjectURL(url); resolve(); };
      script.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to execute pdf.js')); };
      document.head.appendChild(script);
    });

    win.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
    return win.pdfjsLib;
  })();

  return loading;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const t = content.items.map((item: any) => item.str ?? '').join(' ').trim();
    pageTexts.push(t);
  }

  return pageTexts.join('\n\n').trim();
}

export async function extractPdfTextWithOcr(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageTexts: string[] = [];
  const ocrPages: number[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`reading page ${i}/${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const t = content.items.map((item: any) => item.str ?? '').join(' ').trim();
    pageTexts.push(t);
    if (!t) ocrPages.push(i);
  }

  if (ocrPages.length > 0) {
    onProgress?.(`OCR ${ocrPages.length} page${ocrPages.length > 1 ? 's' : ''}…`);
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    for (let idx = 0; idx < ocrPages.length; idx++) {
      const pageNum = ocrPages[idx];
      onProgress?.(`OCR page ${idx + 1}/${ocrPages.length}…`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const { data: { text } } = await worker.recognize(canvas);
      pageTexts[pageNum - 1] = text.trim();
    }
    await worker.terminate();
  }

  return pageTexts.join('\n\n').trim();
}
