'use client'

export default function EditError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card text-center py-16">
      <p className="text-gray-500 mb-4">Failed to load quiz editor.</p>
      <button className="btn-primary" onClick={reset}>Retry</button>
    </div>
  )
}
