import { createContext, useContext } from 'react'
import type { RobotFeedback } from '../robot/robotTypes'

export const WorkspaceFeedbackContext = createContext<(feedback: RobotFeedback) => void>(() => undefined)

export function useWorkspaceFeedback() {
  return useContext(WorkspaceFeedbackContext)
}
