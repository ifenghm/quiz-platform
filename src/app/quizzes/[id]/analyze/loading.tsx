export default function AnalyzeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 rounded" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card h-52 bg-gray-100" />
      ))}
    </div>
  )
}
