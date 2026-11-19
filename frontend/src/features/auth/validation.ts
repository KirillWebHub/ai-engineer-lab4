import type { LoginErrors, LoginRequest } from '../../types/auth'

export function validateLogin({ login, password }: LoginRequest): LoginErrors {
  const fields: LoginErrors = {}
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(login)) {
    fields.login = 'От 3 до 32 символов: латиница, цифры, точка, дефис или подчёркивание.'
  }
  // Existing accounts may have passwords that do not meet the registration policy.
  if (password.length === 0) fields.password = 'Введите пароль.'
  return fields
}
