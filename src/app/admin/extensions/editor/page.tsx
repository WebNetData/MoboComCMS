import { Suspense } from 'react'
import PackageEditor from './PackageEditor'

export default function PackageEditorPage() {
  return <Suspense fallback={null}><PackageEditor/></Suspense>
}
