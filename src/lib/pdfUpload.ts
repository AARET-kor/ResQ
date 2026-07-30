export const MAX_PDF_MEGABYTES = 50
export const MAX_PDF_BYTES = MAX_PDF_MEGABYTES * 1024 * 1024

export function validatePdfUpload(file: File): string | null {
  if (file.type !== 'application/pdf') return 'PDF 파일만 업로드할 수 있습니다.'
  if (file.size > MAX_PDF_BYTES) {
    return `PDF는 ${MAX_PDF_MEGABYTES}MB 이하만 업로드할 수 있습니다.`
  }
  return null
}

export async function pdfFileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = String.fromCharCode(...bytes.slice(0, 5))
  if (signature !== '%PDF-') throw new Error('올바른 PDF 파일이 아닙니다.')

  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
