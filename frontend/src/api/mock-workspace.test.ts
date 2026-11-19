import { describe, expect, it } from 'vitest'
import type { RoleId } from '../types/auth'
import type { ReviewRunRequest, SetUserRolesRequest } from '../types/workspace'
import { createMockAuthApi, MOCK_SESSION_KEY, MOCK_USERS_KEY } from './mock-auth'
import { createMockWorkspaceApi, MOCK_RUNS_KEY } from './mock-workspace'
import type { MockStorage } from './mock-repository'

function memoryStorage(): MockStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

function setup() {
  const localStorage = memoryStorage()
  const sessionStorage = memoryStorage()
  const options = { localStorage, sessionStorage, latency: 0 }
  return { ...options, auth: createMockAuthApi(options), workspace: createMockWorkspaceApi(options) }
}

const architectId = '33333333-3333-4333-8333-333333333333'
const studentId = '44444444-4444-4444-8444-444444444444'

describe('workspace authentication and RBAC', () => {
  it('publishes the three roles before login without exposing protected resources', async () => {
    const { workspace } = setup()
    const roles = await workspace.listRoles()
    expect(roles.map(role => role.id)).toEqual(['operator', 'diagnostician', 'architect'])
    expect(roles[2].permissions).toEqual(['runs:read', 'runs:review', 'roles:manage'])
    roles[2].permissions.length = 0
    expect((await workspace.listRoles())[2].permissions).toHaveLength(3)
    for (const request of [
      () => workspace.listRuns(), () => workspace.getRun('AE-041'),
      () => workspace.reviewRun('AE-041', { status: 'approved' }),
      () => workspace.listUsers(), () => workspace.setUserRoles(studentId, { roles: ['diagnostician'] }),
    ]) {
      await expect(request()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    }
  })

  it('lets an Operator read the contracted five-field list and full details, but rejects direct mutations', async () => {
    const { auth, workspace, localStorage } = setup()
    const operator = await auth.demo({ profile: 'operator_01' })
    operator.roles.push('architect')
    operator.permissions.push('roles:manage', 'runs:review')
    const runs = await workspace.listRuns()
    expect(runs.map(run => run.id)).toEqual(['AE-041', 'AE-040', 'AE-039'])
    expect(Object.keys(runs[0]).sort()).toEqual(['date', 'id', 'robot', 'status', 'title'])
    expect(await workspace.getRun('AE-041')).toMatchObject({
      id: 'AE-041', summary: expect.stringContaining('отслеживает курсор'), reviewedBy: null, reviewedAt: null,
    })
    for (const request of [
      () => workspace.reviewRun('AE-041', { status: 'approved' }),
      () => workspace.listUsers(), () => workspace.setUserRoles(operator.id, { roles: ['architect'] }),
    ]) await expect(request()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(localStorage.getItem(MOCK_RUNS_KEY)).toBeNull()
    expect(localStorage.getItem(MOCK_USERS_KEY)).toBeNull()
  })

  it('checks live roles after waiting, and uses the current session as the review author', async () => {
    const context = setup()
    const { auth, localStorage } = context
    const slow = createMockWorkspaceApi({ ...context, latency: 30 })
    await auth.demo({ profile: 'diagnostics_01' })
    const denied = slow.reviewRun('AE-041', { status: 'approved' })
    await auth.demo({ profile: 'operator_01' })
    await expect(denied).rejects.toMatchObject({ status: 403 })
    expect(localStorage.getItem(MOCK_RUNS_KEY)).toBeNull()
    await auth.demo({ profile: 'diagnostics_01' })
    const approved = slow.reviewRun('AE-041', { status: 'approved' })
    await auth.demo({ profile: 'architect_01' })
    expect(await approved).toMatchObject({ reviewedBy: 'architect_01', status: 'approved' })
  })

  it('rejects an in-flight role assignment if the Architect loses access before it settles', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'architect_01' })
    const slow = createMockWorkspaceApi({ ...context, latency: 30 })
    const pending = slow.setUserRoles(studentId, { roles: ['architect'] })
    await context.workspace.setUserRoles(architectId, { roles: ['operator'] })
    await expect(pending).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await context.auth.demo({ profile: 'student' })).toMatchObject({ roles: ['operator'] })
  })
})

