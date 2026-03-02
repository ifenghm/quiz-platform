import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Quiz } from '@/types'

// Shared layout wrapping Take / Edit / Analyze tabs for a single quiz
export default async function QuizLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createClient()

  const { data: quiz, error } = await supabase
    .from('quizzes')
    .select('*, creator:user_accounts(id, email, username)')
    .eq('id', params.id)
    .single()

  if (error || !quiz) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  const isOwner = user?.id === quiz.creator_id

  const canWrite =
    isOwner ||
    (quiz.write_access === 'restricted' &&
      !!(await supabase
        .from('quiz_permissions')
        .select('id')
        .eq('quiz_id', params.id)
        .eq('user_id', user?.id ?? '')
        .eq('permission', 'write')
        .maybeSingle()).data)

  const canAnalyze =
    isOwner ||
    quiz.analyze_access === 'public' ||
    (quiz.analyze_access === 'restricted' &&
      !!(await supabase
        .from('quiz_permissions')
        .select('id')
        .eq('quiz_id', params.id)
        .eq('user_id', user?.id ?? '')
        .eq('permission', 'analyze')
        .maybeSingle()).data)

  const q = quiz as Quiz

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Quiz header */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">
          By{' '}
          <span className="font-medium text-gray-600">
            {q.creator?.username ?? q.creator?.email ?? 'unknown'}
          </span>
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{q.title}</h1>
        {q.description && (
          <p className="text-gray-500 mt-1 text-sm">{q.description}</p>
        )}
      </div>

      {/* Tab bar */}
      <nav className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        <TabLink href={`/quizzes/${params.id}`} label="Take" />
        {canWrite  && <TabLink href={`/quizzes/${params.id}/edit`}    label="Edit"    />}
        {canAnalyze && <TabLink href={`/quizzes/${params.id}/analyze`} label="Analyze" />}
      </nav>

      {children}
    </div>
  )
}

function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-brand-600
                 border-b-2 border-transparent hover:border-brand-400 transition-colors"
    >
      {label}
    </Link>
  )
}
