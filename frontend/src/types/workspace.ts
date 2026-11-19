import type { Permission, RequestOptions, RoleId, User } from './auth'

export interface Role {
  id: RoleId
  label: string
  description: string
  permissions: Permission[]
}

export type RunStatus = 'pending' | 'approved' | 'rejected'

export interface RunSummary {
  id: string
  title: string
  robot: string
  date: string
  status: RunStatus
}

export interface Run extends RunSummary {
  summary: string
  reviewedBy: string | null
  reviewedAt: string | null
}

export interface ReviewRunRequest {
  status: 'approved' | 'rejected'
}

export interface SetUserRolesRequest {
  roles: RoleId[]
}

export interface WorkspaceApi {
  listRuns(options?: RequestOptions): Promise<RunSummary[]>
  getRun(runId: string, options?: RequestOptions): Promise<Run>
  reviewRun(runId: string, request: ReviewRunRequest, options?: RequestOptions): Promise<Run>
  listRoles(options?: RequestOptions): Promise<Role[]>
  listUsers(options?: RequestOptions): Promise<User[]>
  setUserRoles(userId: string, request: SetUserRolesRequest, options?: RequestOptions): Promise<User>
}
