// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useNavigate, useOutletContext } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RobotState } from '../components/robot/robotTypes'
import type { AuthInteractionProps } from '../features/auth/auth-ui-types'
import { AuthLayout } from './AuthLayout'

const robot = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  latest: null as RobotState | null,
}))

vi.mock('../components/layout/ApplicationFrame', () => ({
  ApplicationFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../components/robot/RobotViewer', async () => {
  const { useEffect } = await import('react')
  return {
    RobotViewer(props: RobotState) {
      robot.latest = props
      useEffect(() => {
        robot.mounts += 1
        return () => { robot.unmounts += 1 }
      }, [])
      return <div data-testid="robot-viewer" />
    },
  }
})

afterEach(cleanup)
beforeEach(() => {
  robot.mounts = 0
  robot.unmounts = 0
  robot.latest = null
})

function FormFixture({ name }: { name: string }) {
  const interaction = useOutletContext<AuthInteractionProps>()
  return <>
    <h2>{name}</h2>
    <button onClick={() => {
      interaction.onFeedback('error')
      interaction.onPasswordVisibility(true)
      interaction.onAttention({ x: 180, y: 240 })
      interaction.onCorrection({ x: 210, y: 280 })
    }}>Изменить реакцию</button>
  </>
}

function HistoryControls() {
  const navigate = useNavigate()
  return <button onClick={() => { void navigate(-1) }}>Назад</button>
}

function renderLayout() {
  render(<MemoryRouter initialEntries={['/register']}>
    <HistoryControls />
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/register" element={<FormFixture name="Форма регистрации" />} />
        <Route path="/login" element={<FormFixture name="Форма входа" />} />
        <Route path="/demo" element={<FormFixture name="Демонстрационные профили" />} />
      </Route>
    </Routes>
  </MemoryRouter>)
}

function expectNeutralRobot() {
  expect(robot.latest).toMatchObject({
    feedback: 'idle', feedbackKey: 0, passwordVisible: false,
    attentionTarget: null, correctionTarget: null,
  })
  expect(robot.mounts).toBe(1)
  expect(robot.unmounts).toBe(0)
}

describe('AuthLayout route changes', () => {
  it('preserves the mounted robot and clears form reactions between registration, login, demo, and back', () => {
    renderLayout()
    const originalViewer = screen.getByTestId('robot-viewer')
    expectNeutralRobot()

    fireEvent.click(screen.getByRole('button', { name: 'Изменить реакцию' }))
    expect(robot.latest).toMatchObject({ feedback: 'error', passwordVisible: true, attentionTarget: { x: 180, y: 240 } })
    fireEvent.click(screen.getByRole('link', { name: 'Вход' }))
    expect(screen.getByRole('heading', { name: 'Форма входа' })).toBeTruthy()
    expectNeutralRobot()

    fireEvent.click(screen.getByRole('button', { name: 'Изменить реакцию' }))
    fireEvent.click(screen.getByRole('link', { name: 'Демо' }))
    expect(screen.getByRole('heading', { name: 'Демонстрационные профили' })).toBeTruthy()
    expectNeutralRobot()

    fireEvent.click(screen.getByRole('button', { name: 'Изменить реакцию' }))
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('heading', { name: 'Форма входа' })).toBeTruthy()
    expectNeutralRobot()
    expect(screen.getByTestId('robot-viewer')).toBe(originalViewer)
  })

  it('does not resurrect password privacy when returning through an untouched intermediate form', () => {
    renderLayout()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить реакцию' }))
    expect(robot.latest?.passwordVisible).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: 'Вход' }))
    expectNeutralRobot()
    // No interaction on the login form: the previous route state must still be discarded.
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('heading', { name: 'Форма регистрации' })).toBeTruthy()
    expectNeutralRobot()
  })
})
