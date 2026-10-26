export class EditorError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'EDITOR_INVALID', readonly details: Record<string, unknown> = {}) { super(message) }
}
