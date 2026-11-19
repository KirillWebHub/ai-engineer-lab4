import { describe, expect, it } from 'vitest'
import { validateLogin } from './validation'

describe('login validation', () => {
  it('checks login format without trimming it', () => {
    expect(validateLogin({ login: ' pilot_04', password: 'x' }).login).toBeTruthy()
    expect(validateLogin({ login: 'pilot_04 ', password: 'x' }).login).toBeTruthy()
    expect(validateLogin({ login: 'Pilot_04', password: 'x' })).toEqual({})
  })

  it('requires a nonempty password without imposing registration strength or trimming spaces', () => {
    expect(validateLogin({ login: 'pilot_04', password: '' })).toEqual({ password: 'Введите пароль.' })
    expect(validateLogin({ login: 'pilot_04', password: ' ' })).toEqual({})
    expect(validateLogin({ login: 'pilot_04', password: 'x' })).toEqual({})
  })
})
