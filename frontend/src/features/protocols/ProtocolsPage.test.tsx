// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import type { User } from '../../types/auth'
import type { RunSummary } from '../../types/workspace'
import { ProtocolsPage } from './ProtocolsPage'

const mocks = vi.hoisted(() => ({ listRuns: vi.fn(), restoreSession: vi.fn(), feedback: vi.fn(), user: null as User | null }))
vi.mock('../../api/client', () => ({ workspaceApi: { listRuns: mocks.listRuns } }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ user: mocks.user, restoreSession: mocks.restoreSession }) }))
vi.mock('../../components/workspace/workspace-feedback', () => ({ useWorkspaceFeedback: () => mocks.feedback }))

const row: RunSummary = { id: 'AE-041', title: 'Реакция на курсор', date: '2026-11-04', robot: 'AI Engineer', status: 'pending' }
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = { id: '11111111-1111-4111-8111-111111111111', login: 'operator_01', roles: ['operator'], permissions: ['runs:read'] }
})

describe('ProtocolsPage', () => {
  it('loads the journal and links each protocol to its own detail route', async () => {
    mocks.listRuns.mockResolvedValue([row])
    render(<MemoryRouter><ProtocolsPage /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: 'Реакция на курсор' })
    expect(link.getAttribute('href')).toBe('/workspace/protocols/AE-041')
    expect(screen.getByText('На проверке')).toBeTruthy()
    expect(screen.getByText('04.11.2026').getAttribute('datetime')).toBe('2026-11-04')
    expect(mocks.listRuns.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal)
  })

  it('retries a failed request and shows an empty journal when the retry returns no records', async () => {
    mocks.listRuns.mockRejectedValueOnce(new ApiError(503, { code: 'UNAVAILABLE', message: 'Стенд временно недоступен.' }))
      .mockResolvedValueOnce([])
    render(<MemoryRouter><ProtocolsPage /></MemoryRouter>)
    const retry = await screen.findByRole('button', { name: /повторить/i })
    await act(async () => { fireEvent.click(retry) })
    expect(await screen.findByText(/Протоколов пока нет/)).toBeTruthy()
    expect(mocks.listRuns).toHaveBeenCalledTimes(2)
  })

  it('does not show a late result from the preceding session', async () => {
    let resolveOld!: (value: RunSummary[]) => void
    mocks.listRuns.mockReturnValueOnce(new Promise<RunSummary[]>(settle => { resolveOld = settle }))
      .mockResolvedValueOnce([])
    const view = render(<MemoryRouter><ProtocolsPage /></MemoryRouter>)
    const oldSignal = mocks.listRuns.mock.calls[0][0].signal as AbortSignal
    mocks.user = { id: '22222222-2222-4222-8222-222222222222', login: 'other_operator', roles: ['operator'], permissions: ['runs:read'] }
    view.rerender(<MemoryRouter><ProtocolsPage /></MemoryRouter>)
    expect(oldSignal.aborted).toBe(true)
    expect(await screen.findByText(/Протоколов пока нет/)).toBeTruthy()
    await act(async () => { resolveOld([row]) })
    expect(screen.queryByRole('link', { name: 'Реакция на курсор' })).toBeNull()
  })
})
