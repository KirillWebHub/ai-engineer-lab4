import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { ArrowIcon } from '../../components/ArrowIcon'
import type { RegistrationErrors } from '../../types/auth'
import { validateRegistration } from './validation'
import { PasswordField } from '../auth/PasswordField'
import { centerOf } from '../auth/auth-ui-types'
import type { AuthInteractionProps } from '../auth/auth-ui-types'

type Feedback = 'idle' | 'pending' | 'success' | 'error'
export function RegistrationForm({ onFeedback, onPasswordVisibility, onAttention, onCorrection }: AuthInteractionProps) {
  const { acceptUser } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<Feedback>('idle')
  const [errors, setErrors] = useState<RegistrationErrors>({})
  const [message, setMessage] = useState('')
  const [errorFocus, setErrorFocus] = useState<{ field: 'login' | 'password' | null } | null>(null)
  const loginRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const continueRef = useRef<HTMLAnchorElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const locked = state === 'pending' || state === 'success'

  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    if (state === 'success') continueRef.current?.focus()
  }, [state])
  useEffect(() => {
    if (!errorFocus) return
    const field = errorFocus.field === 'login' ? loginRef.current
      : errorFocus.field === 'password' ? passwordRef.current : null
    field?.focus()
    onCorrection(field ? centerOf(field) : null)
  }, [errorFocus, onCorrection])

  function changeState(next: Feedback, text = '') {
    setState(next)
    setMessage(text)
    onFeedback(next)
  }

  function focusError(fields: RegistrationErrors) {
    setErrorFocus({ field: fields.login ? 'login' : fields.password ? 'password' : null })
  }

  function edit(field: 'login' | 'password', value: string) {
    if (field === 'login') setLogin(value)
    else setPassword(value)
    setErrors(current => ({ ...current, [field]: undefined }))
    onCorrection(null)
    if (state === 'error') changeState('idle')
  }

  function togglePassword() {
    setVisible(!visible)
    onPasswordVisibility(!visible)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || state === 'success') return
    const fields = validateRegistration({ login, password })
    setErrors(fields)
    if (fields.login || fields.password) {
      changeState('error', 'Проверьте выделенные поля.')
      focusError(fields)
      return
    }
    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    onCorrection(null)
    changeState('pending', 'Создаём аккаунт…')
    try {
      const result = await authApi.register({ login, password }, { signal: controller.signal })
      if (controller.signal.aborted) return
      acceptUser(result.user)
      setPassword('')
      setVisible(false)
      onPasswordVisibility(false)
      changeState('success', `Аккаунт «${result.user.login}» создан. Вам назначена роль Оператора.`)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      const fields: RegistrationErrors = error instanceof ApiError
        ? { login: error.fields?.login, password: error.fields?.password }
        : {}
      setErrors(fields)
      changeState('error', error instanceof ApiError ? error.message : 'Не удалось создать аккаунт. Повторите попытку.')
      focusError(fields)
    } finally {
      busyRef.current = false
    }
  }

  return (
    <form
      aria-labelledby="registration-title" noValidate onSubmit={submit} data-state={state}
      aria-busy={state === 'pending'}
      onFocusCapture={event => onAttention(centerOf(event.target))}
      onPointerDownCapture={event => onAttention({ x: event.clientX, y: event.clientY })}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onAttention(null) }}
    >
      <div className="form-heading">
        <h2 id="registration-title">Создать аккаунт</h2>
        <p>Новый аккаунт получит роль Оператора и доступ к протоколам испытаний.</p>
      </div>
      <div className="form-field">
        <label htmlFor="registration-login">Логин</label>
        <input
          ref={loginRef} id="registration-login" name="login" type="text" placeholder="student_01"
          autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={locked}
          value={login} onChange={event => edit('login', event.target.value)}
          aria-invalid={Boolean(errors.login)}
          aria-describedby={`login-hint${errors.login ? ' login-error' : ''}`}
        />
        <p id="login-hint" className="hint">3–32 символа. Латиница, цифры, точка, дефис или подчёркивание.</p>
        {errors.login && <p id="login-error" className="field-error">{errors.login}</p>}
      </div>
      <PasswordField
        inputRef={passwordRef} id="registration-password" autoComplete="new-password" readOnly={locked}
        value={password} visible={visible} error={errors.password}
        hint="От 8 символов, включая заглавную и строчную буквы, цифру и спецсимвол."
        onChange={value => edit('password', value)} onToggle={togglePassword}
      />
      <div className="actions">
        <p role="status" aria-live="polite" aria-atomic="true" className={`status${state === 'error' && !errors.login && !errors.password ? ' global-error' : ''}`}>{message}</p>
        {state === 'success'
          ? <Link ref={continueRef} to="/workspace/protocols" className="submit continue-link"><span className="submit-label">Открыть кабинет</span><ArrowIcon /></Link>
          : <button type="submit" className="submit" disabled={state === 'pending'}><span className="submit-label">{state === 'pending' ? 'Создаём аккаунт…' : 'Создать аккаунт'}</span><ArrowIcon /><span className="submit-spinner" aria-hidden="true" /></button>}
      </div>
      <div className="auth-links"><Link to="/login" className="auth-link">Уже есть аккаунт? Войти</Link></div>
      <p className="preview-note">Учебный макет. Для регистрации используйте вымышленные данные.</p>
    </form>
  )
}
