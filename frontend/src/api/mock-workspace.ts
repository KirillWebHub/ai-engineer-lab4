import type { RoleId } from '../types/auth'
import type { ReviewRunRequest, Role, Run, RunSummary, SetUserRolesRequest, WorkspaceApi } from '../types/workspace'
import { ApiError } from './errors'
import { throwIfAborted } from './mock-credentials'
import { copyUser, createUser, getMockStorage, invalidData, isRole, permissionsFor, readStorage, requirePermission, storageError, uuidPattern, waitForMock, writeMockDatabase } from './mock-repository'
import type { MockRepositoryOptions, MockStorage } from './mock-repository'

export const MOCK_RUNS_KEY = 'ai-engineer.react.runs.v1'

interface MockWorkspaceOptions extends MockRepositoryOptions {
  now?: () => Date
}

const initialRuns: readonly Run[] = [
  {
    id: 'AE-041', title: 'Реакция на курсор', robot: 'AI Engineer', date: '2026-11-04', status: 'pending',
    summary: 'Робот отслеживает курсор и возвращает взгляд в центр, когда указатель покидает стенд. Проверена реакция возле полей формы.',
    reviewedBy: null, reviewedAt: null,
  },
  {
    id: 'AE-040', title: 'Индикация на визоре', robot: 'AI Engineer', date: '2026-11-03', status: 'approved',
    summary: 'На успешную регистрацию робот отвечает галочкой, на ошибку — крестиком. После каждого сигнала визор плавно возвращается к обычному выражению.',
    reviewedBy: 'diagnostics_01', reviewedAt: '2026-11-03T15:20:00.000Z',
  },
  {
    id: 'AE-039', title: 'Калибровка шарниров', robot: 'AI Engineer', date: '2026-11-03', status: 'rejected',
    summary: 'При быстром движении руки правый шарнир выходит за пределы рабочего угла. Нужна повторная проверка после коррекции амплитуды.',
    reviewedBy: 'diagnostics_01', reviewedAt: '2026-11-03T14:10:00.000Z',
  },
]

const roleDescriptions: Array<{ id: RoleId; label: string; description: string }> = [
  { id: 'operator', label: 'Оператор', description: 'Читает протоколы испытаний робота.' },
  { id: 'diagnostician', label: 'Диагност', description: 'Читает протоколы, принимает их или возвращает на доработку.' },
  { id: 'architect', label: 'Архитектор', description: 'Проверяет протоколы и назначает роли участникам стенда.' },
]

function runSummary({ id, title, robot, date, status }: Run): RunSummary {
  return { id, title, robot, date, status }
}

function parseRun(value: unknown): Run | null {
  if (typeof value !== 'object' || value === null) return null
  const run = value as Record<string, unknown>
  if (typeof run.id !== 'string' || !run.id || typeof run.title !== 'string' ||
    typeof run.robot !== 'string' || typeof run.summary !== 'string' ||
    typeof run.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(run.date) || Number.isNaN(Date.parse(run.date)) ||
    (run.status !== 'pending' && run.status !== 'approved' && run.status !== 'rejected') ||
    (run.reviewedBy !== null && typeof run.reviewedBy !== 'string') ||
    (run.reviewedAt !== null && (typeof run.reviewedAt !== 'string' || Number.isNaN(Date.parse(run.reviewedAt))))) return null
  return {
    id: run.id, title: run.title, robot: run.robot, summary: run.summary, date: run.date, status: run.status,
    reviewedBy: run.reviewedBy, reviewedAt: run.reviewedAt,
  }
}

function readRuns(storage: MockStorage): Run[] {
  const saved = readStorage(storage, MOCK_RUNS_KEY)
  if (saved === null) return initialRuns.map(run => ({ ...run }))
  try {
    const data: unknown = JSON.parse(saved)
    if (typeof data !== 'object' || data === null || !('version' in data) || data.version !== 1 ||
      !('runs' in data) || !Array.isArray(data.runs)) throw invalidData()
    const runs = data.runs.map(parseRun)
    if (runs.some(run => run === null)) throw invalidData()
    const validRuns = runs as Run[]
    if (new Set(validRuns.map(run => run.id)).size !== validRuns.length) throw invalidData()
    return validRuns
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw invalidData()
  }
}

function writeRuns(storage: MockStorage, runs: Run[]): void {
  try {
    storage.setItem(MOCK_RUNS_KEY, JSON.stringify({ version: 1, runs }))
  } catch {
    throw storageError()
  }
}

