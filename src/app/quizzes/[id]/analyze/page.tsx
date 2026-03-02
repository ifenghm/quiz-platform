import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import QuizAnalytics from '@/components/quiz/QuizAnalytics'
import type { Question, Answer, QuestionAnalytics, RankConfig, ScaleConfig, MultiChoiceConfig } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AnalyzePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/quizzes/${params.id}/analyze`)

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!quiz) notFound()

  const canAnalyze =
    quiz.creator_id === user.id ||
    quiz.analyze_access === 'public' ||
    (quiz.analyze_access === 'restricted' &&
      !!(await supabase
        .from('quiz_permissions')
        .select('id')
        .eq('quiz_id', params.id)
        .eq('user_id', user.id)
        .eq('permission', 'analyze')
        .maybeSingle()).data)

  if (!canAnalyze) {
    return (
      <div className="card text-center py-16 text-gray-400">
        You don&apos;t have access to the analytics for this quiz.
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', params.id)
    .order('order_index', { ascending: true })

  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('quiz_id', params.id)

  const qs = (questions ?? []) as Question[]
  const ans = (answers ?? []) as Answer[]

  // Build per-question analytics on the server
  const analytics: QuestionAnalytics[] = qs.map(q => {
    const qAnswers = ans.filter(a => a.question_id === q.id)
    const total = qAnswers.length

    if (q.question_type === 'binary') {
      const trueCount  = qAnswers.filter(a => a.binary_value === true).length
      const falseCount = qAnswers.filter(a => a.binary_value === false).length
      return { question: q, total, trueCount, falseCount }
    }

    if (q.question_type === 'rank') {
      const cfg = q.config as RankConfig
      const dist: Record<number, number> = {}
      for (let v = cfg.min; v <= cfg.max; v++) dist[v] = 0
      qAnswers.forEach(a => { if (a.rank_value !== null) dist[a.rank_value] = (dist[a.rank_value] ?? 0) + 1 })
      const distribution = Object.entries(dist).map(([k, v]) => ({ label: k, count: v }))
      const mean = total > 0
        ? qAnswers.reduce((s, a) => s + (a.rank_value ?? 0), 0) / total
        : 0
      return { question: q, total, distribution, mean }
    }

    if (q.question_type === 'scale') {
      const cfg = q.config as ScaleConfig
      const buckets = 10
      const range = cfg.max - cfg.min
      const bucketSize = range / buckets
      const dist = Array.from({ length: buckets }, (_, i) => ({
        label: (cfg.min + i * bucketSize).toFixed(1),
        count: 0,
      }))
      qAnswers.forEach(a => {
        if (a.scale_value !== null) {
          const idx = Math.min(
            Math.floor((a.scale_value - cfg.min) / bucketSize),
            buckets - 1
          )
          dist[idx].count++
        }
      })
      const mean = total > 0
        ? qAnswers.reduce((s, a) => s + (a.scale_value ?? 0), 0) / total
        : 0
      return { question: q, total, distribution: dist, mean }
    }

    if (q.question_type === 'multichoice') {
      const cfg = q.config as MultiChoiceConfig
      const countMap: Record<string, number> = {}
      for (const choice of cfg.choices) countMap[choice] = 0
      qAnswers.forEach(a => {
        if (!a.string_value) return
        try {
          const parsed = JSON.parse(a.string_value)
          const selected: string[] = Array.isArray(parsed) ? parsed : [parsed]
          selected.forEach(c => { if (c in countMap) countMap[c]++ })
        } catch {}
      })
      const distribution = cfg.choices.map(c => ({ label: c, count: countMap[c] }))
      return { question: q, total, distribution }
    }

    // string
    const strings = qAnswers
      .map(a => a.string_value)
      .filter((s): s is string => s !== null)
    return { question: q, total, strings }
  })

  // Unique answerer count
  const uniqueAnswerers = new Set(ans.map(a => a.answerer_id)).size

  return (
    <QuizAnalytics
      analytics={analytics}
      totalResponses={uniqueAnswerers}
    />
  )
}
