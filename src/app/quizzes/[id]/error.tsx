'use client'

export default function QuizError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="card text-center py-16">
      <p className="text-gray-500 mb-4">{error.message ?? 'Failed to load quiz.'}</p>
      <button className="btn-primary" onClick={reset}>Retry</button>
    </div>
  )
}
