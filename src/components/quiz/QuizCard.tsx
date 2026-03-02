import Link from 'next/link'
import type { Quiz } from '@/types'

const ACCESS_COLORS: Record<string, string> = {
  public:     'bg-green-100 text-green-700',
  restricted: 'bg-yellow-100 text-yellow-700',
  private:    'bg-red-100 text-red-700',
}

export default function QuizCard({
  quiz,
  questionCount,
  isOwner    = false,
  hasAnswered = false,
}: {
  quiz:          Quiz
  questionCount: number
  isOwner?:      boolean
  hasAnswered?:  boolean
}) {
  const closeDate = quiz.close_at ? new Date(quiz.close_at) : null
  const isClosed  = closeDate ? closeDate < new Date() : false

  return (
    <div className="card flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2 flex-1">
          {quiz.title}
        </h3>
        <span className={`badge ${ACCESS_COLORS[quiz.read_access]} shrink-0`}>
          {quiz.read_access}
        </span>
      </div>

      {/* Description */}
      {quiz.description && (
        <p className="text-xs text-gray-400 line-clamp-2">{quiz.description}</p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
        {quiz.creator && (
          <span>by {quiz.creator.username ?? quiz.creator.email}</span>
        )}
        {isClosed && <span className="text-red-400">Closed</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <Link
          href={`/quizzes/${quiz.id}`}
          className="btn-primary text-xs py-1.5 flex-1 text-center"
        >
          {hasAnswered ? 'Retake' : 'Take Quiz'}
        </Link>
        {isOwner && (
          <>
            <Link
              href={`/quizzes/${quiz.id}/edit`}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Edit
            </Link>
            <Link
              href={`/quizzes/${quiz.id}/analyze`}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Analyze
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
