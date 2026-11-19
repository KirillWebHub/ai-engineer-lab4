import type { RegisterRequest, RegistrationErrors } from '../../types/auth'

export function validateRegistration({ login, password }: RegisterRequest): RegistrationErrors {
  const fields: RegistrationErrors = {}

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(login)) {
    fields.login = 'От 3 до 32 символов: латиница, цифры, точка, дефис или подчёркивание.'
  }

  if (
    [...password].length < 8 ||
    !/\p{Lu}/u.test(password) ||
    !/\p{Ll}/u.test(password) ||
    !/[0-9]/.test(password) ||
    !/[\p{P}\p{S}]/u.test(password)
  ) {
    fields.password = 'От 8 символов: заглавная и строчная буквы, цифра и спецсимвол.'
  }

  return fields
}
