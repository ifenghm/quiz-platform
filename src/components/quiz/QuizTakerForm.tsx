'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ImageViewer         from './ImageViewer'
import BinaryQuestion      from './questions/BinaryQuestion'
import RankQuestion        from './questions/RankQuestion'
import ScaleQuestion       from './questions/ScaleQuestion'
import StringQuestion      from './questions/StringQuestion'
import MultiChoiceQuestion from './questions/MultiChoiceQuestion'
import type {
  Question, Answer, AnswerDraft, AnswerValue,
  BinaryConfig, RankConfig, ScaleConfig, StringConfig, MultiChoiceConfig,
} from '@/types'

// ─── Grading logic ────────────────────────────────────────────────────────────

function gradeAnswer(question: Question, userValue: AnswerValue): boolean {
  const correct = question.correct_answer
  if (correct == null) return false

  switch (question.question_type) {
    case 'binary':
    case 'rank':
    case 'scale':
      return userValue === correct

    case 'string':
      return (
        String(userValue).trim().toLowerCase() ===
        String(correct).trim().toLowerCase()
      )

    case 'multichoice': {
      const userArr   = (Array.isArray(userValue) ? userValue : [userValue as string]).slice().sort()
      const correctArr = (Array.isArray(correct)  ? correct  : [correct  as string]).slice().sort()
      return userArr.join('\x00') === correctArr.join('\x00')
    }
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  quizId:                string
  userId:                string
  questions:             Question[]
  existingAnswers:       Answer[]
  alreadyCompleted:      boolean
  revealCorrectAnswers:  boolean
}

export default function QuizTakerForm({
  quizId, userId, questions, existingAnswers, alreadyCompleted, revealCorrectAnswers,
}: Props) {
  const supabase = createClient()
  const router   = useRouter()

  // Seed drafts from existing answers
  const initialDrafts: Record<string, AnswerDraft> = {}
  for (const a of existingAnswers) {
    let value: AnswerValue
    if (a.answer_type === 'multichoice') {
      try { value = JSON.parse(a.string_value ?? 'null') ?? [] }
      catch { value = [] }
    } else {
      value = (
        a.answer_type === 'binary' ? a.binary_value :
        a.answer_type === 'rank'   ? a.rank_value   :
        a.answer_type === 'scale'  ? a.scale_value  :
        a.string_value
      ) as AnswerValue
    }
    initialDrafts[a.question_id] = { question_id: a.question_id, answer_type: a.answer_type, value }
  }

  const [drafts,    setDrafts]    = useState<Record<string, AnswerDraft>>(initialDrafts)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
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

    const unanswered = questions.filter(q => {
      const draft = drafts[q.id]
      if (!draft) return true
      if (q.question_type === 'multichoice') {
        const val = draft.value
        return Array.isArray(val) ? val.length === 0 : val == null
      }
      return false
    })
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
      binary_value: d.answer_type === 'binary'      ? d.value as boolean : null,
      rank_value:   d.answer_type === 'rank'        ? d.value as number  : null,
      scale_value:  d.answer_type === 'scale'       ? d.value as number  : null,
      string_value: d.answer_type === 'string'      ? d.value as string
                  : d.answer_type === 'multichoice' ? JSON.stringify(d.value)
                  : null,
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
      <div className="space-y-4">
        <div className="card text-center py-10">
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

        {revealCorrectAnswers && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-800">Results</h3>
            {questions.map((q, idx) => {
              const draft = drafts[q.id]
              const hasCorrect = q.correct_answer != null
              const userValue = draft?.value

              let isCorrect: boolean | null = null
              if (hasCorrect && userValue != null) {
                isCorrect = gradeAnswer(q, userValue)
              }

              return (
                <div key={q.id} className="border rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-800">
                    <span className="text-brand-600 mr-2">{idx + 1}.</span>
                    {q.question_text}
                  </p>
                  <ImageViewer url={q.image_url} />

                  <div className="text-sm text-gray-600">
                    <span className="text-gray-400 text-xs uppercase tracking-wide mr-1">Your answer:</span>
                    <span>{formatAnswerValue(userValue, q)}</span>
                  </div>

                  {hasCorrect ? (
                    <div className="flex items-center gap-2">
                      {isCorrect ? (
                        <span className="text-green-600 font-medium text-sm">Correct</span>
                      ) : (
                        <>
                          <span className="text-red-500 font-medium text-sm">Incorrect</span>
                          <span className="text-gray-400 text-xs">—</span>
                          <span className="text-xs text-gray-500">
                            Correct: {formatAnswerValue(q.correct_answer as AnswerValue, q)}
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No correct answer set</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map((q, idx) => {
        const draft = drafts[q.id]
        return (
          <div key={q.id} className="card p-4 sm:p-6">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              <span className="text-brand-600 mr-2">{idx + 1}.</span>
              {q.question_text}
            </p>
            <ImageViewer url={q.image_url} />

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
            {q.question_type === 'multichoice' && (
              <MultiChoiceQuestion
                config={q.config as MultiChoiceConfig}
                value={draft?.value as string | string[] ?? null}
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatAnswerValue(val: AnswerValue | null | undefined, q: Question): string {
  if (val == null) return '—'
  if (q.question_type === 'binary') {
    const cfg = q.config as BinaryConfig
    return val ? cfg.trueLabel : cfg.falseLabel
  }
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}
