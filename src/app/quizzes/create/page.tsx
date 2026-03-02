import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizCreatorForm from '@/components/quiz/QuizCreatorForm'

export const dynamic = 'force-dynamic'

export default async function CreateQuizPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/quizzes/create')

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create a Quiz</h1>
      <QuizCreatorForm userId={user.id} />
    </div>
  )
}
