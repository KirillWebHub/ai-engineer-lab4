import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { ArrowIcon } from '../../components/ArrowIcon'
import type { DemoProfileId, RoleId } from '../../types/auth'
import { centerOf } from './auth-ui-types'
import type { AuthFeedback, AuthInteractionProps } from './auth-ui-types'
import { DEMO_PROFILES, ROLE_LABELS } from './role-catalog'

function ProfileIcon({ role }: { role: RoleId }) {
  return (
    <svg className="demo-profile-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {role === 'operator' && <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>}
      {role === 'diagnostician' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M7.5 10.5l2 2 4-4" /></>}
      {role === 'architect' && <><rect x="8.5" y="3" width="7" height="5" rx="1" /><rect x="2" y="16" width="7" height="5" rx="1" /><rect x="15" y="16" width="7" height="5" rx="1" /><path d="M12 8v4M5.5 16v-4h13v4" /></>}
    </svg>
  )
}

export function DemoAccess({ onFeedback, onAttention, onCorrection }: AuthInteractionProps) {
  const { acceptUser } = useAuth()
  const [selected, setSelected] = useState<DemoProfileId>('operator_01')
  const [state, setState] = useState<AuthFeedback>('idle')
  const [message, setMessage] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const continueRef = useRef<HTMLAnchorElement>(null)
  const busyRef = useRef(false)
  const locked = state === 'pending' || state === 'success'

  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => { if (state === 'success') continueRef.current?.focus() }, [state])

  function changeState(next: AuthFeedback, text = '') {
    setState(next)
    setMessage(text)
    onFeedback(next)
  }

  function select(profile: DemoProfileId) {
    setSelected(profile)
    if (state === 'error') changeState('idle')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || state === 'success') return
    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    onCorrection(null)
    changeState('pending', 'Открываем демо-аккаунт…')
    try {
      const user = await authApi.demo({ profile: selected }, { signal: controller.signal })
      if (controller.signal.aborted) return
      acceptUser(user)
      changeState('success', `Вы вошли как «${user.login}». Роли: ${user.roles.map(role => ROLE_LABELS[role]).join(', ')}.`)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      changeState('error', error instanceof ApiError ? error.message : 'Не удалось открыть демо-аккаунт. Повторите попытку.')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <form
      className="demo-form" aria-labelledby="demo-title" noValidate onSubmit={submit}
      data-state={state} aria-busy={state === 'pending'}
      onFocusCapture={event => onAttention(centerOf(event.target))}
      onPointerDownCapture={event => onAttention({ x: event.clientX, y: event.clientY })}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onAttention(null) }}
    >
      <div className="form-heading">
        <h2 id="demo-title">Демо-доступ</h2>
        <p>Выберите роль для знакомства с лабораторией.</p>
      </div>
      <fieldset className="demo-profile-list" disabled={locked}>
        <legend className="sr-only">Демонстрационный профиль</legend>
        {DEMO_PROFILES.map(profile => (
          <label className="demo-profile-card" key={profile.profile}>
            <input
              type="radio" name="demo-profile" value={profile.profile}
              checked={selected === profile.profile} onChange={() => select(profile.profile)}
              aria-label={`${profile.label}, ${profile.profile}`}
              aria-describedby={`demo-${profile.profile}-description`}
            />
            <ProfileIcon role={profile.role} />
            <span className="demo-profile-copy">
              <strong>{profile.label}</strong>
              <small lang="en">{profile.profile}</small>
              <span id={`demo-${profile.profile}-description`} className="demo-profile-caption">{profile.description}</span>
            </span>
            <span className="demo-profile-check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg></span>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <p role="status" aria-live="polite" aria-atomic="true" className={`status${state === 'error' ? ' global-error' : ''}`}>{message}</p>
        {state === 'success'
          ? <Link ref={continueRef} to="/workspace/protocols" className="submit continue-link"><span className="submit-label">Открыть кабинет</span><ArrowIcon /></Link>
          : <button type="submit" className="submit" disabled={state === 'pending'}><span className="submit-label">{state === 'pending' ? 'Открываем демо-аккаунт…' : 'Войти в демо-аккаунт'}</span><ArrowIcon /><span className="submit-spinner" aria-hidden="true" /></button>}
      </div>
      <div className="auth-links">
        <Link to="/login" className="auth-link">Войти с паролем</Link>
        <Link to="/register" className="auth-link">Создать аккаунт</Link>
      </div>
      <p className="preview-note">Учебные аккаунты с разными правами. Вход без пароля.</p>
    </form>
  )
}
