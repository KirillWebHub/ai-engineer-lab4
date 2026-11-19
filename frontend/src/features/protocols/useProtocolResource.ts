import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/errors'

interface ResourceState<T> {
  key: string
  data: T | null
  error: unknown
  loading: boolean
}

export function canRetryProtocolError(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500
}

export function useProtocolResource<T>(
  key: string,
  enabled: boolean,
  loader: (signal: AbortSignal) => Promise<T>,
) {
  const [revision, setRevision] = useState(0)
  const requestKey = `${key}:request:${revision}`
  const [state, setState] = useState<ResourceState<T>>({ key: '', data: null, error: null, loading: false })
  const reload = useCallback(() => setRevision(current => current + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    if (!enabled) return () => controller.abort()
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key: requestKey, data, error: null, loading: false })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key: requestKey, data: null, error, loading: false })
    })
    return () => controller.abort()
  }, [enabled, loader, requestKey])

  const replaceData = useCallback((data: T) => {
    setState({ key: requestKey, data, error: null, loading: false })
  }, [requestKey])

  // Hide the preceding user's or route's data before the next effect starts.
  const visible = state.key === requestKey && enabled
    ? state : { key: requestKey, data: null, error: null, loading: enabled }
  return { ...visible, reload, replaceData }
}
