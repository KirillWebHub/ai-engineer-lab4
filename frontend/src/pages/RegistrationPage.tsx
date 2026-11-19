import { useOutletContext } from 'react-router-dom'
import { RegistrationForm } from '../features/registration/RegistrationForm'
import type { AuthInteractionProps } from '../features/auth/auth-ui-types'

export function RegistrationPage() {
  const interaction = useOutletContext<AuthInteractionProps>()
  return <RegistrationForm {...interaction} />
}
