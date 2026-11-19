// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import type { User } from '../../types/auth'
import type { Run } from '../../types/workspace'
import { ProtocolDetailPage } from './ProtocolDetailPage'

const mocks = vi.hoisted(() => ({ getRun: vi.fn(), reviewRun: vi.fn(), restoreSession: vi.fn(), feedback: vi.fn(), user: null as User | null }))
vi.mock('../../api/client', () => ({ workspaceApi: { getRun: mocks.getRun, reviewRun: mocks.reviewRun } }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ user: mocks.user, restoreSession: mocks.restoreSession }) }))
vi.mock('../../components/workspace/workspace-feedback', () => ({ useWorkspaceFeedback: () => mocks.feedback }))

const run: Run = {
  id: 'AE-041', title: 'Реакция на курсор', date: '2026-11-04', robot: 'AI Engineer', status: 'pending',
  summary: 'Проверена реакция робота на курсор рядом с полями формы.', reviewedBy: null, reviewedAt: null,
}
function setDiagnostician() {
  mocks.user = { id: '22222222-2222-4222-8222-222222222222', login: 'diagnostics_01', roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'] }
}
function renderDetail() {
  return render(<MemoryRouter initialEntries={['/workspace/protocols/AE-041']}><Routes><Route path="/workspace/protocols/:runId" element={<ProtocolDetailPage />} /></Routes></MemoryRouter>)
}
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getRun.mockResolvedValue(run)
  mocks.user = { id: '11111111-1111-4111-8111-111111111111', login: 'operator_01', roles: ['operator'], permissions: ['runs:read'] }
})

describe('ProtocolDetailPage', () => {
  it('gives an operator a readable protocol without review controls', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Реакция на курсор' })).toBeTruthy()
    expect(screen.getByText(run.summary)).toBeTruthy()
    expect(screen.getByText(/Вы можете читать этот протокол/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Принять протокол' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Вернуть на доработку' })).toBeNull()
    expect(mocks.reviewRun).not.toHaveBeenCalled()
  })

  it('blocks concurrent decisions and displays the returned reviewer and decision time', async () => {
    setDiagnostician()
    let resolve!: (value: Run) => void
    mocks.reviewRun.mockReturnValue(new Promise<Run>(settle => { resolve = settle }))
    renderDetail()
    const approve = await screen.findByRole('button', { name: 'Принять протокол' })
    fireEvent.click(approve)
    fireEvent.click(approve)
    expect(mocks.reviewRun).toHaveBeenCalledTimes(1)
    expect(mocks.reviewRun.mock.calls[0][0]).toBe('AE-041')
    expect(mocks.reviewRun.mock.calls[0][1]).toEqual({ status: 'approved' })
    expect((screen.getByRole('button', { name: 'Вернуть на доработку' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { resolve({ ...run, status: 'approved', reviewedBy: 'diagnostics_01', reviewedAt: '2026-11-19T16:45:00Z' }) })
    expect(screen.getByText('diagnostics_01')).toBeTruthy()
    expect(screen.getByText(/16:45 UTC/).getAttribute('datetime')).toBe('2026-11-19T16:45:00Z')
    expect(screen.getByText('Принят')).toBeTruthy()
    expect((approve as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Вернуть на доработку' }) as HTMLButtonElement).disabled).toBe(false)
    expect(mocks.feedback).toHaveBeenLastCalledWith('success')
  })

  it('preserves the original protocol on failure and cancels an unfinished retry on unmount', async () => {
    setDiagnostician()
    let resolve!: (value: Run) => void
    mocks.reviewRun.mockRejectedValueOnce(new ApiError(503, { code: 'UNAVAILABLE', message: 'Решение не сохранено. Повторите попытку.' }))
      .mockReturnValueOnce(new Promise<Run>(settle => { resolve = settle }))
    const view = renderDetail()
    const approve = await screen.findByRole('button', { name: 'Принять протокол' })
    await act(async () => { fireEvent.click(approve) })
    expect(screen.getByText('Решение не сохранено. Повторите попытку.')).toBeTruthy()
    expect(screen.getByText('На проверке')).toBeTruthy()
    expect(screen.getByText('Ещё не проверен')).toBeTruthy()
    fireEvent.click(approve)
    const signal = mocks.reviewRun.mock.calls[1][2].signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve({ ...run, status: 'approved', reviewedBy: 'diagnostics_01', reviewedAt: '2026-11-19T16:45:00Z' }) })
    expect(mocks.feedback).not.toHaveBeenLastCalledWith('success')
  })
})
