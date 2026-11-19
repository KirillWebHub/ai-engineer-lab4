// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../types/auth'
import type { Role } from '../../types/workspace'
import { ParticipantsPage } from './ParticipantsPage'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(), listRoles: vi.fn(), setUserRoles: vi.fn(), me: vi.fn(),
  acceptUser: vi.fn(), feedback: vi.fn(), user: null as User | null,
}))

vi.mock('../../api/client', () => ({
  authApi: { me: mocks.me },
  workspaceApi: { listUsers: mocks.listUsers, listRoles: mocks.listRoles, setUserRoles: mocks.setUserRoles },
}))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ user: mocks.user, acceptUser: mocks.acceptUser }) }))
vi.mock('../../components/workspace/workspace-feedback', () => ({ useWorkspaceFeedback: () => mocks.feedback }))
vi.mock('../../components/workspace/WorkspaceState', () => ({
  WorkspaceState({ loading, error, children }: { loading?: boolean; error?: unknown; children?: ReactNode }) {
    if (loading) return <p role="status">Загрузка участников</p>
    if (error) return <p role="alert">{error instanceof Error ? error.message : 'Ошибка'}</p>
    return <>{children}</>
  },
}))

const architect: User = {
  id: '33333333-3333-4333-8333-333333333333', login: 'architect_01', roles: ['architect'],
  permissions: ['runs:read', 'runs:review', 'roles:manage'],
}
const operator: User = {
  id: '11111111-1111-4111-8111-111111111111', login: 'operator_01', roles: ['operator'], permissions: ['runs:read'],
}
const roles: Role[] = [
  { id: 'operator', label: 'Оператор', description: 'Читает протоколы.', permissions: ['runs:read'] },
  { id: 'diagnostician', label: 'Диагност', description: 'Проверяет протоколы.', permissions: ['runs:read', 'runs:review'] },
  { id: 'architect', label: 'Архитектор', description: 'Назначает роли.', permissions: ['runs:read', 'runs:review', 'roles:manage'] },
]

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = architect
  mocks.listUsers.mockResolvedValue([architect, operator])
  mocks.listRoles.mockResolvedValue(roles)
  mocks.me.mockResolvedValue(architect)
})

function Destination() {
  const location = useLocation()
  const state = location.state as { notice?: string } | null
  return <p role="status">{state?.notice ?? 'Журнал протоколов'}</p>
}

function PageHarness() {
  return <MemoryRouter initialEntries={['/workspace/users']}>
    <Routes>
      <Route path="/workspace/users" element={<ParticipantsPage />} />
      <Route path="/workspace/protocols" element={<Destination />} />
    </Routes>
  </MemoryRouter>
}

function renderPage() {
  return render(<PageHarness />)
}

