import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTopics, useTouches, useSubjectContext } from '../hooks/useSubject'
import { Header } from './Header'
import { TopicsView } from './views/TopicsView'
import { SessionsView } from './views/SessionsView'
import { MethodsView } from './views/MethodsView'
import { TopicPanel } from './TopicPanel'
import { RulesPanel } from './RulesPanel'
import { EmptyState, ErrorState } from './StateViews'
import type { Subject } from '../types'

type Tab = 'topics' | 'sessions' | 'methods' | 'rules'

const TABS: { id: Tab; label: string }[] = [
  { id: 'topics', label: 'Topics' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'methods', label: 'Methods' },
  { id: 'rules', label: 'Rules' },
]

interface Props {
  subjects: Subject[]
  onLogout: () => void
}

export function SubjectShell({ subjects, onLogout }: Props) {
  const { subjectId, tab, topicId } = useParams()
  const navigate = useNavigate()

  const activeSubject = subjects.find(s => s.id === subjectId) ?? null

  // The Rules tab needs none of this data — skip those fetches while it's active.
  const dataSubjectId = tab === 'rules' ? null : (subjectId ?? null)
  const { topics, loading: topicsLoading, error: topicsError, reload: reloadTopics } = useTopics(dataSubjectId)
  const { touches, loading: touchesLoading, error: touchesError, reload: reloadTouches } = useTouches(dataSubjectId)
  const { context, error: contextError, reload: reloadContext } = useSubjectContext(dataSubjectId)

  // Unknown subject in the URL (e.g. stale link) → back to subject cards
  if (!activeSubject) return <Navigate to="/" replace />
  // Unknown tab in the URL → normalize to the default tab
  if (!TABS.some(t => t.id === tab)) return <Navigate to={`/s/${subjectId}/topics`} replace />

  const activeTab = tab as Tab
  const openTopic = (id: string) => navigate(`/s/${subjectId}/${activeTab}/topic/${id}`)
  const closeTopic = () => navigate(`/s/${subjectId}/${activeTab}`)
  const loading = topicsLoading || touchesLoading

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        subjects={subjects}
        activeId={activeSubject.id}
        onSubjectChange={id => navigate(`/s/${id}/topics`)}
        onHome={() => navigate('/')}
        onRules={() => navigate('/rules')}
        onLogout={onLogout}
        streak={context?.streak ?? activeSubject.streak ?? 0}
      />

      {/* Tabs */}
      <nav className="flex border-b border-border px-6 md:px-12">
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
      <main className="flex-1 overflow-y-auto px-6 md:px-12 pt-5 pb-10 min-h-0">
        {loading && activeTab !== 'rules' ? (
          <div className="flex items-center justify-center h-32 text-dim">Loading…</div>
        ) : (
          <>
            {activeTab === 'topics' && (
              topicsError
                ? <ErrorState message={topicsError} onRetry={reloadTopics} />
                : topics.length === 0
                  ? <EmptyState icon="🗂" title="No topics here" message="This subject has no topics yet." />
                  : <TopicsView topics={topics} onOpenTopic={openTopic} />
            )}
            {activeTab === 'sessions' && (
              touchesError
                ? <ErrorState message={touchesError} onRetry={reloadTouches} />
                : touches.length === 0
                  ? <EmptyState icon="🕒" title="No sessions yet" message="Your review history will show up here." />
                  : <SessionsView touches={touches} topics={topics} streak={context?.streak ?? 0} onOpenTopic={openTopic} />
            )}
            {activeTab === 'methods' && (
              contextError
                ? <ErrorState message={contextError} onRetry={reloadContext} />
                : !context || Object.keys(context.methodEffectiveness ?? {}).length === 0
                  ? <EmptyState icon="📊" title="No method data yet" message="Method stats appear after a few sessions." />
                  : <MethodsView context={context} subjectName={activeSubject.name} />
            )}
            {activeTab === 'rules' && (
              <RulesPanel subjectId={activeSubject.id} title={`Rules for ${activeSubject.name.replace(/-/g, ' ')}`} />
            )}
          </>
        )}
      </main>

      <TopicPanel topicId={topicId ?? null} onClose={closeTopic} />
    </div>
  )
}
