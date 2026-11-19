import { createHttpAuthApi } from './http-auth'
import { createMockAuthApi } from './mock-auth'
import { createHttpWorkspaceApi } from './http-workspace'
import { createMockWorkspaceApi } from './mock-workspace'

export const authApi = import.meta.env.VITE_API_MODE === 'http'
  ? createHttpAuthApi()
  : createMockAuthApi()

export const workspaceApi = import.meta.env.VITE_API_MODE === 'http'
  ? createHttpWorkspaceApi()
  : createMockWorkspaceApi()
