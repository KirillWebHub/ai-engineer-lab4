import { useEffect, useRef, useState } from 'react'
import type { RobotSceneController } from './createRobotScene'
import type { RobotFraming, RobotLoadStatus, RobotState } from './robotTypes'

export type RobotViewerProps = RobotState & { framing?: RobotFraming }

export function RobotViewer({ framing = 'full', ...props }: RobotViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<RobotSceneController | null>(null)
  const latestProps = useRef(props)
  const [status, setStatus] = useState<RobotLoadStatus>('loading')

  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    let disposed = false
    void import('./createRobotScene').then(({ createRobotScene }) => {
      if (disposed) return
      const controller = createRobotScene(host, setStatus, framing)
      controllerRef.current = controller
      controller.update(latestProps.current)
    }).catch(() => { if (!disposed) setStatus('error') })
    return () => {
      disposed = true
      controllerRef.current?.dispose()
      controllerRef.current = null
    }
  }, [framing])

  useEffect(() => {
    latestProps.current = props
    controllerRef.current?.update(props)
  }, [props])

  return (
    <div
      ref={hostRef}
      className="viewer"
      data-ready={status === 'ready' ? 'true' : undefined}
      data-robot-status={status}
      aria-label="Трёхмерная модель робота AI Engineer"
    >
      {status !== 'ready' && (
        <p role="status">
          {status === 'loading'
            ? 'Загружаем робота…'
            : 'Не удалось открыть 3D-модель. Интерфейс приложения доступен.'}
        </p>
      )}
    </div>
  )
}
