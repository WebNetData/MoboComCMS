'use client'
import type { LibraryFolder } from '@/modules/media/domain/library'
export default function FolderTree({ folders, selected, onSelect, parent = null, depth = 0 }: { folders: LibraryFolder[]; selected: string; onSelect: (value: string) => void; parent?: number | null; depth?: number }) {
  if (depth > 50) return null
  return <ul className="mcl-folder-tree">{folders.filter(f => f.parentId === parent).map(f => <li key={f.id}><button type="button" aria-current={selected === String(f.id) ? 'true' : undefined} onClick={() => onSelect(String(f.id))}><span aria-hidden="true">▱</span><span>{f.name}</span></button><FolderTree folders={folders} selected={selected} onSelect={onSelect} parent={f.id} depth={depth + 1} /></li>)}</ul>
}
