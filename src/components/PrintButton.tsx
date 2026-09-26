'use client'

export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
      🖨 {label}
    </button>
  )
}
