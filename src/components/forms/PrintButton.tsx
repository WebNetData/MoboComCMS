'use client'

/** Prints the page (receipts keep only the sheet in print). */
export default function PrintButton({ label = 'چاپ رسید' }: { label?: string }) {
  return <button type="button" className="btn btn-ghost" onClick={() => window.print()}>{label}</button>
}
