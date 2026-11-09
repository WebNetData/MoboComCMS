'use client'

import { useEffect } from 'react'

const ran = new Set<string>()

/** Runs one component instance's script once per page load; the script finds its own root by instance id. */
export default function ComponentScript({ code }: { code: string }) {
  useEffect(() => {
    if (ran.has(code)) return
    ran.add(code)
    const script = document.createElement('script')
    script.dataset.component = ''
    script.textContent = code
    document.body.appendChild(script)
  }, [code])
  return null
}
