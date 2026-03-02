'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import BinaryQuestion from './questions/BinaryQuestion'
import RankQuestion   from './questions/RankQuestion'
import ScaleQuestion  from './questions/ScaleQuestion'
import StringQuestion from './questions/StringQuestion'
import type {
  Question, Answer, AnswerDraft, AnswerValue,
  BinaryConfig, RankConfig, ScaleConfig, StringConfig,
} from '@/types'

interface Props {
  quizId:           string
  userId:           string
  questions:        Question[]
  existingAnswers:  Answer[]
  alreadyCompleted: boolean
}

export default function QuizTakerForm({
  quizId, userId, questions, existingAnswers, alreadyCompleted,
}: Props) {
  const supabase = createClient()
  const router   = useRouter()

  // Seed drafts from existing answers
  const initialDrafts: Record<string, AnswerDraft> = {}
  for (const a of existingAnswers) {
    initialDrafts[a.question_id] = {
      question_id: a.question_id,
      answer_type: a.answer_type,
      value: (
        a.answer_type === 'binary'  ? a.binary_value  :
        a.answer_type === 'rank'    ? a.rank_value    :
        a.answer_type === 'scale'   ? a.scale_value   :
        a.string_value
      ) as AnswerValue,
    }
  }

  const [drafts,   setDrafts]   = useState<Record<string, AnswerDraft>>(initialDrafts)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(alreadyCompleted)

  function setAnswer(question: Question, value: AnswerValue) {
    setDrafts(prev => ({
      ...prev,
      [question.id]: {
        question_id: question.id,
        answer_type: question.question_type,
        value,
      },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const unanswered = questions.filter(q => drafts[q.id] === undefined)
    if (unanswered.length > 0) {
      setError(`Please answer all questions (${unanswered.length} remaining).`)
      return
    }

    setLoading(true)
    setError(null)

    const rows = Object.values(drafts).map(d => ({
      quiz_id:     quizId,
      question_id: d.question_id,
      answerer_id: userId,
      answer_type: d.answer_type,
      binary_value: d.answer_type === 'binary' ? d.value as boolean  : null,
      rank_value:   d.answer_type === 'rank'   ? d.value as number   : null,
      scale_value:  d.answer_type === 'scale'  ? d.value as number   : null,
      string_value: d.answer_type === 'string' ? d.value as string   : null,
    }))

    const { error: upsertError } = await supabase
      .from('answers')
      .upsert(rows, { onConflict: 'question_id,answerer_id' })

    if (upsertError) {
      setError(upsertError.message)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
    router.refresh()
  }

  if (submitted) {
    return (
      <div className="card text-center py-16">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Responses saved!</h2>
        <p className="text-gray-500 text-sm mb-6">
          You can retake the quiz to update your answers.
        </p>
        <button
          className="btn-secondary"
          onClick={() => setSubmitted(false)}
        >
          Retake Quiz
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map((q, idx) => {
        const draft = drafts[q.id]
        return (
          <div key={q.id} className="card">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              <span className="text-brand-600 mr-2">{idx + 1}.</span>
              {q.question_text}
            </p>

            {q.question_type === 'binary' && (
              <BinaryQuestion
                config={q.config as BinaryConfig}
                value={draft?.value as boolean ?? null}
                onChange={v => setAnswer(q, v)}
              />
            )}
            {q.question_type === 'rank' && (
              <RankQuestion
                config={q.config as RankConfig}
                value={draft?.value as number ?? null}
                onChange={v => setAnswer(q, v)}
              />
            )}
            {q.question_type === 'scale' && (
              <ScaleQuestion
                config={q.config as ScaleConfig}
                value={draft?.value as number ?? null}
                onChange={v => setAnswer(q, v)}
              />
            )}
            {q.question_type === 'string' && (
              <StringQuestion
                config={q.config as StringConfig}
                value={draft?.value as string ?? ''}
                onChange={v => setAnswer(q, v)}
              />
            )}
          </div>
        )
      })}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        className="btn-primary w-full py-3"
        disabled={loading}
      >
        {loading ? 'Saving…' : 'Submit Answers'}
      </button>
    </form>
  )
}
