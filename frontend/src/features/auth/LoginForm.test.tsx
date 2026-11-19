// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import type { User } from '../../types/auth'
import { LoginForm } from './LoginForm'

const { login, acceptUser } = vi.hoisted(() => ({ login: vi.fn(), acceptUser: vi.fn() }))
vi.mock('../../api/client', () => ({ authApi: { login } }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ acceptUser }) }))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const user: User = {
  id: '11111111-1111-4111-8111-111111111111', login: 'pilot_04',
  roles: ['operator'], permissions: ['runs:read'],
}

function renderForm() {
  const props = {
    onFeedback: vi.fn(), onPasswordVisibility: vi.fn(), onAttention: vi.fn(), onCorrection: vi.fn(),
  }
  const view = render(<MemoryRouter><LoginForm {...props} /></MemoryRouter>)
  return { ...view, props }
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'pilot_04' } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Workshop!42' } })
}

describe('LoginForm', () => {
  it('keeps a credential mismatch general and accepts a corrected password on retry', async () => {
    login.mockRejectedValueOnce(new ApiError(401, { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' }))
      .mockResolvedValueOnce(user)
    const { props } = renderForm()
    fillCredentials()
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Войти в аккаунт' })) })
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Неверный логин или пароль.')
    expect(status.classList.contains('global-error')).toBe(true)
    expect(screen.getByLabelText('Логин').getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByLabelText('Пароль').getAttribute('aria-invalid')).toBe('false')
    expect(acceptUser).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Workshop!43' } })
    fireEvent.click(screen.getByRole('button', { name: 'Показать пароль' }))
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Войти в аккаунт' })) })
    const password = screen.getByLabelText('Пароль') as HTMLInputElement
    expect(acceptUser).toHaveBeenCalledExactlyOnceWith(user)
    expect(password.value).toBe('')
    expect(password.type).toBe('password')
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Открыть кабинет' }))
    expect(props.onPasswordVisibility).toHaveBeenLastCalledWith(false)
    expect(props.onFeedback.mock.calls).toEqual([['pending'], ['error'], ['idle'], ['pending'], ['success']])
  })

  it('focuses committed validation errors on every invalid submission without sending a request', () => {
    const { props } = renderForm()
    const form = screen.getByRole('form', { name: 'Войти в аккаунт' })
    fireEvent.submit(form)
    const input = screen.getByLabelText('Логин')
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('login-username-error')
    expect(document.getElementById('login-username-error')).not.toBeNull()
    act(() => { screen.getByLabelText('Пароль').focus() })
    fireEvent.submit(form)
    expect(document.activeElement).toBe(input)
    expect(props.onFeedback.mock.calls).toEqual([['error'], ['error']])
    expect(login).not.toHaveBeenCalled()
  })

  it('blocks concurrent submission and ignores a late login result after unmount', async () => {
    let resolve!: (value: User) => void
    login.mockReturnValue(new Promise<User>(settle => { resolve = settle }))
    const { unmount, props } = renderForm()
    fillCredentials()
    const form = screen.getByRole('form', { name: 'Войти в аккаунт' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(login).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Пароль') as HTMLInputElement).readOnly).toBe(true)
    const signal = login.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve(user) })
    expect(acceptUser).not.toHaveBeenCalled()
    expect(props.onFeedback.mock.calls).toEqual([['pending']])
  })
})
