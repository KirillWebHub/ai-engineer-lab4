import { createContext } from 'react'
import type { User } from '../types/auth'

export interface AuthState {
  user: User | null
  restoring: boolean
  restoreError: string
  acceptUser: (user: User) => void
  restoreSession: () => void
  logout: () => Promise<void>
}
export const AuthContext = createContext<AuthState | null>(null)
