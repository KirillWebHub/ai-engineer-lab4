export type RobotFeedback = 'idle' | 'pending' | 'success' | 'error'

export interface RobotAttentionTarget {
  x: number
  y: number
}

export interface RobotState {
  feedback: RobotFeedback
  feedbackKey: number
  passwordVisible: boolean
  attentionTarget: RobotAttentionTarget | null
  correctionTarget?: RobotAttentionTarget | null
}

export type RobotLoadStatus = 'loading' | 'ready' | 'error'
export type RobotFraming = 'full' | 'portrait'