describe('protocol decisions and persistence', () => {
  it('preserves author/time for a no-op review and records the current author when the decision changes', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'diagnostics_01' })
    const firstTime = '2026-11-19T12:00:00.000Z'
    const first = createMockWorkspaceApi({ ...context, now: () => new Date(firstTime) })
    const accepted = await first.reviewRun('AE-041', { status: 'approved' })
    expect(accepted).toMatchObject({ status: 'approved', reviewedBy: 'diagnostics_01', reviewedAt: firstTime })
    await context.auth.demo({ profile: 'architect_01' })
    const nextTime = '2026-11-19T13:00:00.000Z'
    const reloaded = createMockWorkspaceApi({ ...context, now: () => new Date(nextTime) })
    expect(await reloaded.reviewRun('AE-041', { status: 'approved' })).toEqual(accepted)
    expect(await reloaded.reviewRun('AE-041', { status: 'rejected' })).toMatchObject({
      status: 'rejected', reviewedBy: 'architect_01', reviewedAt: nextTime,
    })
    expect(await first.getRun('AE-041')).toMatchObject({ status: 'rejected', reviewedAt: nextTime })
    expect((await first.listRuns())[0]).toMatchObject({ status: 'rejected' })
  })

  it('sorts by descending date and then descending ID, and permits an empty protocol list', async () => {
    const { auth, workspace, localStorage } = setup()
    await auth.demo({ profile: 'operator_01' })
    const sample = await workspace.getRun('AE-041')
    const runs = [
      { ...sample, id: 'AE-041', date: '2026-11-02' },
      { ...sample, id: 'AE-040', date: '2026-11-04' },
      { ...sample, id: 'AE-042', date: '2026-11-04' },
    ]
    localStorage.setItem(MOCK_RUNS_KEY, JSON.stringify({ version: 1, runs }))
    expect((await workspace.listRuns()).map(run => run.id)).toEqual(['AE-042', 'AE-040', 'AE-041'])
    localStorage.setItem(MOCK_RUNS_KEY, JSON.stringify({ version: 1, runs: [] }))
    expect(await workspace.listRuns()).toEqual([])
  })

  it('returns 404 for absent protocols and validates a review body strictly', async () => {
    const { auth, workspace } = setup()
    await auth.demo({ profile: 'diagnostics_01' })
    await expect(workspace.getRun('AE-999')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    await expect(workspace.reviewRun('AE-999', { status: 'approved' })).rejects.toMatchObject({ status: 404 })
    for (const request of [{ status: 'pending' }, { status: 'unknown' }, {}, { status: 'approved', reviewedBy: 'architect_01' }]) {
      await expect(workspace.reviewRun('AE-041', request as ReviewRunRequest))
        .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
    }
  })

  it('does not commit a cancelled or failed review, and keeps every field intact', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'diagnostics_01' })
    const before = await context.workspace.getRun('AE-041')
    const controller = new AbortController()
    const slow = createMockWorkspaceApi({ ...context, latency: 30 })
    const pending = slow.reviewRun('AE-041', { status: 'approved' }, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const blocked = createMockWorkspaceApi({
      ...context,
      localStorage: { ...context.localStorage, setItem: () => { throw new Error('full') } },
    })
    await expect(blocked.reviewRun('AE-041', { status: 'approved' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(await context.workspace.getRun('AE-041')).toEqual(before)
    expect(context.localStorage.getItem(MOCK_RUNS_KEY)).toBeNull()
  })

  it('rejects damaged persisted protocols instead of resetting the journal', async () => {
    const { auth, workspace, localStorage } = setup()
    await auth.demo({ profile: 'operator_01' })
    localStorage.setItem(MOCK_RUNS_KEY, '{broken')
    await expect(workspace.listRuns()).rejects.toMatchObject({ code: 'LOCAL_DATA_INVALID' })
    expect(localStorage.getItem(MOCK_RUNS_KEY)).toBe('{broken')
  })
})

