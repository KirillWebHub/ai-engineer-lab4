import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/useAuth'

export function ApplicationFrame({ children, className = '', header, skipTargetId = 'page-content' }: { children: ReactNode; className?: string; header?: ReactNode; skipTargetId?: string }) {
  const { user } = useAuth()
  return <>
    <div className="depth-background" aria-hidden="true"><div className="depth-grid" /></div>
    <a href={`#${skipTargetId}`} className="skip-link">Перейти к содержимому</a>
    <main className={`application-window ${className}`}>
      <div className="topline">
        <span className="window-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="window-title">Лабораторная работа №4</span>
      </div>
      {header ?? <header className="application-header">
        <Link to={user ? '/workspace/protocols' : '/login'} className="brand"><img src="/assets/interface/engineer-mark.svg" alt="" width="30" height="30" /><span lang="en">AI Engineer</span></Link>
        <span className="mono">ЛАБОРАТОРИЯ ДОСТУПА</span>
        <Link className="mono section-link" to={user ? '/workspace/protocols' : '/demo'}>{user ? 'Кабинет ↗' : 'Демо-доступ ↗'}</Link>
      </header>}
      <div id="page-content" tabIndex={-1}>{children}</div>
    </main>
  </>
}
