import type { Run } from '../../types/workspace'

export const RUN_STATUS_LABELS: Record<Run['status'], string> = {
  pending: 'На проверке',
  approved: 'Принят',
  rejected: 'На доработке',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const compactDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
})
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
})

export function formatRunDate(value: string, compact = false) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : (compact ? compactDateFormatter : dateFormatter).format(date)
}

export function formatReviewTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : `${timeFormatter.format(date)} UTC`
}
