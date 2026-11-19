export type AuthFeedback = 'idle' | 'pending' | 'success' | 'error'
export type AuthPoint = { x: number; y: number }

export interface AuthInteractionProps {
  onFeedback: (state: AuthFeedback) => void
  onPasswordVisibility: (visible: boolean) => void
  onAttention: (target: AuthPoint | null) => void
  onCorrection: (target: AuthPoint | null) => void
}

export function centerOf(element: HTMLElement): AuthPoint {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