async function selectOperator() {
  fireEvent.click(await screen.findByRole('button', { name: /operator_01/ }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

describe('ParticipantsPage role assignments', () => {
  it('denies a direct route to an Operator without requesting protected participant data', () => {
    mocks.user = operator
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain('правом управления участниками')
    expect(mocks.listUsers).not.toHaveBeenCalled()
    expect(mocks.setUserRoles).not.toHaveBeenCalled()
  })

  it('requires at least one role, saves a demo account explicitly, and refreshes the current profile', async () => {
    renderPage()
    await selectOperator()
    const submit = screen.getByRole('button', { name: 'Сохранить роли' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Оператор/ }))
    expect(screen.getByRole('alert').textContent).toContain('хотя бы одна роль')
    expect(submit.disabled).toBe(true)
    fireEvent.submit(screen.getByRole('form', { name: 'Роли участника operator_01' }))
    expect(mocks.setUserRoles).not.toHaveBeenCalled()

    const changed: User = { ...operator, roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'] }
    mocks.setUserRoles.mockResolvedValue(changed)
    fireEvent.click(screen.getByRole('checkbox', { name: /Диагност/ }))
    expect(screen.getByText('Проверка протоколов')).toBeTruthy()
    fireEvent.click(submit)
    await screen.findByText('Роли участника «operator_01» сохранены.')
    expect(mocks.setUserRoles.mock.calls[0][0]).toBe(operator.id)
    expect(mocks.setUserRoles.mock.calls[0][1]).toEqual({ roles: ['diagnostician'] })
    expect(mocks.me).toHaveBeenCalledTimes(1)
    expect(mocks.acceptUser).toHaveBeenCalledExactlyOnceWith(architect)
    expect((screen.getByRole('button', { name: 'Сохранить роли' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('allows self-demotion and leaves participant management after accepting the refreshed profile', async () => {
    renderPage()
    await screen.findByRole('form', { name: 'Роли участника architect_01' })
    const demoted: User = { ...architect, roles: ['operator'], permissions: ['runs:read'] }
    mocks.setUserRoles.mockResolvedValue(demoted)
    mocks.me.mockResolvedValue(demoted)
    fireEvent.click(screen.getByRole('checkbox', { name: /Оператор/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Архитектор/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    await screen.findByText('Ваши роли обновлены. Управление участниками больше недоступно.')
    expect(mocks.setUserRoles.mock.calls[0][1]).toEqual({ roles: ['operator'] })
    expect(mocks.acceptUser).toHaveBeenCalledExactlyOnceWith(demoted)
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('locks further changes after a committed save if refreshing permissions fails and retries only /me', async () => {
    renderPage()
    await selectOperator()
    const changed: User = { ...operator, roles: ['operator', 'diagnostician'], permissions: ['runs:read', 'runs:review'] }
    mocks.setUserRoles.mockResolvedValue(changed)
    mocks.me.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(architect)
    fireEvent.click(screen.getByRole('checkbox', { name: /Диагност/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    await screen.findByRole('button', { name: 'Повторить проверку прав' })
    expect(screen.getByRole('alert').textContent).toContain('Роли сохранены')
    expect(screen.getByRole('checkbox', { name: /Оператор/ }).matches(':disabled')).toBe(true)
    expect(mocks.acceptUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку прав' }))
    await screen.findByText('Права текущего аккаунта проверены. Изменения сохранены.')
    expect(mocks.setUserRoles).toHaveBeenCalledTimes(1)
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(mocks.acceptUser).toHaveBeenCalledExactlyOnceWith(architect)
  })

  it('aborts a pending assignment on unmount and ignores a transport that resolves after cancellation', async () => {
    const pending = deferred<User>()
    mocks.setUserRoles.mockReturnValue(pending.promise)
    const view = renderPage()
    await selectOperator()
    fireEvent.click(screen.getByRole('checkbox', { name: /Диагност/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Роли участника operator_01' }))
    expect(mocks.setUserRoles).toHaveBeenCalledTimes(1)
    const signal: AbortSignal = mocks.setUserRoles.mock.calls[0][2].signal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { pending.resolve(operator) })
    await waitFor(() => { expect(mocks.me).not.toHaveBeenCalled() })
    expect(mocks.acceptUser).not.toHaveBeenCalled()
  })

  it('cancels the previous owner’s assignment without replacing the new owner’s draft or pending request', async () => {
    const oldSave = deferred<User>()
    const newSave = deferred<User>()
    mocks.setUserRoles.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise)
    const view = renderPage()
    await selectOperator()
    fireEvent.click(screen.getByRole('checkbox', { name: /Диагност/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    const oldSignal: AbortSignal = mocks.setUserRoles.mock.calls[0][2].signal

    const nextOwner: User = { ...architect, id: '55555555-5555-4555-8555-555555555555', login: 'second_architect' }
    mocks.user = nextOwner
    mocks.listUsers.mockResolvedValue([nextOwner, operator])
    view.rerender(<PageHarness />)
    await screen.findByRole('form', { name: 'Роли участника second_architect' })
    expect(oldSignal.aborted).toBe(true)
    await selectOperator()
    fireEvent.click(screen.getByRole('checkbox', { name: /Архитектор/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    const newSignal: AbortSignal = mocks.setUserRoles.mock.calls[1][2].signal

    await act(async () => { oldSave.resolve({ ...operator, roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'] }) })
    expect(mocks.me).not.toHaveBeenCalled()
    expect(mocks.acceptUser).not.toHaveBeenCalled()
    expect((screen.getByRole('checkbox', { name: /Архитектор/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Диагност/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('button', { name: 'Сохраняем роли…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(newSignal.aborted).toBe(false)
    fireEvent.submit(screen.getByRole('form', { name: 'Роли участника operator_01' }))
    expect(mocks.setUserRoles).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(newSignal.aborted).toBe(true)
    await act(async () => { newSave.resolve(operator) })
    expect(mocks.me).not.toHaveBeenCalled()
  })

  it.each(['owner', 'permission'] as const)('ignores a late /me response after the current %s changes', async change => {
    const refreshing = deferred<User>()
    mocks.setUserRoles.mockResolvedValue({ ...operator, roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'] })
    mocks.me.mockReturnValue(refreshing.promise)
    const view = renderPage()
    await selectOperator()
    fireEvent.click(screen.getByRole('checkbox', { name: /Оператор/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Диагност/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить роли' }))
    await waitFor(() => { expect(mocks.me).toHaveBeenCalledTimes(1) })
    const signal: AbortSignal = mocks.me.mock.calls[0][0].signal

    const nextUser: User = change === 'owner'
      ? { ...architect, id: '55555555-5555-4555-8555-555555555555', login: 'second_architect' }
      : { ...architect, roles: ['operator'], permissions: ['runs:read'] }
    mocks.user = nextUser
    mocks.listUsers.mockResolvedValue([nextUser, operator])
    view.rerender(<PageHarness />)
    expect(signal.aborted).toBe(true)
    await act(async () => { refreshing.resolve(architect) })
    expect(mocks.acceptUser).not.toHaveBeenCalled()
    expect(screen.queryByText('Роли участника «operator_01» сохранены.')).toBeNull()
    if (change === 'owner') {
      await screen.findByRole('form', { name: 'Роли участника second_architect' })
      expect((screen.getByRole('checkbox', { name: /Архитектор/ }) as HTMLInputElement).checked).toBe(true)
    } else {
      expect(screen.getByRole('alert').textContent).toContain('правом управления участниками')
      expect(screen.queryByRole('form')).toBeNull()
    }
  })
})
