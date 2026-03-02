export default function QuizLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card h-28 bg-gray-100" />
      ))}
    </div>
  )
}
