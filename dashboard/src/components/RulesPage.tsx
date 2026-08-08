import { useNavigate } from 'react-router-dom'
import { Header } from './Header'
import { RulesPanel } from './RulesPanel'
import type { Subject } from '../types'

interface Props {
  subjects: Subject[]
  onLogout: () => void
}

export function RulesPage({ subjects, onLogout }: Props) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header
        subjects={subjects}
        onHome={() => navigate('/')}
        onRules={() => navigate('/rules')}
        onLogout={onLogout}
      />
      <main className="flex-1 px-6 md:px-12 pt-8 pb-12">
        <RulesPanel subjectId={null} />
      </main>
    </div>
  )
}
