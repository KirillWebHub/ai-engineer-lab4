import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { workspaceApi } from '../../api/client'
import { ApiError } from '../../api/errors'
import { useAuth } from '../../app/useAuth'
import { WorkspaceState } from '../../components/workspace/WorkspaceState'
import { useWorkspaceFeedback } from '../../components/workspace/workspace-feedback'
import type { ReviewRunRequest } from '../../types/workspace'
import { formatReviewTime, formatRunDate, RUN_STATUS_LABELS } from './protocol-format'
import { RunStatus } from './RunStatus'
import { canRetryProtocolError, useProtocolResource } from './useProtocolResource'

type ReviewStatus = ReviewRunRequest['status']
interface ReviewState { key: string; status: 'idle' | 'pending' | 'success' | 'error'; message: string; error: unknown }

export function ProtocolDetailPage() {
  const { runId = '' } = useParams<{ runId: string }>()
  const { user, restoreSession } = useAuth()
  const feedback = useWorkspaceFeedback()
  const canRead = Boolean(user?.permissions.includes('runs:read'))
  const canReview = Boolean(user?.permissions.includes('runs:review'))
  const key = `run:${runId}:${user?.id ?? 'guest'}:${canRead}:${canReview}`
  const load = useCallback((signal: AbortSignal) => workspaceApi.getRun(runId, { signal }), [runId])
  const resource = useProtocolResource(key, canRead && Boolean(runId), load)
  const requestRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const [reviewState, setReviewState] = useState<ReviewState>({ key, status: 'idle', message: '', error: null })
  const review = reviewState.key === key ? reviewState : { key, status: 'idle', message: '', error: null }

  useEffect(() => () => {
    requestRef.current?.abort()
    busyRef.current = false
  }, [key, canReview])
  useEffect(() => {
    feedback(resource.loading ? 'pending' : resource.error ? 'error' : 'idle')
  }, [resource.loading, resource.error, feedback])

  async function decide(status: ReviewStatus) {
    if (!canReview || !resource.data || busyRef.current || status === resource.data.status) return
    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    setReviewState({ key, status: 'pending', message: 'Сохраняем решение…', error: null })
    feedback('pending')
    try {
      const updated = await workspaceApi.reviewRun(runId, { status }, { signal: controller.signal })
      if (controller.signal.aborted) return
      resource.replaceData(updated)
      setReviewState({ key, status: 'success', message: `Решение сохранено. Статус: «${RUN_STATUS_LABELS[updated.status]}».`, error: null })
      feedback('success')
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      const message = error instanceof ApiError ? error.message : 'Не удалось сохранить решение. Повторите попытку.'
      setReviewState({ key, status: 'error', message, error })
      feedback('error')
      if (error instanceof ApiError && [401, 403].includes(error.status)) restoreSession()
    } finally {
      if (requestRef.current === controller) busyRef.current = false
    }
  }

  const terminalReviewError = review.error instanceof ApiError && [401, 403, 404].includes(review.error.status)
  const reviewDisabled = review.status === 'pending' || terminalReviewError

  return (
    <section aria-label="Протокол испытания">
      <Link to="/workspace/protocols" className="wb-back-link">К протоколам испытаний</Link>
      {!canRead
        ? <p className="wb-readonly-note" role="status">Для чтения протокола требуется право «Чтение протоколов».</p>
        : <WorkspaceState loading={resource.loading} error={resource.error} onRetry={resource.error && canRetryProtocolError(resource.error) ? resource.reload : undefined}>
          {resource.data && <article aria-labelledby="protocol-title">
            <div className="wb-detail-heading">
              <div><h1 id="protocol-title">{resource.data.title}</h1><span className="wb-run-id">{resource.data.id}</span></div>
              <RunStatus status={resource.data.status} />
            </div>
            <dl className="wb-detail-meta">
              <div><dt>Робот</dt><dd>{resource.data.robot}</dd></div>
              <div><dt>Дата испытания</dt><dd><time dateTime={resource.data.date}>{formatRunDate(resource.data.date)}</time></dd></div>
              <div><dt>Проверил</dt><dd>{resource.data.reviewedBy ?? 'Ещё не проверен'}</dd></div>
              {resource.data.reviewedAt && <div><dt>Время решения</dt><dd><time dateTime={resource.data.reviewedAt}>{formatReviewTime(resource.data.reviewedAt)}</time></dd></div>}
            </dl>
            <p className="wb-protocol-summary">{resource.data.summary}</p>
            <section className="wb-review-panel" aria-labelledby="review-title">
              <h2 id="review-title">Решение по протоколу</h2>
              {canReview
                ? <>
                  <p>Примите результаты испытания или верните протокол на доработку.</p>
                  <div className="wb-review-actions">
                    <button type="button" className="wb-button wb-button-primary" disabled={reviewDisabled || resource.data.status === 'approved'} onClick={() => { void decide('approved') }}>Принять протокол</button>
                    <button type="button" className="wb-button" disabled={reviewDisabled || resource.data.status === 'rejected'} onClick={() => { void decide('rejected') }}>Вернуть на доработку</button>
                  </div>
                </>
                : <p className="wb-readonly-note">Вы можете читать этот протокол. Решения принимают участники с правом «Проверка протоколов».</p>}
              <p className="wb-review-message" data-state={review.status} role="status" aria-live="polite" aria-atomic="true">{review.message}</p>
            </section>
          </article>}
        </WorkspaceState>}
    </section>
  )
}
