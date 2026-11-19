import type { Permission, RoleId, User } from '../types/auth'
import { ApiError } from './errors'
import { isMockVerifier } from './mock-credentials'
import type { MockVerifier } from './mock-credentials'

export const MOCK_USERS_KEY = 'ai-engineer.react.users.v1'
export const MOCK_SESSION_KEY = 'ai-engineer.react.session.v1'

export interface MockDatabase {
  users: User[]
  verifiers: Record<string, MockVerifier>
}

export interface MockStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface MockRepositoryOptions {
  localStorage?: MockStorage
  sessionStorage?: MockStorage
  latency?: number
}

const rolePermissions: Record<RoleId, Permission[]> = {
  operator: ['runs:read'],
  diagnostician: ['runs:read', 'runs:review'],
  architect: ['runs:read', 'runs:review', 'roles:manage'],
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function permissionsFor(roles: RoleId[]): Permission[] {
  return [...new Set(roles.flatMap(role => rolePermissions[role]))]
}

export function createUser(id: string, login: string, roles: RoleId[]): User {
  return { id, login, roles, permissions: permissionsFor(roles) }
}

function initialUsers(): User[] {
  return [
    createUser('11111111-1111-4111-8111-111111111111', 'operator_01', ['operator']),
    createUser('22222222-2222-4222-8222-222222222222', 'diagnostics_01', ['diagnostician']),
    createUser('33333333-3333-4333-8333-333333333333', 'architect_01', ['architect']),
    createUser('44444444-4444-4444-8444-444444444444', 'student', ['operator']),
  ]
}

export function copyUser(user: User): User {
  return { ...user, roles: [...user.roles], permissions: [...user.permissions] }
}

export function isRole(value: unknown): value is RoleId {
  return typeof value === 'string' && Object.hasOwn(rolePermissions, value)
}

function parseUser(value: unknown): User | null {
  if (typeof value !== 'object' || value === null) return null
  const user = value as Record<string, unknown>
  if (
    typeof user.id !== 'string' || !uuidPattern.test(user.id) ||
    typeof user.login !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(user.login) ||
    !Array.isArray(user.roles) || !user.roles.length || !user.roles.every(isRole) ||
    new Set(user.roles).size !== user.roles.length
  ) return null
  return createUser(user.id, user.login, user.roles)
}

export function storageError(): ApiError {
  return new ApiError(500, {
    code: 'STORAGE_UNAVAILABLE',
    message: 'Не удалось сохранить демоданные в браузере. Разрешите доступ к хранилищу и повторите попытку.',
  })
}

export function invalidData(): ApiError {
  return new ApiError(500, {
    code: 'LOCAL_DATA_INVALID',
    message: 'Демоданные в браузере повреждены. Очистите данные этого сайта и обновите страницу.',
  })
}

export function getMockStorage(options: MockRepositoryOptions, kind: 'localStorage' | 'sessionStorage'): MockStorage {
  try {
    return options[kind] ?? window[kind]
  } catch {
    throw storageError()
  }
}

export function readStorage(storage: MockStorage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    throw storageError()
  }
}

export function waitForMock(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('Запрос отменён.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export function readMockDatabase(storage: MockStorage): MockDatabase {
  const serialized = readStorage(storage, MOCK_USERS_KEY)
  if (serialized === null) return { users: initialUsers(), verifiers: {} }
  try {
    const data: unknown = JSON.parse(serialized)
    if (typeof data !== 'object' || data === null || !('version' in data) || (data.version !== 1 && data.version !== 2) ||
      !('users' in data) || !Array.isArray(data.users)) throw invalidData()
    const users = data.users.map(parseUser)
    if (users.some(user => user === null)) throw invalidData()
    const validUsers = users as User[]
    if (new Set(validUsers.map(user => user.id)).size !== validUsers.length ||
      new Set(validUsers.map(user => user.login.toLowerCase())).size !== validUsers.length) throw invalidData()
    const verifiers: Record<string, MockVerifier> = {}
    if (data.version === 2) {
      if (!('verifiers' in data) || typeof data.verifiers !== 'object' || data.verifiers === null ||
        Array.isArray(data.verifiers)) throw invalidData()
      for (const [id, verifier] of Object.entries(data.verifiers)) {
        if (!validUsers.some(user => user.id === id) || !isMockVerifier(verifier)) throw invalidData()
        verifiers[id] = verifier
      }
    }
    // Old profiles remain usable in their session and via demo, without an
    // invented password or a destructive reset when the schema evolves.
    return { users: validUsers, verifiers }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw invalidData()
  }
}

export function writeMockDatabase(storage: MockStorage, database: MockDatabase): void {
  try {
    storage.setItem(MOCK_USERS_KEY, JSON.stringify({ version: 2, ...database }))
  } catch {
    throw storageError()
  }
}

export function requirePermission(options: MockRepositoryOptions, permission: Permission): { database: MockDatabase; user: User } {
  const id = readStorage(getMockStorage(options, 'sessionStorage'), MOCK_SESSION_KEY)
  if (id === null) throw new ApiError(401, { code: 'AUTH_REQUIRED', message: 'Войдите в аккаунт.' })
  const database = readMockDatabase(getMockStorage(options, 'localStorage'))
  const user = database.users.find(candidate => candidate.id === id)
  if (!user) throw new ApiError(401, { code: 'AUTH_REQUIRED', message: 'Войдите в аккаунт.' })
  if (!user.permissions.includes(permission)) {
    throw new ApiError(403, { code: 'FORBIDDEN', message: 'Недостаточно прав для этого действия.' })
  }
  return { database, user }
}
