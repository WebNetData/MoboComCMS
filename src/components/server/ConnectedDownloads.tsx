'use client'
import { ServerShell } from '@/app/admin/server/shared'
import DownloadCenter from './downloads/DownloadCenter'
import type { Entry } from './downloads/types'
export default function ConnectedDownloads({ initialPath, onPick }: { initialPath?: string; onPick?: (entry: Entry) => void }) {
  return <ServerShell title="فضاهای ذخیره و آرشیوها"><DownloadCenter initialPath={initialPath} onPick={onPick} /></ServerShell>
}
