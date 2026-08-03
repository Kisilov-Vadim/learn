import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useDashboard } from './hooks/useDashboard'
import { Login } from './components/Login'
import { SubjectCards } from './components/SubjectCards'
import { SubjectShell } from './components/SubjectShell'

export default function App() {
  const { session, loading: authLoading, login, logout } = useAuth()
  const { subjects, loaded: dashLoaded } = useDashboard(!!session)
  const navigate = useNavigate()

  if (authLoading) return <div className="min-h-screen bg-bg flex items-center justify-center text-dim">Loading…</div>
  if (!session) return <Login onLogin={login} />
  // Wait for the dashboard's first fetch before routing — otherwise SubjectShell's
  // guards see empty subjects and bounce a valid subject URL back to the home screen.
  if (!dashLoaded) return <div className="min-h-screen bg-bg flex items-center justify-center text-dim">Loading…</div>

  return (
    <Routes>
      <Route
        path="/"
        element={
          <SubjectCards
            subjects={subjects}
            onSelect={id => navigate(`/s/${id}/topics`)}
            onLogout={logout}
          />
        }
      />
      <Route path="/s/:subjectId" element={<Navigate to="topics" replace />} />
      <Route path="/s/:subjectId/:tab" element={<SubjectShell subjects={subjects} onLogout={logout} />} />
      <Route path="/s/:subjectId/:tab/topic/:topicId" element={<SubjectShell subjects={subjects} onLogout={logout} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
