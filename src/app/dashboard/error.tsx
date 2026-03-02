'use client'

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="card text-center py-16">
        <p className="text-gray-500 mb-4">Failed to load your dashboard.</p>
        <button className="btn-primary" onClick={reset}>Retry</button>
      </div>
    </div>
  )
}
