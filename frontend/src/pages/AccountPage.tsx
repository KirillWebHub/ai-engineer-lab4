import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/errors'
import { useAuth } from '../app/useAuth'
import { ApplicationFrame } from '../components/layout/ApplicationFrame'
import { RobotViewer } from '../components/robot/RobotViewer'
import { ROLE_LABELS, PERMISSION_LABELS } from '../features/auth/role-catalog'

export function AccountPage() {
  const { user, restoring, restoreError, restoreSession, logout } = useAuth()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  async function leave() {
    if (leaving) return
    setLeaving(true)
    setError('')
    try { await logout(); void navigate('/login', { replace: true }) }
    catch (error: unknown) { setError(error instanceof ApiError ? error.message : 'Не удалось выйти. Повторите попытку.'); setLeaving(false) }
  }
  return <ApplicationFrame>
    <div className="layout">
      <section className="scene" aria-label="Робот AI Engineer">
        <div className="scene-index mono" aria-hidden="true">ПРОГРАММНО-АППАРАТНАЯ ЗАЩИТА</div>
        <RobotViewer feedback="idle" feedbackKey={0} passwordVisible={false} attentionTarget={null} />
        <div className="scene-title"><h1><span>Программно-аппаратные средства защиты информации</span></h1></div>
      </section>
      <section className="registration" aria-labelledby="account-title">
        <div className="account-panel">
          {restoring && !user ? <p role="status">Восстанавливаем сессию…</p>
            : restoreError ? <><h2 id="account-title">Сессия недоступна</h2><p role="alert">{restoreError}</p><button type="button" className="secondary-action" onClick={restoreSession}>Повторить</button></>
            : !user ? <><h2 id="account-title">Войдите в лабораторию</h2><p>Войдите в свой аккаунт или выберите демо-профиль.</p><Link to="/login" className="secondary-action">Войти</Link><Link to="/demo" className="auth-link account-demo-link">Демо-доступ</Link></>
            : <>
              <span className="account-state">Сессия активна</span>
              <h2 id="account-title">Ваш профиль</h2>
              <dl className="profile-details"><div><dt>Логин</dt><dd>{user.login}</dd></div><div><dt>{user.roles.length > 1 ? 'Роли' : 'Роль'}</dt><dd>{user.roles.map(role => ROLE_LABELS[role]).join(', ')}</dd></div></dl>
              <p className="profile-permissions-title">Права аккаунта</p>
              <ul className="profile-permissions">{user.permissions.map(permission => <li key={permission}>{PERMISSION_LABELS[permission]}</li>)}</ul>
              <Link to="/workspace/protocols" className="secondary-action">Открыть кабинет</Link>
              {error && <p role="alert" className="field-error">{error}</p>}
              <button className="secondary-action" type="button" onClick={() => { void leave() }} disabled={leaving}>{leaving ? 'Выходим…' : 'Выйти из аккаунта'}</button>
              <Link to="/demo" className="auth-link account-demo-link">Сменить демо-профиль</Link>
            </>}
        </div>
      </section>
    </div>
  </ApplicationFrame>
}
