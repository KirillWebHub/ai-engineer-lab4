import { validateRegistration } from '../features/registration/validation'
import { validateLogin } from '../features/auth/validation'
import type { AuthApi, DemoProfileId, DemoRequest, LoginRequest, RegisterRequest, User } from '../types/auth'
import { ApiError } from './errors'
import { createMockVerifier, dummyVerifier, matchesMockVerifier, throwIfAborted } from './mock-credentials'
import { copyUser, createUser, getMockStorage, MOCK_SESSION_KEY, readMockDatabase, readStorage, storageError, waitForMock, writeMockDatabase } from './mock-repository'
import type { MockRepositoryOptions, MockStorage } from './mock-repository'

export { MOCK_USERS_KEY, MOCK_SESSION_KEY } from './mock-repository'
export type { MockStorage } from './mock-repository'
export const DEMO_PROFILE_IDS: readonly DemoProfileId[] = ['operator_01', 'diagnostics_01', 'architect_01', 'student']

interface MockAuthOptions extends MockRepositoryOptions {
  createId?: () => string
}

function validateCredentialsRequest(request: RegisterRequest | LoginRequest, mode: 'register' | 'login'): void {
  if (
    typeof request !== 'object' || request === null || Array.isArray(request) ||
    typeof request.login !== 'string' || typeof request.password !== 'string' ||
    !Object.hasOwn(request, 'login') || !Object.hasOwn(request, 'password') ||
    Object.keys(request).some(key => key !== 'login' && key !== 'password')
  ) {
    throw new ApiError(422, { code: 'VALIDATION_ERROR', message: 'Ожидаются только логин и пароль.' })
  }
  const fields = mode === 'register' ? validateRegistration(request) : validateLogin(request)
  if (Object.keys(fields).length) {
    throw new ApiError(422, { code: 'VALIDATION_ERROR', message: 'Проверьте выделенные поля.', fields })
  }
}

function validateDemoRequest(request: DemoRequest): void {
  if (typeof request !== 'object' || request === null || Array.isArray(request) || Object.keys(request).length !== 1 ||
    !Object.hasOwn(request, 'profile') || !DEMO_PROFILE_IDS.includes(request.profile)) {
    throw new ApiError(422, { code: 'VALIDATION_ERROR', message: 'Выберите один из подготовленных демопрофилей.' })
  }
}

function invalidCredentials(): ApiError {
  return new ApiError(401, { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' })
}

export function createMockAuthApi(options: MockAuthOptions = {}): AuthApi {
  const latency = options.latency ?? 720

  const getStorage = (kind: 'localStorage' | 'sessionStorage') => getMockStorage(options, kind)

  function setSession(storage: MockStorage, user: User): void {
    try {
      storage.setItem(MOCK_SESSION_KEY, user.id)
    } catch {
      throw storageError()
    }
  }

  function assertLoginAvailable(users: User[], login: string): void {
    if (users.some(user => user.login.toLowerCase() === login.toLowerCase())) {
      throw new ApiError(409, {
        code: 'LOGIN_TAKEN', message: 'Этот логин уже занят.',
        fields: { login: 'Этот логин уже занят.' },
      })
    }
  }

  return {
    async register(request, { signal } = {}) {
      // Snapshot the body now, just as fetch serializes it before waiting for a response.
      validateCredentialsRequest(request, 'register')
      const login = request.login
      const password = request.password
      await waitForMock(latency, signal)
      throwIfAborted(signal)

      const local = getStorage('localStorage')
      const session = getStorage('sessionStorage')
      assertLoginAvailable(readMockDatabase(local).users, login)
      const verifier = await createMockVerifier(password, signal)
      // Hashing yields to other requests. Read again before committing so two
      // concurrent registrations cannot overwrite each other or reuse a login.
      const database = readMockDatabase(local)
      assertLoginAvailable(database.users, login)
      const user = createUser((options.createId ?? (() => crypto.randomUUID()))(), login, ['operator'])
      const previousSession = readStorage(session, MOCK_SESSION_KEY)
      // Session storage is checked before committing the new account. A denied session
      // write cannot leave a login occupied after a failed registration.
      try {
        session.setItem(MOCK_SESSION_KEY, user.id)
        try {
          writeMockDatabase(local, {
            users: [...database.users, user],
            verifiers: { ...database.verifiers, [user.id]: verifier },
          })
        } catch (error) {
          if (previousSession === null) session.removeItem(MOCK_SESSION_KEY)
          else session.setItem(MOCK_SESSION_KEY, previousSession)
          throw error
        }
      } catch {
        throw storageError()
      }

      return { message: 'Аккаунт создан.', user: copyUser(user) }
    },

    async login(request, { signal } = {}) {
      validateCredentialsRequest(request, 'login')
      const { login, password } = request
      await waitForMock(latency, signal)
      throwIfAborted(signal)
      const local = getStorage('localStorage')
      const database = readMockDatabase(local)
      const found = database.users.find(user => user.login.toLowerCase() === login.toLowerCase())
      const verifier = found ? database.verifiers[found.id] : undefined
      const matches = await matchesMockVerifier(password, verifier ?? dummyVerifier, signal)
      if (!matches || !found || !verifier) throw invalidCredentials()
      const current = readMockDatabase(local)
      const user = current.users.find(user => user.id === found.id)
      const currentVerifier = current.verifiers[found.id]
      if (!user || currentVerifier?.salt !== verifier.salt || currentVerifier.hash !== verifier.hash) {
        throw invalidCredentials()
      }
      setSession(getStorage('sessionStorage'), user)
      return copyUser(user)
    },

    async demo(request, { signal } = {}) {
      validateDemoRequest(request)
      const profile = request.profile
      await waitForMock(latency, signal)
      throwIfAborted(signal)
      const user = readMockDatabase(getStorage('localStorage')).users.find(user => user.login === profile)
      if (!user) throw new ApiError(404, { code: 'NOT_FOUND', message: 'Демопрофиль не найден.' })
      setSession(getStorage('sessionStorage'), user)
      return copyUser(user)
    },

    async me({ signal } = {}) {
      await waitForMock(Math.min(latency, 180), signal)
      const id = readStorage(getStorage('sessionStorage'), MOCK_SESSION_KEY)
      const user = id === null ? undefined : readMockDatabase(getStorage('localStorage')).users.find(user => user.id === id)
      if (!user) throw new ApiError(401, { code: 'AUTH_REQUIRED', message: 'Войдите в аккаунт.' })
      return copyUser(user)
    },

    async logout({ signal } = {}) {
      await waitForMock(Math.min(latency, 180), signal)
      try {
        getStorage('sessionStorage').removeItem(MOCK_SESSION_KEY)
      } catch {
        throw storageError()
      }
    },
  }
}
