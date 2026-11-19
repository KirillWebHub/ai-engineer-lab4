import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../api/client'
import { ApiError } from '../api/errors'
import type { User } from '../types/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [restoreError, setRestoreError] = useState('')
  const pendingRestore = useRef<AbortController | null>(null)
  const leaving = useRef(false)
  const fetchSession = useCallback(() => {
    if (leaving.current) return
    pendingRestore.current?.abort()
    const controller = new AbortController()
    pendingRestore.current = controller
    void authApi.me({ signal: controller.signal }).then(next => {
      if (!controller.signal.aborted) setUser(next)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 401) setUser(null)
      else setRestoreError(error instanceof ApiError ? error.message : 'Не удалось восстановить сессию. Повторите попытку.')
    }).finally(() => {
      if (!controller.signal.aborted) setRestoring(false)
    })
  }, [])
  const restoreSession = useCallback(() => {
    if (leaving.current) return
    setRestoring(true)
    setRestoreError('')
    fetchSession()
  }, [fetchSession])
  useEffect(() => {
    fetchSession()
    window.addEventListener('focus', restoreSession)
    return () => {
      pendingRestore.current?.abort()
      window.removeEventListener('focus', restoreSession)
    }
  }, [fetchSession, restoreSession])
  const acceptUser = useCallback((next: User) => {
    pendingRestore.current?.abort()
    setUser(next)
    setRestoring(false)
    setRestoreError('')
  }, [])
  const logout = useCallback(async () => {
    if (leaving.current) return
    leaving.current = true
    pendingRestore.current?.abort()
    try {
      await authApi.logout()
      pendingRestore.current?.abort()
      setUser(null)
      setRestoreError('')
    } finally {
      leaving.current = false
      setRestoring(false)
    }
  }, [])
  return <AuthContext value={{ user, restoring, restoreError, acceptUser, restoreSession, logout }}>{children}</AuthContext>
}
