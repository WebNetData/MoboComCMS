'use client'

/** Prints the document (or saves it as PDF from the print dialog). */
export default function PrintButton({ className, label = 'چاپ یا ذخیرهٔ PDF' }: { className?: string; label?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>
}