describe('role assignments and shared auth state', () => {
  it('edits demo users, unions permissions, preserves password verifiers and supports subsequent password login', async () => {
    const context = setup()
    const account = { login: 'Pilot_04', password: 'Workshop!42' }
    const registered = (await context.auth.register(account)).user
    const before = JSON.parse(context.localStorage.getItem(MOCK_USERS_KEY) ?? '{}').verifiers
    await context.auth.demo({ profile: 'architect_01' })
    const users = await context.workspace.listUsers()
    expect(users.map(user => user.login)).toEqual(['architect_01', 'diagnostics_01', 'operator_01', 'Pilot_04', 'student'])
    expect(users.every(user => Object.keys(user).sort().join(',') === 'id,login,permissions,roles')).toBe(true)
    expect(await context.workspace.setUserRoles(studentId, { roles: ['operator', 'diagnostician'] })).toMatchObject({
      roles: ['operator', 'diagnostician'], permissions: ['runs:read', 'runs:review'],
    })
    expect(await context.workspace.setUserRoles(registered.id, { roles: ['diagnostician'] })).toMatchObject({ roles: ['diagnostician'] })
    expect(JSON.parse(context.localStorage.getItem(MOCK_USERS_KEY) ?? '{}').verifiers).toEqual(before)
    expect(await context.auth.demo({ profile: 'student' })).toMatchObject({ roles: ['operator', 'diagnostician'] })
    const reopened = createMockAuthApi(context)
    expect(await reopened.me()).toMatchObject({ permissions: ['runs:read', 'runs:review'] })
    await reopened.logout()
    expect(await reopened.login(account)).toMatchObject({ id: registered.id, roles: ['diagnostician'] })
  })

  it('allows self-demotion, then enforces the new rights in the already-open session', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'architect_01' })
    expect(await context.workspace.setUserRoles(architectId, { roles: ['operator'] })).toMatchObject({ permissions: ['runs:read'] })
    expect(await context.auth.me()).toMatchObject({ roles: ['operator'], permissions: ['runs:read'] })
    await expect(context.workspace.listUsers()).rejects.toMatchObject({ status: 403 })
    await expect(context.workspace.setUserRoles(architectId, { roles: ['architect'] })).rejects.toMatchObject({ status: 403 })
    await expect(context.workspace.reviewRun('AE-041', { status: 'approved' })).rejects.toMatchObject({ status: 403 })
    expect(await context.workspace.listRuns()).toHaveLength(3)
    expect(await context.auth.demo({ profile: 'architect_01' })).toMatchObject({ roles: ['operator'] })
  })

  it('validates UUIDs and role arrays, reports absent users, and handles repeated sets without another write', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'architect_01' })
    await expect(context.workspace.setUserRoles('student', { roles: ['operator'] }))
      .rejects.toMatchObject({ status: 422, fields: { userId: expect.any(String) } })
    await expect(context.workspace.setUserRoles('00000000-0000-0000-0000-000000000000', { roles: ['operator'] }))
      .rejects.toMatchObject({ status: 404 })
    for (const request of [
      { roles: [] }, { roles: ['operator', 'operator'] }, { roles: ['admin'] },
      { roles: ['operator'], login: 'altered' }, { roles: 'architect' }, {},
    ]) {
      await expect(context.workspace.setUserRoles(studentId, request as SetUserRolesRequest))
        .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
    }
    const current = await context.workspace.setUserRoles(studentId, { roles: ['operator', 'diagnostician'] })
    const blocked = createMockWorkspaceApi({ ...context, localStorage: { ...context.localStorage, setItem: () => { throw new Error('full') } } })
    expect(await blocked.setUserRoles(studentId, { roles: ['diagnostician', 'operator'] })).toEqual(current)
  })

  it('cancels role writes and rolls back all profile fields when saving fails', async () => {
    const context = setup()
    await context.auth.demo({ profile: 'architect_01' })
    const before = await context.workspace.listUsers()
    const previousSession = context.sessionStorage.getItem(MOCK_SESSION_KEY)
    const controller = new AbortController()
    const slow = createMockWorkspaceApi({ ...context, latency: 30 })
    const pending = slow.setUserRoles(studentId, { roles: ['architect'] }, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const blocked = createMockWorkspaceApi({ ...context, localStorage: { ...context.localStorage, setItem: () => { throw new Error('full') } } })
    await expect(blocked.setUserRoles(studentId, { roles: ['architect'] })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(await context.workspace.listUsers()).toEqual(before)
    expect(context.sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previousSession)
    expect(context.localStorage.getItem(MOCK_USERS_KEY)).toBeNull()
  })

  it('rejects sparse role arrays with 422 without changing persisted profiles or credentials', async () => {
    const context = setup()
    await context.auth.register({ login: 'sparse_test', password: 'Workshop!42' })
    await context.auth.demo({ profile: 'architect_01' })
    const previousData = context.localStorage.getItem(MOCK_USERS_KEY)
    const previousSession = context.sessionStorage.getItem(MOCK_SESSION_KEY)
    const previousUsers = await context.workspace.listUsers()
    const sparseRoles: RoleId[] = Array(1)
    for (const roles of [sparseRoles, ['operator', ...sparseRoles] as RoleId[]]) {
      await expect(context.workspace.setUserRoles(studentId, { roles })).rejects.toMatchObject({
        status: 422, code: 'VALIDATION_ERROR', fields: { roles: expect.any(String) },
      })
      expect(context.localStorage.getItem(MOCK_USERS_KEY)).toBe(previousData)
      expect(context.sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previousSession)
      expect(await context.workspace.listUsers()).toEqual(previousUsers)
    }
  })

  it('preserves v1 accounts while upgrading a role mutation to the shared v2 format', async () => {
    const context = setup()
    const architect = await context.auth.demo({ profile: 'architect_01' })
    const oldStudent = { id: studentId, login: 'student', roles: ['operator'] as RoleId[], permissions: ['runs:read'] }
    context.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify({ version: 1, users: [architect, oldStudent] }))
    await context.workspace.setUserRoles(studentId, { roles: ['diagnostician'] })
    const saved = JSON.parse(context.localStorage.getItem(MOCK_USERS_KEY) ?? '{}')
    expect(saved.version).toBe(2)
    expect(saved.users).toHaveLength(2)
    expect(saved.verifiers).toEqual({})
    expect(await context.auth.demo({ profile: 'student' })).toMatchObject({ roles: ['diagnostician'] })
  })
})
