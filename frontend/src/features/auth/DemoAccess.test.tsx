// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '../../types/auth'
import { DemoAccess } from './DemoAccess'

const { demo, acceptUser } = vi.hoisted(() => ({ demo: vi.fn(), acceptUser: vi.fn() }))
vi.mock('../../api/client', () => ({ authApi: { demo } }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ acceptUser }) }))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function renderDemo() {
  const props = {
    onFeedback: vi.fn(), onPasswordVisibility: vi.fn(), onAttention: vi.fn(), onCorrection: vi.fn(),
  }
  const view = render(<MemoryRouter><DemoAccess {...props} /></MemoryRouter>)
  return { ...view, props }
}

describe('DemoAccess', () => {
  it('submits the selected demo profile and displays the roles actually returned by the API', async () => {
    const user: User = {
      id: '33333333-3333-4333-8333-333333333333', login: 'architect_01',
      roles: ['operator'], permissions: ['runs:read'],
    }
    demo.mockResolvedValue(user)
    const { props } = renderDemo()
    const architect = screen.getByRole('radio', { name: 'Архитектор, architect_01' }) as HTMLInputElement
    fireEvent.click(architect)
    expect(architect.checked).toBe(true)
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Демо-доступ' })) })
    expect(demo.mock.calls[0][0]).toEqual({ profile: 'architect_01' })
    expect(acceptUser).toHaveBeenCalledExactlyOnceWith(user)
    expect(screen.getByRole('status').textContent).toContain('Роли: Оператор.')
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Открыть кабинет' }))
    expect(props.onFeedback.mock.calls).toEqual([['pending'], ['success']])
  })

  it('locks profile selection while pending and aborts without accepting a late result', async () => {
    let resolve!: (value: User) => void
    demo.mockReturnValue(new Promise<User>(settle => { resolve = settle }))
    const { unmount, props } = renderDemo()
    fireEvent.click(screen.getByRole('radio', { name: 'Диагност, diagnostics_01' }))
    const form = screen.getByRole('form', { name: 'Демо-доступ' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(demo).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('group', { name: 'Демонстрационный профиль' }) as HTMLFieldSetElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Открываем демо-аккаунт…' }) as HTMLButtonElement).disabled).toBe(true)
    const signal = demo.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      resolve({ id: '22222222-2222-4222-8222-222222222222', login: 'diagnostics_01', roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'] })
    })
    expect(acceptUser).not.toHaveBeenCalled()
    expect(props.onFeedback.mock.calls).toEqual([['pending']])
  })
})
