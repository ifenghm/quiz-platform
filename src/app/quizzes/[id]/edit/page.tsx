import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import QuizCreatorForm from '@/components/quiz/QuizCreatorForm'
import PermissionsEditor from '@/components/quiz/PermissionsEditor'
import type { Quiz, Question, QuizPermission } from '@/types'

export const dynamic = 'force-dynamic'

export default async function EditQuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/quizzes/${params.id}/edit`)

  const { data: quiz, error: qErr } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (qErr || !quiz) notFound()

  // Verify write access (RLS will enforce, but we also want to show a nice message)
  const canWrite =
    quiz.creator_id === user.id ||
    (quiz.write_access === 'restricted' &&
      !!(await supabase
        .from('quiz_permissions')
        .select('id')
        .eq('quiz_id', params.id)
        .eq('user_id', user.id)
        .eq('permission', 'write')
        .maybeSingle()).data)

  if (!canWrite) {
    return (
      <div className="card text-center py-16 text-gray-400">
        You don&apos;t have permission to edit this quiz.
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', params.id)
    .order('order_index', { ascending: true })

  const { data: permissions } = await supabase
    .from('quiz_permissions')
    .select('*, user:user_accounts(id, email, username)')
    .eq('quiz_id', params.id)

  const isOwner = quiz.creator_id === user.id

  return (
    <div className="space-y-8">
      <QuizCreatorForm
        userId={user.id}
        existingQuiz={quiz as Quiz}
        existingQuestions={(questions ?? []) as Question[]}
      />

      {isOwner && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Permissions
          </h2>
          <PermissionsEditor
            quizId={params.id}
            currentPermissions={(permissions ?? []) as QuizPermission[]}
          />
        </div>
      )}
    </div>
  )
}
