import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizCard from '@/components/quiz/QuizCard'
import Link from 'next/link'
import type { Quiz } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard')

  const tab = searchParams.tab === 'taken' ? 'taken' : 'mine'

  // Quizzes I created
  const { data: myQuizzes } = await supabase
    .from('quizzes')
    .select(`*, creator:user_accounts(id, email, username), questions(id)`)
    .eq('creator_id', user.id)
    .order('updated_at', { ascending: false })

  // Quiz IDs I've answered
  const { data: answerRows } = await supabase
    .from('answers')
    .select('quiz_id')
    .eq('answerer_id', user.id)

  const answeredQuizIds = new Set((answerRows ?? []).map(r => r.quiz_id))


  const { data: takenQuizzes } = answeredQuizIds.size > 0
    ? await supabase
        .from('quizzes')
        .select(`*, creator:user_accounts(id, email, username), questions(id)`)
        .in('id', Array.from(answeredQuizIds))
        .order('updated_at', { ascending: false })
    : { data: [] }

  const mine  = (myQuizzes   ?? []) as (Quiz & { questions: { id: string }[] })[]
  const taken = (takenQuizzes ?? []) as (Quiz & { questions: { id: string }[] })[]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link href="/quizzes/create" className="btn-primary">
          + New Quiz
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <Link
          href="/dashboard?tab=mine"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            tab === 'mine'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Quizzes
          <span className="ml-1.5 text-xs text-gray-400">({mine.length})</span>
        </Link>
        <Link
          href="/dashboard?tab=taken"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            tab === 'taken'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Quizzes Taken
          <span className="ml-1.5 text-xs text-gray-400">({taken.length})</span>
        </Link>
      </div>

      {/* My Quizzes tab */}
      {tab === 'mine' && (
        <section>
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
      )}

      {/* Quizzes Taken tab */}
      {tab === 'taken' && (
        <section>
          {taken.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              You haven&apos;t taken any quizzes yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {taken.map(q => (
                <QuizCard
                  key={q.id}
                  quiz={q}
                  questionCount={q.questions?.length ?? 0}
                  hasAnswered
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