function notFound(kind: 'run' | 'user'): ApiError {
  return new ApiError(404, { code: 'NOT_FOUND', message: kind === 'run' ? 'Протокол не найден.' : 'Участник не найден.' })
}

function validateReview(request: ReviewRunRequest): void {
  if (typeof request !== 'object' || request === null || Array.isArray(request) || Object.keys(request).length !== 1 ||
    !Object.hasOwn(request, 'status') || (request.status !== 'approved' && request.status !== 'rejected')) {
    throw new ApiError(422, {
      code: 'VALIDATION_ERROR', message: 'Выберите результат проверки.',
      fields: { status: 'Протокол можно принять или вернуть на доработку.' },
    })
  }
}

function validateRoles(userId: string, request: SetUserRolesRequest): void {
  if (typeof userId !== 'string' || !uuidPattern.test(userId)) {
    throw new ApiError(422, { code: 'VALIDATION_ERROR', message: 'Некорректный идентификатор участника.', fields: { userId: 'Ожидается UUID участника.' } })
  }
  if (typeof request !== 'object' || request === null || Array.isArray(request) || Object.keys(request).length !== 1 ||
    !Object.hasOwn(request, 'roles') || !Array.isArray(request.roles) || !request.roles.length ||
    ![...request.roles].every(isRole) || new Set(request.roles).size !== request.roles.length) {
    throw new ApiError(422, {
      code: 'VALIDATION_ERROR', message: 'Проверьте набор ролей.',
      fields: { roles: 'Выберите хотя бы одну роль без повторов.' },
    })
  }
}

export function createMockWorkspaceApi(options: MockWorkspaceOptions = {}): WorkspaceApi {
  const latency = options.latency ?? 420
  const local = () => getMockStorage(options, 'localStorage')
  const wait = async (signal?: AbortSignal) => {
    await waitForMock(latency, signal)
    throwIfAborted(signal)
  }

  return {
    async listRuns({ signal } = {}) {
      await wait(signal)
      requirePermission(options, 'runs:read')
      return readRuns(local())
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .map(runSummary)
    },

    async getRun(runId, { signal } = {}) {
      await wait(signal)
      requirePermission(options, 'runs:read')
      const run = readRuns(local()).find(run => run.id === runId)
      if (!run) throw notFound('run')
      return { ...run }
    },

    async reviewRun(runId, request, { signal } = {}) {
      validateReview(request)
      const status = request.status
      await wait(signal)
      requirePermission(options, 'runs:review')
      const storage = local()
      const runs = readRuns(storage)
      // Check the live session and roles after all asynchronous work and before
      // touching persisted state; callers cannot bypass RBAC with a stale user.
      const { user } = requirePermission(options, 'runs:review')
      const index = runs.findIndex(run => run.id === runId)
      if (index < 0) throw notFound('run')
      const current = runs[index]
      if (current.status === status) return { ...current }
      const next: Run = { ...current, status, reviewedBy: user.login, reviewedAt: (options.now?.() ?? new Date()).toISOString() }
      const updated = runs.map((run, position) => position === index ? next : run)
      writeRuns(storage, updated)
      return { ...next }
    },

    async listRoles({ signal } = {}) {
      await wait(signal)
      return roleDescriptions.map(role => ({ ...role, permissions: permissionsFor([role.id]) })) satisfies Role[]
    },

    async listUsers({ signal } = {}) {
      await wait(signal)
      const { database } = requirePermission(options, 'roles:manage')
      return database.users.map(copyUser).sort((a, b) => a.login.toLowerCase().localeCompare(b.login.toLowerCase()))
    },

    async setUserRoles(userId, request, { signal } = {}) {
      validateRoles(userId, request)
      const roles = [...request.roles]
      await wait(signal)
      const { database } = requirePermission(options, 'roles:manage')
      const index = database.users.findIndex(user => user.id.toLowerCase() === userId.toLowerCase())
      if (index < 0) throw notFound('user')
      const current = database.users[index]
      if (current.roles.length === roles.length && current.roles.every(role => roles.includes(role))) return copyUser(current)
      const next = createUser(current.id, current.login, roles)
      writeMockDatabase(local(), {
        users: database.users.map((user, position) => position === index ? next : user),
        verifiers: database.verifiers,
      })
      return copyUser(next)
    },
  }
}
