import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Question, Answer } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDownload =
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

  if (!canDownload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', params.id)
    .order('order_index', { ascending: true })

  const { data: answers } = await supabase
    .from('answers')
    .select('*, answerer:user_accounts(email)')
    .eq('quiz_id', params.id)

  const qs = (questions ?? []) as Question[]
  const ans = (answers ?? []) as (Answer & { answerer?: { email: string } })[]

  // Wide format: one row per respondent, one column per question
  const headers = ['Email', ...qs.map(q => q.question_text)]

  const answererIds = Array.from(new Set(ans.map(a => a.answerer_id)))
  const rows = answererIds.map((answererId) => {
    const ra = ans.filter(a => a.answerer_id === answererId)
    const email = ra[0]?.answerer?.email ?? answererId
    return [
      email,
      ...qs.map(q => {
        const a = ra.find(a => a.question_id === q.id)
        if (!a) return ''
        if (q.question_type === 'binary') return a.binary_value === null ? '' : String(a.binary_value)
        if (q.question_type === 'rank')   return a.rank_value  === null ? '' : String(a.rank_value)
        if (q.question_type === 'scale')  return a.scale_value === null ? '' : String(a.scale_value)
        if (q.question_type === 'multichoice' && a.string_value) {
          try {
            const parsed = JSON.parse(a.string_value)
            return Array.isArray(parsed) ? parsed.join('; ') : String(parsed)
          } catch {
            return a.string_value
          }
        }
        return a.string_value ?? ''
      }),
    ]
  })

  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v

  const csv = [headers, ...rows]
    .map(row => row.map(cell => escape(String(cell))).join(','))
    .join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="quiz-responses.csv"`,
    },
  })
}
