// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../types/auth'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const { me, logout } = vi.hoisted(() => ({ me: vi.fn(), logout: vi.fn() }))
vi.mock('../api/client', () => ({ authApi: { me, logout } }))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

function SessionConsumer() {
  const auth = useAuth()
  return <>
    <output aria-label="Пользователь">{auth.user?.login ?? 'Гость'}</output>
    <output aria-label="Восстановление">{String(auth.restoring)}</output>
    <button onClick={() => { void auth.logout() }}>Выйти</button>
  </>
}

const user: User = {
  id: '11111111-1111-4111-8111-111111111111', login: 'pilot_04',
  roles: ['operator'], permissions: ['runs:read'],
}

describe('AuthProvider session races', () => {
  it('does not restore a session when the window gains focus during logout', async () => {
    const leaving = deferred<void>()
    me.mockResolvedValue(user)
    logout.mockReturnValue(leaving.promise)
    await act(async () => { render(<AuthProvider><SessionConsumer /></AuthProvider>) })
    expect(screen.getByLabelText('Пользователь').textContent).toBe('pilot_04')

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    fireEvent(window, new Event('focus'))
    fireEvent(window, new Event('focus'))
    expect(me).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledTimes(1)

    await act(async () => { leaving.resolve() })
    expect(screen.getByLabelText('Пользователь').textContent).toBe('Гость')
    expect(screen.getByLabelText('Восстановление').textContent).toBe('false')
  })

  it('ignores a late /me response after logout even if the transport does not honour abort', async () => {
    const restoring = deferred<User>()
    const leaving = deferred<void>()
    me.mockReturnValue(restoring.promise)
    logout.mockReturnValue(leaving.promise)
    render(<AuthProvider><SessionConsumer /></AuthProvider>)
    const signal: AbortSignal = me.mock.calls[0][0].signal

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signal.aborted).toBe(true)
    await act(async () => { leaving.resolve() })
    await act(async () => { restoring.resolve(user) })
    expect(screen.getByLabelText('Пользователь').textContent).toBe('Гость')
    expect(screen.getByLabelText('Восстановление').textContent).toBe('false')
    expect(me).toHaveBeenCalledTimes(1)
  })
})
