import { describe, expect, it } from 'vitest'
import {
  MAX_PDF_BYTES,
  MAX_PDF_MEGABYTES,
  pdfFileToBase64,
  validatePdfUpload,
} from './pdfUpload'

describe('PDF upload controls', () => {
  it('rejects non-PDF MIME types', () => {
    const file = new File(['%PDF-1.7'], 'paper.txt', { type: 'text/plain' })
    expect(validatePdfUpload(file)).toMatch(/PDF 파일만/)
  })

  it('rejects files larger than 50MB before reading them', () => {
    expect(MAX_PDF_MEGABYTES).toBe(50)
    const file = new File([new Uint8Array(MAX_PDF_BYTES + 1)], 'large.pdf', {
      type: 'application/pdf',
    })
    expect(validatePdfUpload(file)).toMatch(/50MB/)
  })

  it('rejects a spoofed PDF without the PDF signature', async () => {
    const file = new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })
    await expect(pdfFileToBase64(file)).rejects.toThrow(/올바른 PDF/)
  })

  it('encodes a valid PDF in bounded chunks', async () => {
    const file = new File(['%PDF-1.7\nbody'], 'paper.pdf', { type: 'application/pdf' })
    expect(atob(await pdfFileToBase64(file))).toBe('%PDF-1.7\nbody')
  })
})
