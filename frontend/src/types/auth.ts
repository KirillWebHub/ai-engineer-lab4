export type RoleId = 'operator' | 'diagnostician' | 'architect'

export type Permission = 'runs:read' | 'runs:review' | 'roles:manage'

export interface User {
  id: string
  login: string
  roles: RoleId[]
  permissions: Permission[]
}

export interface RegisterRequest {
  login: string
  password: string
}

export interface LoginRequest {
  login: string
  password: string
}

export type DemoProfileId = 'operator_01' | 'diagnostics_01' | 'architect_01' | 'student'

export interface DemoRequest {
  profile: DemoProfileId
}

export interface RegisterResponse {
  message: string
  user: User
}

export interface RequestOptions {
  signal?: AbortSignal
}

export interface AuthApi {
  register(request: RegisterRequest, options?: RequestOptions): Promise<RegisterResponse>
  login(request: LoginRequest, options?: RequestOptions): Promise<User>
  demo(request: DemoRequest, options?: RequestOptions): Promise<User>
  me(options?: RequestOptions): Promise<User>
  logout(options?: RequestOptions): Promise<void>
}

export type RegistrationErrors = Partial<Record<keyof RegisterRequest, string>>
export type LoginErrors = Partial<Record<keyof LoginRequest, string>>
