import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { canRetryProtocolError } from './useProtocolResource'

describe('protocol error recovery', () => {
  it('offers retry for a disconnected HTTP request and server failure', () => {
    expect(canRetryProtocolError(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Нет сети.' }))).toBe(true)
    expect(canRetryProtocolError(new ApiError(503, { code: 'UNAVAILABLE', message: 'Сбой.' }))).toBe(true)
    expect(canRetryProtocolError(new Error('Connection lost'))).toBe(true)
  })
  it('does not retry authentication, permissions, missing records or invalid requests', () => {
    for (const status of [401, 403, 404, 422]) expect(canRetryProtocolError(new ApiError(status, { code: 'ERROR', message: 'Ошибка.' }))).toBe(false)
  })
})
