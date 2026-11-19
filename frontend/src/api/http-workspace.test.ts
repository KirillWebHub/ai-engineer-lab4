import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpWorkspaceApi } from './http-workspace'

afterEach(() => vi.unstubAllGlobals())

describe('HTTP workspace contract', () => {
  it('uses all six contracted routes, verbs and request bodies with session credentials and cancellation', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpWorkspaceApi()
    const controller = new AbortController()
    const options = { signal: controller.signal }
    const userId = '44444444-4444-4444-8444-444444444444'
    await api.listRuns(options)
    await api.getRun('AE-041', options)
    await api.reviewRun('AE-041', { status: 'approved' }, options)
    await api.listRoles(options)
    await api.listUsers(options)
    await api.setUserRoles(userId, { roles: ['operator', 'diagnostician'] }, options)
    expect(fetchMock.mock.calls.map(([url, request]) => [url, request.method, request.body])).toEqual([
      ['/api/runs', 'GET', undefined],
      ['/api/runs/AE-041', 'GET', undefined],
      ['/api/runs/AE-041/review', 'PATCH', '{"status":"approved"}'],
      ['/api/roles', 'GET', undefined],
      ['/api/users', 'GET', undefined],
      [`/api/users/${userId}/roles`, 'PUT', '{"roles":["operator","diagnostician"]}'],
    ])
    for (const [, request] of fetchMock.mock.calls) {
      expect(request).toMatchObject({ credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    }
  })

  it('retains backend RBAC failures rather than returning empty resources', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      code: 'FORBIDDEN', message: 'Недостаточно прав.',
    }, { status: 403 })))
    await expect(createHttpWorkspaceApi().listUsers()).rejects.toMatchObject({
      status: 403, code: 'FORBIDDEN', message: 'Недостаточно прав.',
    })
  })

  it('encodes path IDs instead of treating caller input as another endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    await createHttpWorkspaceApi().getRun('AE/041?probe=1')
    expect(fetchMock).toHaveBeenCalledWith('/api/runs/AE%2F041%3Fprobe%3D1', expect.any(Object))
  })
})
