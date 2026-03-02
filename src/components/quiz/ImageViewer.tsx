interface Props {
  url: string | null | undefined
}

export default function ImageViewer({ url }: Props) {
  if (!url) return null
  return <img src={url} alt="" className="max-h-64 rounded-lg object-contain" />
}
