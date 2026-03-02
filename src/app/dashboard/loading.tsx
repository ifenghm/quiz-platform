export default function DashboardLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card h-40 animate-pulse bg-gray-100" />
        ))}
      </div>
    </div>
  )
}
