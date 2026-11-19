import { useEffect, useState } from 'react'
import { workspaceApi } from '../../api/client'
import { useAuth } from '../../app/useAuth'
import { WorkspaceState } from '../../components/workspace/WorkspaceState'
import { useWorkspaceFeedback } from '../../components/workspace/workspace-feedback'
import type { Permission } from '../../types/auth'
import type { Role } from '../../types/workspace'
import { PERMISSION_LABELS } from '../auth/role-catalog'

export function RoleMatrixPage() {
  const { user } = useAuth()
  const feedback = useWorkspaceFeedback()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void workspaceApi.listRoles({ signal: controller.signal }).then(next => {
      if (controller.signal.aborted) return
      setRoles(next)
      setError(null)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setError(error)
      feedback('error')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision, feedback])

  function retry() {
    setLoading(true)
    setError(null)
    setRevision(current => current + 1)
  }

  const permissions: Permission[] = [...new Set(roles.flatMap(role => role.permissions))]
  return <>
    <div className="wb-page-header">
      <h1>Матрица ролей</h1>
      <p>Права складываются из всех назначенных ролей. Оператор читает протоколы, Диагност проверяет их, Архитектор назначает роли.</p>
    </div>
    <WorkspaceState loading={loading} error={error} onRetry={retry}>
      {roles.length === 0 ? <p className="wb-empty">Роли пока не настроены.</p> : <>
        <div className="wb-table-wrap" role="region" aria-label="Сравнение прав ролей" tabIndex={0}>
          <table className="wb-table wb-role-matrix">
            <caption>Доступные действия по ролям</caption>
            <thead><tr><th scope="col">Роль</th>{permissions.map(permission => <th scope="col" key={permission}>{PERMISSION_LABELS[permission]}</th>)}</tr></thead>
            <tbody>{roles.map(role => <tr key={role.id}>
              <th scope="row"><span className="wb-role-name">{role.label}</span>{user?.roles.includes(role.id) && <span className="wb-badge">Ваша роль</span>}<span className="wb-role-description">{role.description}</span></th>
              {permissions.map(permission => <td key={permission}><span className={role.permissions.includes(permission) ? 'wb-permission-allowed' : 'wb-permission-denied'}>{role.permissions.includes(permission) ? 'Разрешено' : 'Нет'}</span></td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <section className="wb-current-permissions" aria-labelledby="current-permissions-title">
          <h2 id="current-permissions-title">Ваши действующие права</h2>
          {user?.permissions.length ? <ul>{user.permissions.map(permission => <li key={permission}>{PERMISSION_LABELS[permission]}</li>)}</ul> : <p>Для текущего аккаунта нет разрешённых действий.</p>}
        </section>
      </>}
    </WorkspaceState>
  </>
}
