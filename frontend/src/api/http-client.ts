import type { RequestOptions } from '../types/auth'
import { ApiError, isAbortError } from './errors'

function parseError(value: unknown, status: number): ApiError {
  if (typeof value === 'object' && value !== null && 'code' in value && 'message' in value &&
    typeof value.code === 'string' && typeof value.message === 'string') {
    const fields = 'fields' in value && typeof value.fields === 'object' && value.fields !== null &&
      Object.values(value.fields).every(field => typeof field === 'string')
      ? value.fields as Record<string, string> : undefined
    return new ApiError(status, { code: value.code, message: value.message, fields })
  }
  return new ApiError(status, { code: 'UNEXPECTED_RESPONSE', message: 'Сервер вернул неожиданный ответ. Повторите попытку.' })
}

export function createHttpClient(baseUrl = '/api') {
  async function request<T>(path: string, method: string, options: RequestOptions = {}, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: options.signal,
        headers: body === undefined ? { Accept: 'application/json' } : {
          Accept: 'application/json', 'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.' })
    }
    if (response.status === 204 && response.ok) return undefined as T
    const data: unknown = await response.json().catch((error: unknown) => {
      if (isAbortError(error)) throw error
      return null
    })
    if (!response.ok) throw parseError(data, response.status)
    if (data === null) throw parseError(null, response.status)
    return data as T
  }

  return request
}
