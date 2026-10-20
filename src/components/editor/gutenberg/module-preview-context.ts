import { createContext } from 'react'

/** Document-scoped guarded endpoint, never a token or a global current-document variable. */
export const ModulePreviewContext = createContext('')
/** The section being edited (pages | posts), for reading its pattern library. */
export const EditorEntityContext = createContext('')
