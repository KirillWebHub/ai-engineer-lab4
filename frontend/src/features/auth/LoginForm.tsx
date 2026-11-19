import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { ArrowIcon } from '../../components/ArrowIcon'
import type { RegistrationErrors } from '../../types/auth'
import { centerOf } from './auth-ui-types'
import type { AuthFeedback, AuthInteractionProps } from './auth-ui-types'
import { PasswordField } from './PasswordField'
import { ROLE_LABELS } from './role-catalog'
import { validateLogin } from './validation'

export function LoginForm({ onFeedback, onPasswordVisibility, onAttention, onCorrection }: AuthInteractionProps) {
  const { acceptUser } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<AuthFeedback>('idle')
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
  useEffect(() => { if (state === 'success') continueRef.current?.focus() }, [state])
  useEffect(() => {
    if (!errorFocus) return
    const field = errorFocus.field === 'login' ? loginRef.current
      : errorFocus.field === 'password' ? passwordRef.current : null
    field?.focus()
    onCorrection(field ? centerOf(field) : null)
  }, [errorFocus, onCorrection])

  function changeState(next: AuthFeedback, text = '') {
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
    const fields = validateLogin({ login, password })
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
    changeState('pending', 'Входим в аккаунт…')
    try {
      const user = await authApi.login({ login, password }, { signal: controller.signal })
      if (controller.signal.aborted) return
      acceptUser(user)
      setPassword('')
      setVisible(false)
      onPasswordVisibility(false)
      changeState('success', `Вы вошли как «${user.login}». Роли: ${user.roles.map(role => ROLE_LABELS[role]).join(', ')}.`)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      // A credential mismatch is one general error; it never identifies which value exists.
      const fields: RegistrationErrors = error instanceof ApiError && error.status === 422
        ? { login: error.fields?.login, password: error.fields?.password }
        : {}
      setErrors(fields)
      const text = error instanceof ApiError && error.status === 401
        ? 'Неверный логин или пароль.'
        : error instanceof ApiError ? error.message : 'Не удалось войти. Повторите попытку.'
      changeState('error', text)
      setErrorFocus({ field: fields.password && !fields.login ? 'password' : 'login' })
    } finally {
      busyRef.current = false
    }
  }

  return (
    <form
      aria-labelledby="login-title" noValidate onSubmit={submit} data-state={state} aria-busy={state === 'pending'}
      onFocusCapture={event => onAttention(centerOf(event.target))}
      onPointerDownCapture={event => onAttention({ x: event.clientX, y: event.clientY })}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onAttention(null) }}
    >
      <div className="form-heading">
        <h2 id="login-title">Войти в аккаунт</h2>
        <p>Продолжите работу с протоколами испытаний.</p>
      </div>
      <div className="form-field">
        <label htmlFor="login-username">Логин</label>
        <input
          ref={loginRef} id="login-username" name="login" type="text" placeholder="student_01"
          autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={locked}
          value={login} onChange={event => edit('login', event.target.value)} aria-invalid={Boolean(errors.login)}
          aria-describedby={errors.login ? 'login-username-error' : undefined}
        />
        {errors.login && <p id="login-username-error" className="field-error">{errors.login}</p>}
      </div>
      <PasswordField
        inputRef={passwordRef} id="login-password" autoComplete="current-password" readOnly={locked}
        value={password} visible={visible} error={errors.password}
        onChange={value => edit('password', value)} onToggle={togglePassword}
      />
      <div className="actions">
        <p role="status" aria-live="polite" aria-atomic="true" className={`status${state === 'error' && !errors.login && !errors.password ? ' global-error' : ''}`}>{message}</p>
        {state === 'success'
          ? <Link ref={continueRef} to="/workspace/protocols" className="submit continue-link"><span className="submit-label">Открыть кабинет</span><ArrowIcon /></Link>
          : <button type="submit" className="submit" disabled={state === 'pending'}><span className="submit-label">{state === 'pending' ? 'Входим в аккаунт…' : 'Войти'}</span><ArrowIcon /><span className="submit-spinner" aria-hidden="true" /></button>}
      </div>
      <div className="auth-links">
        <Link to="/register" className="auth-link">Создать аккаунт</Link>
        <Link to="/demo" className="auth-link">Демо-доступ</Link>
      </div>
      <p className="preview-note">Учебный стенд. Используйте аккаунт, созданный в этом браузере.</p>
    </form>
  )
}
