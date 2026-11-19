import type { AuthApi, RegisterResponse, User } from '../types/auth'
import { createHttpClient } from './http-client'

export function createHttpAuthApi(baseUrl = '/api'): AuthApi {
  const request = createHttpClient(baseUrl)
  return {
    register: (body, options) => request<RegisterResponse>('/register', 'POST', options, body),
    login: (body, options) => request<User>('/auth/login', 'POST', options, body),
    demo: (body, options) => request<User>('/auth/demo', 'POST', options, body),
    me: options => request<User>('/me', 'GET', options),
    logout: options => request<void>('/auth/logout', 'POST', options),
  }
}
