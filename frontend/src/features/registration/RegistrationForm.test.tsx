// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { RegisterResponse, User } from '../../types/auth'
import { RegistrationForm } from './RegistrationForm'

const { register, acceptUser } = vi.hoisted(() => ({ register: vi.fn(), acceptUser: vi.fn() }))
vi.mock('../../api/client', () => ({ authApi: { register } }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ acceptUser }) }))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

function renderForm() {
  const props = {
    onFeedback: vi.fn(), onPasswordVisibility: vi.fn(), onAttention: vi.fn(), onCorrection: vi.fn(),
  }
  render(<MemoryRouter><RegistrationForm {...props} /></MemoryRouter>)
  return props
}

describe('RegistrationForm', () => {
  it('commits error descriptions before focusing the first invalid field, including repeated submissions', () => {
    const props = renderForm()
    const login = screen.getByLabelText('Логин')
    const password = screen.getByLabelText('Пароль')
    const form = screen.getByRole('form', { name: 'Создать аккаунт' })
    const focusedStates: Array<{ invalid: string | null; describedBy: string | null; hasError: boolean }> = []
    login.addEventListener('focus', () => {
      focusedStates.push({
        invalid: login.getAttribute('aria-invalid'),
        describedBy: login.getAttribute('aria-describedby'),
        hasError: document.getElementById('login-error') !== null,
      })
    })

    fireEvent.submit(form)
    expect(document.activeElement).toBe(login)
    expect(focusedStates).toEqual([{ invalid: 'true', describedBy: 'login-hint login-error', hasError: true }])

    act(() => { password.focus() })
    fireEvent.submit(form)
    expect(document.activeElement).toBe(login)
    expect(focusedStates).toHaveLength(2)
    expect(focusedStates[1]).toEqual(focusedStates[0])
    expect(props.onFeedback.mock.calls).toEqual([['error'], ['error']])
    expect(register).not.toHaveBeenCalled()
  })

  it('blocks duplicate submission while pending, then clears the password and focuses the profile link', async () => {
    const pending = deferred<RegisterResponse>()
    register.mockReturnValue(pending.promise)
    const props = renderForm()
    const form = screen.getByRole('form', { name: 'Создать аккаунт' })
    const login = screen.getByLabelText('Логин') as HTMLInputElement
    const password = screen.getByLabelText('Пароль') as HTMLInputElement
    fireEvent.change(login, { target: { value: 'pilot_04' } })
    fireEvent.change(password, { target: { value: 'Workshop!42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Показать пароль' }))

    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toEqual({ login: 'pilot_04', password: 'Workshop!42' })
    expect(register.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(login.readOnly).toBe(true)
    expect(password.readOnly).toBe(true)
    expect((screen.getByRole('button', { name: 'Создаём аккаунт…' }) as HTMLButtonElement).disabled).toBe(true)

    const user: User = {
      id: '11111111-1111-4111-8111-111111111111', login: 'pilot_04',
      roles: ['operator'], permissions: ['runs:read'],
    }
    await act(async () => { pending.resolve({ message: 'Аккаунт создан.', user }) })
    expect(acceptUser).toHaveBeenCalledExactlyOnceWith(user)
    expect(password.value).toBe('')
    expect(password.type).toBe('password')
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Открыть кабинет' }))
    expect(props.onPasswordVisibility).toHaveBeenLastCalledWith(false)
    expect(props.onFeedback.mock.calls).toEqual([['pending'], ['success']])
  })
})
