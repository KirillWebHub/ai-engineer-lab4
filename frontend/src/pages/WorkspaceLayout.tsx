import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/errors'
import { useAuth } from '../app/useAuth'
import { ApplicationFrame } from '../components/layout/ApplicationFrame'
import { RobotViewer } from '../components/robot/RobotViewer'
import type { RobotFeedback } from '../components/robot/robotTypes'
import { WorkspaceState } from '../components/workspace/WorkspaceState'
import { WorkspaceFeedbackContext } from '../components/workspace/workspace-feedback'
import { ROLE_LABELS } from '../features/auth/role-catalog'

function NavigationIcon({ kind }: { kind: 'runs' | 'roles' | 'users' | 'demo' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {kind === 'runs' && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>}
    {kind === 'roles' && <><path d="m12 3 8 3v5c0 4.4-3 7.8-8 10-5-2.2-8-5.6-8-10V6zM9 12l2 2 4-4" /></>}
    {kind === 'users' && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 5a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2" /></>}
    {kind === 'demo' && <><path d="M8 3h8M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M8 15h8" /></>}
  </svg>
}

export function WorkspaceLayout() {
  const { user, restoring, restoreError, restoreSession, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const content = useRef<HTMLElement>(null)
  const [leaving, setLeaving] = useState(false)
  const [exitError, setExitError] = useState('')
  const [robot, setRobot] = useState({ feedback: 'idle' as RobotFeedback, key: 0 })
  const feedback = useCallback((next: RobotFeedback) => setRobot(previous => ({ feedback: next, key: previous.key + 1 })), [])
  const canManage = user?.permissions.includes('roles:manage') ?? false
  const notice = location.state && typeof location.state.notice === 'string' ? location.state.notice as string : ''

  useEffect(() => {
    content.current?.scrollTo?.({ top: 0 })
    content.current?.focus({ preventScroll: true })
  }, [location.pathname])

  async function leave() {
    if (leaving) return
    setLeaving(true)
    setExitError('')
    try { await logout(); void navigate('/login', { replace: true }) }
    catch (error: unknown) {
      setExitError(error instanceof ApiError ? error.message : 'Не удалось выйти. Повторите попытку.')
      feedback('error')
      setLeaving(false)
    }
  }

  if (!restoring && !restoreError && !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <WorkspaceFeedbackContext value={feedback}>
    <ApplicationFrame className="wb-window" skipTargetId="workspace-content" header={<header className="application-header wb-header">
      <Link to="/workspace/protocols" className="brand"><img src="/assets/interface/engineer-mark.svg" alt="" width="30" height="30" /><span lang="en">AI Engineer</span></Link>
      <div className="wb-identity"><span className="wb-online" aria-hidden="true" /><span>{user?.login ?? 'Подключаемся…'}{user && <small>{user.roles.map(role => ROLE_LABELS[role]).join(', ')}</small>}</span></div>
      <div className="wb-header-actions"><Link to="/account">Профиль</Link><button type="button" disabled={leaving} onClick={() => { void leave() }}>{leaving ? 'Выходим…' : 'Выйти'}</button></div>
    </header>}>
      <div className="wb-frame">
        <aside className="wb-rail">
          <nav className="wb-nav" aria-label="Разделы кабинета">
            <NavLink to="/workspace/protocols"><NavigationIcon kind="runs" />Протоколы</NavLink>
            <NavLink to="/workspace/roles"><NavigationIcon kind="roles" />Матрица ролей</NavLink>
            {canManage && <NavLink to="/workspace/users"><NavigationIcon kind="users" />Участники</NavLink>}
            <Link to="/demo"><NavigationIcon kind="demo" />Демо-доступ</Link>
          </nav>
          <div className="wb-rail-footer">
            <div className="wb-mascot" aria-hidden="true"><RobotViewer framing="portrait" feedback={robot.feedback} feedbackKey={robot.key} passwordVisible={false} attentionTarget={null} /></div>
            <p className="wb-rail-note">Вариант 3<span>Ролевая модель доступа</span></p>
          </div>
        </aside>
        <section ref={content} id="workspace-content" className="wb-content" aria-label="Рабочая область" tabIndex={-1}>
          {notice && <p className="wb-notice" role="status">{notice}</p>}
          {exitError && <p className="wb-inline-status" role="alert">{exitError}</p>}
          {restoring && !user ? <WorkspaceState loading />
            : restoreError ? <WorkspaceState error={new Error(restoreError)} onRetry={restoreSession} />
            : user ? <Outlet /> : null}
        </section>
      </div>
    </ApplicationFrame>
  </WorkspaceFeedbackContext>
}
