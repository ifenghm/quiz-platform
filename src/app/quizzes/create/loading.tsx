export default function CreateLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="card space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  )
}
