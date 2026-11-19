import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, workspaceApi } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { WorkspaceState } from '../../components/workspace/WorkspaceState'
import { useWorkspaceFeedback } from '../../components/workspace/workspace-feedback'
import type { Permission, RoleId, User } from '../../types/auth'
import type { Role } from '../../types/workspace'
import { PERMISSION_LABELS, ROLE_LABELS } from '../auth/role-catalog'

interface Directory {
  ownerId: string
  users: User[]
  roles: Role[]
}

type SaveState =
  | { kind: 'idle' | 'saving' | 'refreshing' | 'success'; message?: string }
  | { kind: 'error' | 'refresh-error'; message: string }

const forbidden = new ApiError(403, {
  code: 'FORBIDDEN',
  message: 'Назначать роли может только аккаунт с правом управления участниками.',
})

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function sameRoles(left: RoleId[], right: RoleId[]) {
  return left.length === right.length && left.every(role => right.includes(role))
}

export function ParticipantsPage() {
  const { user, acceptUser } = useAuth()
  const navigate = useNavigate()
  const feedback = useWorkspaceFeedback()
  const canManage = Boolean(user?.permissions.includes('roles:manage'))
  const ownerId = user?.id ?? ''
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<RoleId[]>([])
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const requestRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!canManage) return
    const controller = new AbortController()
    void Promise.all([
      workspaceApi.listUsers({ signal: controller.signal }),
      workspaceApi.listRoles({ signal: controller.signal }),
    ]).then(([users, roles]) => {
      if (controller.signal.aborted) return
      setDirectory({ ownerId, users, roles })
      setSelectedId(users[0]?.id ?? '')
      setDraft(users[0]?.roles ?? [])
      setSave({ kind: 'idle' })
      setLoadError(null)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setLoadError(error)
      feedback('error')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canManage, ownerId, revision, feedback])

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
    busyRef.current = false
  }, [ownerId, canManage])

  const selected = directory?.users.find(entry => entry.id === selectedId)
  const pending = save.kind === 'saving' || save.kind === 'refreshing'
  const needsRefresh = save.kind === 'refresh-error'
  const locked = pending || needsRefresh
  const unchanged = !selected || sameRoles(draft, selected.roles)
  const effectivePermissions = useMemo<Permission[]>(() => [...new Set(
    (directory?.roles ?? []).filter(role => draft.includes(role.id)).flatMap(role => role.permissions),
  )], [directory, draft])

  function retryDirectory() {
    requestRef.current?.abort()
    requestRef.current = null
    busyRef.current = false
    setDirectory(null)
    setSelectedId('')
    setDraft([])
    setLoading(true)
    setLoadError(null)
    setRevision(current => current + 1)
  }

  function selectUser(next: User) {
    if (locked) return
    setSelectedId(next.id)
    setDraft([...next.roles])
    setSave({ kind: 'idle' })
  }

  function toggleRole(id: RoleId) {
    if (locked) return
    setDraft(current => current.includes(id) ? current.filter(role => role !== id) : [...current, id])
    setSave({ kind: 'idle' })
  }

  async function refreshProfile(controller: AbortController, message: string) {
    const current = await authApi.me({ signal: controller.signal })
    if (controller.signal.aborted || requestRef.current !== controller) return
    acceptUser(current)
    if (!current.permissions.includes('roles:manage')) {
      feedback('success')
      void navigate('/workspace/protocols', {
        replace: true,
        state: { notice: 'Ваши роли обновлены. Управление участниками больше недоступно.' },
      })
      return
    }
    setSave({ kind: 'success', message })
    feedback('success')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || busyRef.current || locked || unchanged || !draft.length || !selected) return
    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    setSave({ kind: 'saving' })
    feedback('pending')
    let committed = false
    try {
      const updated = await workspaceApi.setUserRoles(selected.id, { roles: [...draft] }, { signal: controller.signal })
      if (controller.signal.aborted || requestRef.current !== controller) return
      committed = true
      setDirectory(current => current ? { ...current, users: current.users.map(entry => entry.id === updated.id ? updated : entry) } : null)
      setDraft([...updated.roles])
      setSave({ kind: 'refreshing' })
      await refreshProfile(controller, `Роли участника «${updated.login}» сохранены.`)
    } catch (error: unknown) {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setSave(committed
        ? { kind: 'refresh-error', message: 'Роли сохранены, но не удалось проверить права текущего аккаунта. Повторите проверку, чтобы продолжить.' }
        : { kind: 'error', message: errorMessage(error, 'Не удалось сохранить роли. Повторите попытку.') })
      feedback('error')
    } finally {
      if (requestRef.current === controller) {
        busyRef.current = false
        requestRef.current = null
      }
    }
  }

  async function retryProfile() {
    if (!canManage || busyRef.current || !needsRefresh) return
    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    setSave({ kind: 'refreshing' })
    feedback('pending')
    try {
      await refreshProfile(controller, 'Права текущего аккаунта проверены. Изменения сохранены.')
    } catch (error: unknown) {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setSave({ kind: 'refresh-error', message: errorMessage(error, 'Не удалось проверить текущие права. Повторите проверку.') })
      feedback('error')
    } finally {
      if (requestRef.current === controller) {
        busyRef.current = false
        requestRef.current = null
      }
    }
  }

  return <>
    <div className="wb-page-header">
      <h1>Участники и роли</h1>
      <p>Выберите участника и назначьте ему одну или несколько ролей. Изменения действуют сразу после сохранения.</p>
    </div>
    {!canManage ? <WorkspaceState error={forbidden} /> : <WorkspaceState
      loading={loading || (directory !== null && directory.ownerId !== ownerId && !loadError)} error={loadError} onRetry={retryDirectory}
    >
      {directory?.users.length === 0 ? <p className="wb-empty">Участников пока нет.</p> : directory && <div className="wb-participants">
        <div className="wb-user-list" role="group" aria-label="Участники лаборатории">
          {directory.users.map(entry => <button
            type="button" className="wb-user-option" key={entry.id} aria-pressed={selectedId === entry.id}
            disabled={locked} onClick={() => selectUser(entry)}
          ><span>{entry.login}{entry.id === ownerId && <span className="wb-badge">Вы</span>}</span><small>{entry.roles.map(role => ROLE_LABELS[role]).join(', ')}</small></button>)}
        </div>
        {selected && <form className="wb-role-editor" aria-labelledby="role-editor-title" onSubmit={submit} aria-busy={pending}>
          <div className="wb-editor-heading"><h2 id="role-editor-title">Роли участника {selected.login}</h2><p>Можно изменить свой аккаунт и любой демопрофиль.</p></div>
          <fieldset disabled={locked} aria-describedby={!draft.length ? 'roles-empty-error' : undefined}>
            <legend>Назначенные роли</legend>
            {directory.roles.map(role => <label className="wb-role-option" key={role.id}>
              <input type="checkbox" name="roles" value={role.id} checked={draft.includes(role.id)} onChange={() => toggleRole(role.id)} />
              <span><strong>{role.label}</strong><small>{role.description}</small></span>
            </label>)}
          </fieldset>
          {!draft.length && <p id="roles-empty-error" className="wb-field-error" role="alert">У участника должна остаться хотя бы одна роль.</p>}
          <section className="wb-effective-permissions" aria-labelledby="effective-permissions-title">
            <h3 id="effective-permissions-title">Права после сохранения</h3>
            {effectivePermissions.length ? <ul>{effectivePermissions.map(permission => <li key={permission}>{PERMISSION_LABELS[permission]}</li>)}</ul> : <p>Выберите роль, чтобы назначить права.</p>}
          </section>
          <div className="wb-form-actions">
            <button type="submit" className="wb-button" disabled={locked || unchanged || !draft.length}>{save.kind === 'saving' ? 'Сохраняем роли…' : save.kind === 'refreshing' ? 'Проверяем текущие права…' : 'Сохранить роли'}</button>
            {needsRefresh && <button type="button" className="wb-button wb-button-secondary" onClick={() => { void retryProfile() }}>Повторить проверку прав</button>}
          </div>
          {save.message && <p className={`wb-inline-status${save.kind === 'error' || needsRefresh ? ' wb-inline-error' : ''}`} role={save.kind === 'error' || needsRefresh ? 'alert' : 'status'}>{save.message}</p>}
        </form>}
      </div>}
    </WorkspaceState>}
  </>
}
