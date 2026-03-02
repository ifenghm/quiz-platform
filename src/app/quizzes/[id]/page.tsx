import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import QuizTakerForm from '@/components/quiz/QuizTakerForm'
import type { Question, Answer } from '@/types'

export const dynamic = 'force-dynamic'

export default async function TakeQuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/quizzes/${params.id}`)

  // Questions ordered by index
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', params.id)
    .order('order_index', { ascending: true })

  if (qErr) throw qErr
  if (!questions) notFound()

  // Any existing answers by this user for this quiz
  const { data: existingAnswers } = await supabase
    .from('answers')
    .select('*')
    .eq('quiz_id', params.id)
    .eq('answerer_id', user.id)

  // Check time window from quiz row
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('open_at, close_at, title')
    .eq('id', params.id)
    .single()

  const now = new Date()
  const tooEarly = quiz?.open_at  && new Date(quiz.open_at)  > now
  const tooLate  = quiz?.close_at && new Date(quiz.close_at) < now

  if (tooEarly) {
    return (
      <div className="card text-center py-16 text-gray-400">
        This quiz opens on{' '}
        <strong>{new Date(quiz!.open_at!).toLocaleString()}</strong>.
      </div>
    )
  }

  if (tooLate) {
    return (
      <div className="card text-center py-16 text-gray-400">
        This quiz closed on{' '}
        <strong>{new Date(quiz!.close_at!).toLocaleString()}</strong>.
      </div>
    )
  }

  const alreadyAnswered = (existingAnswers?.length ?? 0) === questions.length

  return (
    <QuizTakerForm
      quizId={params.id}
      userId={user.id}
      questions={questions as Question[]}
      existingAnswers={(existingAnswers ?? []) as Answer[]}
      alreadyCompleted={alreadyAnswered}
    />
  )
}
