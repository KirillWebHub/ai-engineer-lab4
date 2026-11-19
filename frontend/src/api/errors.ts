export interface ApiErrorData {
  code: string
  message: string
  fields?: Record<string, string>
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(status: number, data: ApiErrorData) {
    super(data.message)
    this.name = 'ApiError'
    this.status = status
    this.code = data.code
    this.fields = data.fields
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
