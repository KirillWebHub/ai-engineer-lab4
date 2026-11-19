import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../types/auth'
import { createHttpAuthApi } from './http-auth'

afterEach(() => vi.unstubAllGlobals())

const user: User = {
  id: '11111111-1111-4111-8111-111111111111', login: 'pilot_04',
  roles: ['operator'], permissions: ['runs:read'],
}

describe('HTTP auth contract', () => {
  it('sends password login and demo to the contracted routes with the exact bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(user))
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpAuthApi()
    const controller = new AbortController()
    const login = { login: 'pilot_04', password: ' Workshop!42 ' }
    expect(await api.login(login, { signal: controller.signal })).toEqual(user)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/login', expect.objectContaining({
      method: 'POST', body: JSON.stringify(login), credentials: 'same-origin', cache: 'no-store',
      signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    }))
    expect(await api.demo({ profile: 'architect_01' })).toEqual(user)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/demo', expect.objectContaining({
      method: 'POST', body: '{"profile":"architect_01"}', credentials: 'same-origin',
    }))
  })

  it('preserves backend error codes and field messages for the form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      code: 'VALIDATION_ERROR', message: 'Проверьте поля.', fields: { login: 'Недопустимый логин.' },
    }, { status: 422 })))
    await expect(createHttpAuthApi().login({ login: 'x', password: 'x' })).rejects.toMatchObject({
      status: 422, code: 'VALIDATION_ERROR', message: 'Проверьте поля.', fields: { login: 'Недопустимый логин.' },
    })
  })

  it('passes through cancellation rather than reporting it as a network or credentials error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
    await expect(createHttpAuthApi().demo({ profile: 'student' })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
