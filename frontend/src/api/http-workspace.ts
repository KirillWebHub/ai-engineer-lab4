import type { User } from '../types/auth'
import type { Role, Run, RunSummary, WorkspaceApi } from '../types/workspace'
import { createHttpClient } from './http-client'

export function createHttpWorkspaceApi(baseUrl = '/api'): WorkspaceApi {
  const request = createHttpClient(baseUrl)
  return {
    listRuns: options => request<RunSummary[]>('/runs', 'GET', options),
    getRun: (runId, options) => request<Run>(`/runs/${encodeURIComponent(runId)}`, 'GET', options),
    reviewRun: (runId, body, options) => request<Run>(`/runs/${encodeURIComponent(runId)}/review`, 'PATCH', options, body),
    listRoles: options => request<Role[]>('/roles', 'GET', options),
    listUsers: options => request<User[]>('/users', 'GET', options),
    setUserRoles: (userId, body, options) => request<User>(`/users/${encodeURIComponent(userId)}/roles`, 'PUT', options, body),
  }
}
