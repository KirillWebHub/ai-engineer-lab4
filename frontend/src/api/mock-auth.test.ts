import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DemoRequest, LoginRequest, RegisterRequest, User } from '../types/auth'
import { createMockAuthApi, MOCK_SESSION_KEY, MOCK_USERS_KEY } from './mock-auth'
import type { MockStorage } from './mock-auth'

function memoryStorage() {
  const entries = new Map<string, string>()
  const storage: MockStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: key => { entries.delete(key) },
  }
  return storage
}

function setup() {
  const localStorage = memoryStorage()
  const sessionStorage = memoryStorage()
  const api = createMockAuthApi({ localStorage, sessionStorage, latency: 0 })
  return { api, localStorage, sessionStorage }
}

const account = { login: 'Pilot_04', password: 'Workshop!42' }

afterEach(() => vi.restoreAllMocks())

describe('mock registration and session', () => {
  it('registers an Operator, restores the session in a new client, and logs out idempotently', async () => {
    const { api, localStorage, sessionStorage } = setup()
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    const result = await api.register(account)
    expect(result.user).toMatchObject({ login: 'Pilot_04', roles: ['operator'], permissions: ['runs:read'] })
    expect(result.user.id).toMatch(/^[a-f0-9-]{36}$/i)
    const restored = createMockAuthApi({ localStorage, sessionStorage, latency: 0 })
    expect(await restored.me()).toEqual(result.user)
    await restored.logout()
    await restored.logout()
    await expect(api.me()).rejects.toMatchObject({ status: 401 })
  })

  it('keeps passwords out of both browser stores', async () => {
    const { api, localStorage, sessionStorage } = setup()
    const { user } = await api.register(account)
    const saved = localStorage.getItem(MOCK_USERS_KEY) ?? ''
    expect(saved).not.toContain(account.password)
    expect(saved).not.toContain('password')
    expect(JSON.parse(saved)).toMatchObject({
      version: 2,
      verifiers: {
        [user.id]: { algorithm: 'PBKDF2-SHA256', salt: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      },
    })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(user.id)
  })

  it('rejects seeded names and duplicates without changing the current session', async () => {
    const { api, sessionStorage } = setup()
    for (const login of ['OPERATOR_01', 'Diagnostics_01', 'architect_01', 'student']) {
      await expect(api.register({ ...account, login })).rejects.toMatchObject({
        status: 409, code: 'LOGIN_TAKEN', fields: { login: 'Этот логин уже занят.' },
      })
    }
    const { user } = await api.register(account)
    await expect(api.register({ ...account, login: 'pilot_04' })).rejects.toMatchObject({ status: 409 })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(user.id)
  })

  it('rejects extra properties and invalid fields at the mock boundary', async () => {
    const { api } = setup()
    await expect(api.register({ ...account, roles: ['architect'] } as unknown as RegisterRequest))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
    await expect(api.register({ login: ' Pilot_04', password: 'short' }))
      .rejects.toMatchObject({ status: 422, fields: { login: expect.any(String), password: expect.any(String) } })
  })

  it('aborts without creating an account or session', async () => {
    const { localStorage, sessionStorage } = setup()
    const api = createMockAuthApi({ localStorage, sessionStorage, latency: 100 })
    const controller = new AbortController()
    const pending = api.register(account, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(localStorage.getItem(MOCK_USERS_KEY)).toBeNull()
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull()
  })

  it('does not occupy a login if writing session storage fails', async () => {
    const { localStorage, sessionStorage } = setup()
    const blockedSession = {
      ...sessionStorage,
      setItem: () => { throw new Error('blocked') },
    }
    const blocked = createMockAuthApi({ localStorage, sessionStorage: blockedSession, latency: 0 })
    await expect(blocked.register(account)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(localStorage.getItem(MOCK_USERS_KEY)).toBeNull()
    const available = createMockAuthApi({ localStorage, sessionStorage, latency: 0 })
    await expect(available.register(account)).resolves.toHaveProperty('user.login', 'Pilot_04')
  })

  it('restores the previous session when local storage cannot commit a new account', async () => {
    const { api, localStorage, sessionStorage } = setup()
    const { user } = await api.register(account)
    const blockedLocal = { ...localStorage, setItem: () => { throw new Error('full') } }
    const blocked = createMockAuthApi({ localStorage: blockedLocal, sessionStorage, latency: 0 })
    await expect(blocked.register({ ...account, login: 'another_user' }))
      .rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(user.id)
    expect(await api.me()).toEqual(user)
    expect(localStorage.getItem(MOCK_USERS_KEY)).not.toContain('another_user')
  })

  it('reports corrupted local data rather than silently discarding existing accounts', async () => {
    const { api, localStorage } = setup()
    localStorage.setItem(MOCK_USERS_KEY, '{not json')
    await expect(api.register(account)).rejects.toMatchObject({ code: 'LOCAL_DATA_INVALID' })
    expect(localStorage.getItem(MOCK_USERS_KEY)).toBe('{not json')
  })

  it('does not expose mutable references to persisted user roles', async () => {
    const { api } = setup()
    const { user } = await api.register(account)
    user.roles.push('architect')
    user.permissions.push('roles:manage')
    expect(await api.me()).toMatchObject({ roles: ['operator'], permissions: ['runs:read'] })
  })
})

describe('mock password login', () => {
  it('logs into a newly registered account after logout and a fresh client instance', async () => {
    const { api, localStorage, sessionStorage } = setup()
    const { user } = await api.register(account)
    await api.logout()
    const reloaded = createMockAuthApi({ localStorage, sessionStorage, latency: 0 })
    expect(await reloaded.login({ ...account, login: 'pILOT_04' })).toEqual(user)
    expect(await reloaded.me()).toEqual(user)
  })

  it('returns the same 401 for a missing user, wrong password and seed account without a password; preserves session', async () => {
    const { api, sessionStorage } = setup()
    await api.register(account)
    const previous = await api.demo({ profile: 'architect_01' })
    for (const request of [
      { login: 'no_such_user', password: 'x' },
      { ...account, password: 'incorrect' },
      { login: 'operator_01', password: 'Workshop!42' },
    ]) {
      await expect(api.login(request)).rejects.toMatchObject({
        status: 401, code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль', fields: undefined,
      })
      expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previous.id)
      expect(await api.me()).toEqual(previous)
    }
  })

  it('preserves password whitespace and case exactly', async () => {
    const { api } = setup()
    const request = { login: 'spaces_04', password: ' Workshop!42 ' }
    const { user } = await api.register(request)
    await api.logout()
    for (const password of ['Workshop!42', ' workshop!42 ']) {
      await expect(api.login({ ...request, password })).rejects.toMatchObject({ status: 401 })
    }
    expect(await api.login(request)).toEqual(user)
  })

  it('rejects malformed and extra fields, but treats a nonempty weak password as a credential check', async () => {
    const { api } = setup()
    await expect(api.login({ ...account, roles: ['architect'] } as unknown as LoginRequest))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
    await expect(api.login({ ...account, login: ' Pilot_04' })).rejects.toMatchObject({ status: 422, fields: { login: expect.any(String) } })
    await expect(api.login({ ...account, password: '' })).rejects.toMatchObject({ status: 422, fields: { password: expect.any(String) } })
    await expect(api.login({ ...account, password: 'x' })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
  })

  it('uses a fresh salt for each account with the same password', async () => {
    const { api, localStorage } = setup()
    const first = (await api.register(account)).user
    const second = (await api.register({ ...account, login: 'another_user' })).user
    const saved = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '{}')
    expect(saved.verifiers[first.id].salt).not.toBe(saved.verifiers[second.id].salt)
    expect(saved.verifiers[first.id].hash).not.toBe(saved.verifiers[second.id].hash)
  })

  it.each(['register', 'login'] as const)('does not commit a %s result when aborted during WebCrypto derivation', async method => {
    const { api, localStorage, sessionStorage } = setup()
    await api.register(account)
    await api.demo({ profile: 'student' })
    const previousData = localStorage.getItem(MOCK_USERS_KEY)
    const previousSession = sessionStorage.getItem(MOCK_SESSION_KEY)
    const controller = new AbortController()
    vi.spyOn(crypto.subtle, 'deriveBits').mockImplementationOnce(async () => {
      controller.abort()
      return new ArrayBuffer(32)
    })
    const body = method === 'register' ? { ...account, login: 'cancelled_user' } : account
    await expect(api[method](body, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(localStorage.getItem(MOCK_USERS_KEY)).toBe(previousData)
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previousSession)
  })

  it('keeps both accounts when registrations hash concurrently and permits only one duplicate login', async () => {
    const { api, localStorage } = setup()
    await Promise.all([api.register(account), api.register({ ...account, login: 'other_04' })])
    const competing = await Promise.allSettled([
      api.register({ ...account, login: 'same_04' }),
      api.register({ ...account, login: 'SAME_04' }),
    ])
    expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(competing.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    const saved = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '{}')
    expect(saved.users.map((user: User) => user.login.toLowerCase())).toEqual(expect.arrayContaining(['pilot_04', 'other_04', 'same_04']))
  })
})

describe('mock demo profiles and storage migration', () => {
  it('replaces the session with each of the four allowlisted profiles', async () => {
    const { api } = setup()
    for (const [profile, roles] of [
      ['operator_01', ['operator']], ['diagnostics_01', ['diagnostician']],
      ['architect_01', ['architect']], ['student', ['operator']],
    ] as const) {
      const user = await api.demo({ profile })
      expect(user).toMatchObject({ login: profile, roles })
      expect(await api.me()).toEqual(user)
    }
  })

  it('rejects unknown profiles and extra properties without changing the session', async () => {
    const { api, sessionStorage } = setup()
    const previous = await api.demo({ profile: 'student' })
    for (const request of [
      { profile: 'unknown' }, { profile: 'ARCHITECT_01' }, { profile: 'student', roles: ['architect'] }, {},
    ]) {
      await expect(api.demo(request as DemoRequest)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
      expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previous.id)
    }
  })

  it('returns current stored roles and reports an absent seed profile with 404', async () => {
    const { api, localStorage, sessionStorage } = setup()
    await api.register(account)
    const data = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '{}')
    data.users.find((user: User) => user.login === 'architect_01').roles = ['operator', 'diagnostician']
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(data))
    const architect = await api.demo({ profile: 'architect_01' })
    expect(architect).toMatchObject({ roles: ['operator', 'diagnostician'], permissions: ['runs:read', 'runs:review'] })
    data.users = data.users.filter((user: User) => user.login !== 'student')
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(data))
    await expect(api.demo({ profile: 'student' })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(architect.id)
  })

  it('preserves v1 profiles and sessions, then upgrades on registration without inventing old credentials', async () => {
    const { api, localStorage, sessionStorage } = setup()
    const oldUser: User = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', login: 'old_student',
      roles: ['diagnostician'], permissions: ['runs:read', 'runs:review'],
    }
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify({ version: 1, users: [oldUser] }))
    sessionStorage.setItem(MOCK_SESSION_KEY, oldUser.id)
    expect(await api.me()).toEqual(oldUser)
    await expect(api.login({ login: oldUser.login, password: 'Workshop!42' })).rejects.toMatchObject({ status: 401 })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(oldUser.id)
    const { user } = await api.register(account)
    const upgraded = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '{}')
    expect(upgraded.version).toBe(2)
    expect(upgraded.users).toContainEqual(oldUser)
    expect(Object.keys(upgraded.verifiers)).toEqual([user.id])
    await api.logout()
    await expect(api.login({ login: oldUser.login, password: account.password })).rejects.toMatchObject({ status: 401 })
    expect(await api.login(account)).toEqual(user)
  })

  it('preserves the previous session when writing a successful login or demo session is blocked', async () => {
    const { api, localStorage, sessionStorage } = setup()
    await api.register(account)
    const previous = await api.demo({ profile: 'student' })
    const blocked = createMockAuthApi({
      localStorage, latency: 0,
      sessionStorage: { ...sessionStorage, setItem: () => { throw new Error('blocked') } },
    })
    await expect(blocked.login(account)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await expect(blocked.demo({ profile: 'architect_01' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe(previous.id)
  })
})
