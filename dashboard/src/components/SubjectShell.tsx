import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTopics, useTouches, useSubjectContext } from '../hooks/useSubject'
import { Header } from './Header'
import { TopicsView } from './views/TopicsView'
import { SessionsView } from './views/SessionsView'
import { MethodsView } from './views/MethodsView'
import { TopicPanel } from './TopicPanel'
import type { Subject } from '../types'

type Tab = 'topics' | 'sessions' | 'methods'

const TABS: { id: Tab; label: string }[] = [
  { id: 'topics', label: 'Topics' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'methods', label: 'Methods' },
]

interface Props {
  subjects: Subject[]
  onLogout: () => void
}

export function SubjectShell({ subjects, onLogout }: Props) {
  const { subjectId, tab, topicId } = useParams()
  const navigate = useNavigate()

  const activeSubject = subjects.find(s => s.id === subjectId) ?? null

  const { topics, loading: topicsLoading } = useTopics(subjectId ?? null)
  const { touches, loading: touchesLoading } = useTouches(subjectId ?? null)
  const { context } = useSubjectContext(subjectId ?? null)

  // Unknown subject in the URL (e.g. stale link) → back to subject cards
  if (!activeSubject) return <Navigate to="/" replace />
  // Unknown tab in the URL → normalize to the default tab
  if (!TABS.some(t => t.id === tab)) return <Navigate to={`/s/${subjectId}/topics`} replace />

  const activeTab = tab as Tab
  const openTopic = (id: string) => navigate(`/s/${subjectId}/${activeTab}/topic/${id}`)
  const closeTopic = () => navigate(`/s/${subjectId}/${activeTab}`)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        subjects={subjects}
        activeId={activeSubject.id}
        onSubjectChange={id => navigate(`/s/${id}/topics`)}
        onHome={() => navigate('/')}
        onLogout={onLogout}
        streak={context?.streak ?? activeSubject.streak ?? 0}
      />

      {/* Tabs */}
      <nav className="flex border-b border-border px-12">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => navigate(`/s/${subjectId}/${t.id}`)}
            className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'text-accent border-accent'
                : 'text-dim border-transparent hover:text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-12 pt-5 pb-10 min-h-0">
        {topicsLoading || touchesLoading ? (
          <div className="flex items-center justify-center h-32 text-dim">Loading…</div>
        ) : (
          <>
            {activeTab === 'topics' && (
              <TopicsView topics={topics} onOpenTopic={openTopic} />
            )}
            {activeTab === 'sessions' && (
              <SessionsView
                touches={touches}
                topics={topics}
                streak={context?.streak ?? 0}
                onOpenTopic={openTopic}
              />
            )}
            {activeTab === 'methods' && (
              <MethodsView context={context} subjectName={activeSubject.name} />
            )}
          </>
        )}
      </main>

      <TopicPanel topicId={topicId ?? null} onClose={closeTopic} />
    </div>
  )
}
