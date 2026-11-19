import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { useWorkspaceFeedback } from './workspace-feedback'

interface Props {
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  children?: ReactNode
}

export function WorkspaceState({ loading, error, onRetry, children }: Props) {
  const { restoreSession } = useAuth()
  const feedback = useWorkspaceFeedback()
  const status = error instanceof ApiError ? error.status : error ? 500 : 0
  useEffect(() => {
    if (status) feedback('error')
    if (status === 401 || status === 403) restoreSession()
  }, [status, feedback, restoreSession])

  if (loading) return <div className="wb-state wb-loading" role="status" aria-live="polite">
    <p>Загружаем данные…</p>
    <div className="wb-skeleton" aria-hidden="true"><span /><span /><span /></div>
  </div>
  if (!error) return children

  const title = status === 401 ? 'Сессия завершена' : status === 403 ? 'Недостаточно прав'
    : status === 404 ? 'Запись не найдена' : 'Не удалось загрузить данные'
  const message = status === 401 ? 'Войдите снова, чтобы продолжить работу.'
    : status === 403 ? 'У текущего аккаунта нет права на это действие. Выберите другой профиль или вернитесь к протоколам.'
    : status === 404 ? 'Проверьте адрес или вернитесь к списку протоколов.'
    : error instanceof ApiError ? error.message : 'Повторите попытку. Если ошибка повторится, обновите страницу.'
  return <div className="wb-state" role="alert">
    <h1>{title}</h1><p>{message}</p>
    <div className="wb-state-actions">
      {status === 401 ? <Link className="wb-button wb-button-primary" to="/login">Войти</Link>
        : <Link className="wb-button" to="/workspace/protocols">К протоколам</Link>}
      {status === 403 && <Link className="wb-button" to="/demo">Сменить профиль</Link>}
      {onRetry && ![401, 403, 404].includes(status) && <button type="button" className="wb-button wb-button-primary" onClick={onRetry}>Повторить</button>}
    </div>
  </div>
}
