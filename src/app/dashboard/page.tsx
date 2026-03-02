import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizCard from '@/components/quiz/QuizCard'
import Link from 'next/link'
import type { Quiz } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard')

  // Quizzes I created
  const { data: myQuizzes } = await supabase
    .from('quizzes')
    .select(`*, creator:user_accounts(id, email, username), questions(id)`)
    .eq('creator_id', user.id)
    .order('updated_at', { ascending: false })

  // Quizzes I have explicit permission to access (not my own)
  const { data: grantedPermissions } = await supabase
    .from('quiz_permissions')
    .select(`quiz:quizzes(*, creator:user_accounts(id, email, username), questions(id))`)
    .eq('user_id', user.id)

  const grantedQuizzes = (grantedPermissions ?? [])
    .map(p => (p.quiz as unknown) as Quiz & { questions: { id: string }[] })
    .filter(q => q && q.creator_id !== user.id)

  // Quizzes I've answered
  const { data: answerRows } = await supabase
    .from('answers')
    .select('quiz_id')
    .eq('answerer_id', user.id)

  const answeredQuizIds = new Set((answerRows ?? []).map(r => r.quiz_id))

  const mine = (myQuizzes ?? []) as (Quiz & { questions: { id: string }[] })[]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link href="/quizzes/create" className="btn-primary">
          + New Quiz
        </Link>
      </div>

      {/* My Quizzes */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          My Quizzes ({mine.length})
        </h2>
        {mine.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            No quizzes yet.{' '}
            <Link href="/quizzes/create" className="text-brand-600 hover:underline">
              Create one!
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mine.map(q => (
              <QuizCard
                key={q.id}
                quiz={q}
                questionCount={q.questions?.length ?? 0}
                isOwner
              />
            ))}
          </div>
        )}
      </section>

      {/* Shared with me */}
      {grantedQuizzes.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Shared with me ({grantedQuizzes.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {grantedQuizzes.map(q => (
              <QuizCard
                key={q.id}
                quiz={q}
                questionCount={q.questions?.length ?? 0}
                hasAnswered={answeredQuizIds.has(q.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
