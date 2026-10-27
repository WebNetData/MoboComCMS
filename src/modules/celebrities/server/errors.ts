export class CelebrityError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}
