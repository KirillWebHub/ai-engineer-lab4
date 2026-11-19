import { useOutletContext } from 'react-router-dom'
import { LoginForm } from '../features/auth/LoginForm'
import type { AuthInteractionProps } from '../features/auth/auth-ui-types'

export function LoginPage() {
  const interaction = useOutletContext<AuthInteractionProps>()
  return <LoginForm {...interaction} />
}
