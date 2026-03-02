import { createClient } from '@/lib/supabase/server'
import QuizCard from '@/components/quiz/QuizCard'
import Link from 'next/link'
import type { Quiz } from '@/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  let items: (Quiz & { questions: { id: string }[] })[] = []
  let error = null

  if (isLoggedIn) {
    const { data: quizzes, error: fetchError } = await supabase
      .from('quizzes')
      .select(`
        *,
        creator:user_accounts(id, email, username),
        questions(id)
      `)
      .order('created_at', { ascending: false })
      .limit(24)

    error = fetchError
    items = (quizzes ?? []) as (Quiz & { questions: { id: string }[] })[]
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Quiz<span className="text-brand-600">Platform</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Build rich, typed quizzes with binary, ranked, scaled, and open-text questions.
          Control who can take them, edit them, and see the results.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/quizzes/create" className="btn-primary">
            Create a Quiz
          </Link>
          {isLoggedIn && (
            <Link href="/dashboard" className="btn-secondary">
              My Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* Public quiz grid — only shown when logged in */}
      {isLoggedIn && (
        <>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Public Quizzes</h2>
          {error && (
            <p className="text-red-500 text-sm mb-4">Failed to load quizzes.</p>
          )}
          {items.length === 0 && !error && (
            <div className="card text-center py-16 text-gray-400">
              No public quizzes yet.{' '}
              <Link href="/quizzes/create" className="text-brand-600 hover:underline">
                Create the first one!
              </Link>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(q => (
              <QuizCard
                key={q.id}
                quiz={q}
                questionCount={q.questions?.length ?? 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
