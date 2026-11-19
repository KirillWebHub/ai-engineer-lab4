import { describe, expect, it } from 'vitest'
import { validateRegistration } from './validation'

describe('registration validation', () => {
  it('accepts Cyrillic letters and Unicode punctuation in passwords', () => {
    expect(validateRegistration({ login: 'pilot_04', password: 'Жя12345—' })).toEqual({})
  })

  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(validateRegistration({ login: 'pilot_04', password: 'Aa1😀😀😀' }).password).toBeTruthy()
    expect(validateRegistration({ login: 'pilot_04', password: 'Aa1😀😀😀😀😀' })).toEqual({})
  })

  it('requires an ASCII digit and punctuation or a symbol; spaces do not suffice', () => {
    expect(validateRegistration({ login: 'pilot_04', password: 'Abcdefg1 ' }).password).toBeTruthy()
    expect(validateRegistration({ login: 'pilot_04', password: 'Abcdefg١!' }).password).toBeTruthy()
    expect(validateRegistration({ login: 'pilot_04', password: 'Abcdefg1 ' + '😀' })).toEqual({})
  })

  it('validates the exact login without silently trimming it', () => {
    for (const login of ['ab', 'юзер', ' pilot_04', 'pilot_04 ', 'a'.repeat(33)]) {
      expect(validateRegistration({ login, password: 'Workshop!42' }).login).toBeTruthy()
    }
    for (const login of ['abc', 'Pilot-04.test', 'a'.repeat(32)]) {
      expect(validateRegistration({ login, password: 'Workshop!42' })).toEqual({})
    }
  })
})
