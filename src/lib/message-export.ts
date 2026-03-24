import { Document, Packer, Paragraph, TextRun } from 'docx'
import { jsPDF } from 'jspdf'

/** Rough plain text for TTS / exports (not perfect markdown stripping). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportMarkdownFile(markdown: string, baseName: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${baseName}.md`)
}

export function exportPdf(markdown: string, baseName: string) {
  const plain = markdownToPlainText(markdown)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 15
  const maxW = pageW - margin * 2
  const lines = doc.splitTextToSize(plain, maxW)
  let y = 20
  const lineH = 6
  for (let i = 0; i < lines.length; i++) {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage()
      y = 20
    }
    doc.text(lines[i], margin, y)
    y += lineH
  }
  doc.save(`${baseName}.pdf`)
}

export async function exportDocx(markdown: string, baseName: string) {
  const plain = markdownToPlainText(markdown)
  const blocks = plain.split(/\n+/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line || ' ')],
      })
  )
  const document = new Document({
    sections: [
      {
        properties: {},
        children: blocks.length > 0 ? blocks : [new Paragraph({ children: [new TextRun(' ')] })],
      },
    ],
  })
  const blob = await Packer.toBlob(document)
  downloadBlob(blob, `${baseName}.docx`)
}
