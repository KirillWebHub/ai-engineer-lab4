import type { DemoProfileId, Permission, RoleId } from '../../types/auth'

export const ROLE_LABELS: Record<RoleId, string> = {
  operator: 'Оператор',
  diagnostician: 'Диагност',
  architect: 'Архитектор',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'runs:read': 'Чтение протоколов',
  'runs:review': 'Проверка протоколов',
  'roles:manage': 'Назначение ролей',
}

interface DemoProfile {
  profile: DemoProfileId
  role: RoleId
  label: string
  description: string
}

export const DEMO_PROFILES: readonly DemoProfile[] = [
  { profile: 'operator_01', role: 'operator', label: ROLE_LABELS.operator, description: 'Чтение протоколов испытаний' },
  { profile: 'diagnostics_01', role: 'diagnostician', label: ROLE_LABELS.diagnostician, description: 'Чтение и проверка протоколов' },
  { profile: 'architect_01', role: 'architect', label: ROLE_LABELS.architect, description: 'Проверка протоколов и назначение ролей' },
]
