import { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { workspaceApi } from '../../api/client'
import { useAuth } from '../../app/useAuth'
import { WorkspaceState } from '../../components/workspace/WorkspaceState'
import { useWorkspaceFeedback } from '../../components/workspace/workspace-feedback'
import { formatRunDate } from './protocol-format'
import { RunStatus } from './RunStatus'
import { canRetryProtocolError, useProtocolResource } from './useProtocolResource'

export function ProtocolsPage() {
  const { user } = useAuth()
  const feedback = useWorkspaceFeedback()
  const canRead = Boolean(user?.permissions.includes('runs:read'))
  const load = useCallback((signal: AbortSignal) => workspaceApi.listRuns({ signal }), [])
  const resource = useProtocolResource(`runs:${user?.id ?? 'guest'}:${canRead}`, canRead, load)

  useEffect(() => {
    feedback(resource.loading ? 'pending' : resource.error ? 'error' : 'idle')
  }, [resource.loading, resource.error, feedback])

  return (
    <section aria-labelledby="protocols-title">
      <div className="wb-page-heading">
        <div><h1 id="protocols-title">Протоколы испытаний</h1><p>Результаты проверок поведения, визора и механики робота.</p></div>
        {resource.data && <span className="wb-count">Записей: {resource.data.length}</span>}
      </div>
      {!canRead
        ? <p className="wb-readonly-note" role="status">Для чтения протоколов требуется право «Чтение протоколов».</p>
        : <WorkspaceState loading={resource.loading} error={resource.error} onRetry={resource.error && canRetryProtocolError(resource.error) ? resource.reload : undefined}>
          {resource.data && (resource.data.length === 0
            ? <p className="wb-readonly-note">Протоколов пока нет. Здесь появятся результаты испытаний робота.</p>
            : <div className="wb-table-scroll" role="region" aria-label="Журнал испытаний" tabIndex={0}>
              <table className="wb-protocol-table">
                <caption className="sr-only">Журнал протоколов испытаний. Откройте название, чтобы прочитать протокол.</caption>
                <thead><tr><th scope="col">ID</th><th scope="col">Испытание</th><th scope="col">Дата</th><th scope="col">Статус</th></tr></thead>
                <tbody>{resource.data.map(run => (
                  <tr key={run.id}>
                    <td><span className="wb-run-id">{run.id}</span></td>
                    <th scope="row"><Link className="wb-protocol-link" to={`/workspace/protocols/${encodeURIComponent(run.id)}`}>{run.title}</Link><span className="wb-mobile-run-id">{run.id}</span></th>
                    <td><time dateTime={run.date}>{formatRunDate(run.date, true)}</time></td>
                    <td><RunStatus status={run.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>)}
        </WorkspaceState>}
    </section>
  )
}
