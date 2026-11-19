import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ApplicationFrame } from '../components/layout/ApplicationFrame'
import { RobotViewer } from '../components/robot/RobotViewer'
import type { RobotState } from '../components/robot/robotTypes'
import type { AuthInteractionProps } from '../features/auth/auth-ui-types'

const neutral: RobotState = {
  feedback: 'idle', feedbackKey: 0, passwordVisible: false,
  attentionTarget: null, correctionTarget: null,
}

export function AuthLayout() {
  const { pathname } = useLocation()
  const [scene, setScene] = useState({ pathname, robot: neutral })
  // Navigation resets form-specific attention without remounting the WebGL scene.
  if (scene.pathname !== pathname) setScene({ pathname, robot: neutral })
  const robot = scene.pathname === pathname ? scene.robot : neutral
  const update = useCallback((patch: Partial<RobotState>) => {
    setScene(previous => ({
      pathname,
      robot: { ...(previous.pathname === pathname ? previous.robot : neutral), ...patch },
    }))
  }, [pathname])
  const onFeedback = useCallback<AuthInteractionProps['onFeedback']>(feedback => {
    setScene(previous => ({
      pathname,
      robot: {
        ...(previous.pathname === pathname ? previous.robot : neutral),
        feedback, feedbackKey: previous.robot.feedbackKey + 1,
      },
    }))
  }, [pathname])
  const onPasswordVisibility = useCallback<AuthInteractionProps['onPasswordVisibility']>(passwordVisible => update({ passwordVisible }), [update])
  const onAttention = useCallback<AuthInteractionProps['onAttention']>(attentionTarget => update({ attentionTarget }), [update])
  const onCorrection = useCallback<AuthInteractionProps['onCorrection']>(correctionTarget => update({ correctionTarget }), [update])
  const interaction: AuthInteractionProps = { onFeedback, onPasswordVisibility, onAttention, onCorrection }

  return <ApplicationFrame>
    <div className="layout">
      <section className="scene" aria-label="Робот AI Engineer">
        <div className="scene-index mono" aria-hidden="true"><span>ПРОГРАММНО-АППАРАТНАЯ ЗАЩИТА</span></div>
        <RobotViewer {...robot} />
        <div className="scene-title"><h1><span>Программно-аппаратные средства защиты информации</span></h1></div>
      </section>
      <section id="registration" className="registration" aria-label="Доступ в лабораторию">
        <div className="auth-panel">
          <nav className="auth-tabs" aria-label="Способ входа">
            <NavLink to="/register">Регистрация</NavLink>
            <NavLink to="/login">Вход</NavLink>
            <NavLink to="/demo">Демо</NavLink>
          </nav>
          <Outlet context={interaction} />
        </div>
      </section>
    </div>
  </ApplicationFrame>
}
