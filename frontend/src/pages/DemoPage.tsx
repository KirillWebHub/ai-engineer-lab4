import { useOutletContext } from 'react-router-dom'
import { DemoAccess } from '../features/auth/DemoAccess'
import type { AuthInteractionProps } from '../features/auth/auth-ui-types'

export function DemoPage() {
  const interaction = useOutletContext<AuthInteractionProps>()
  return <DemoAccess {...interaction} />
}
