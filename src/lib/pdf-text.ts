import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_PDF_EXTRACT_CHARS = 500_000

/**
 * Extract plain text from a PDF in the browser (for chat context).
 */
export async function extractTextFromPdfArrayBuffer(data: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const chunks: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    const line = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
    chunks.push(line)
    const joined = chunks.join('\n\n')
    if (joined.length >= MAX_PDF_EXTRACT_CHARS) {
      return joined.slice(0, MAX_PDF_EXTRACT_CHARS)
    }
  }
  return chunks.join('\n\n').trim()
}
