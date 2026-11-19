import type { Run } from '../../types/workspace'
import { RUN_STATUS_LABELS } from './protocol-format'

export function RunStatus({ status }: { status: Run['status'] }) {
  return <span className="run-status" data-status={status}>{RUN_STATUS_LABELS[status]}</span>
}
