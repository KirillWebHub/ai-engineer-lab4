import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './app/AuthProvider'
import { RegistrationPage } from './pages/RegistrationPage'
import { AccountPage } from './pages/AccountPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { CursorRipple } from './components/CursorRipple'
import { AuthLayout } from './pages/AuthLayout'
import { LoginPage } from './pages/LoginPage'
import { DemoPage } from './pages/DemoPage'
import { WorkspaceLayout } from './pages/WorkspaceLayout'
import { ProtocolsPage } from './features/protocols/ProtocolsPage'
import { ProtocolDetailPage } from './features/protocols/ProtocolDetailPage'
import { RoleMatrixPage } from './features/roles/RoleMatrixPage'
import { ParticipantsPage } from './features/roles/ParticipantsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CursorRipple />
        <Routes>
          <Route path="/" element={<Navigate to="/workspace/protocols" replace />} />
          <Route element={<AuthLayout />}>
            <Route path="/register" element={<RegistrationPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/demo" element={<DemoPage />} />
          </Route>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/workspace" element={<WorkspaceLayout />}>
            <Route index element={<Navigate to="protocols" replace />} />
            <Route path="protocols" element={<ProtocolsPage />} />
            <Route path="protocols/:runId" element={<ProtocolDetailPage />} />
            <Route path="roles" element={<RoleMatrixPage />} />
            <Route path="users" element={<ParticipantsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
