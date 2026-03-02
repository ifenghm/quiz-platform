export default function EditLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card h-20 bg-gray-100" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card h-36 bg-gray-100" />
      ))}
    </div>
  )
}
