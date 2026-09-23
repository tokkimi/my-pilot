import { tr } from '../lib/i18n'
import { X } from 'lucide-react'
import type { MediaRef } from '../lib/types'
import { useMediaUrl } from '../lib/media'

export default function MediaViewer({ media, onClose }: { media: MediaRef; onClose: () => void }) {
  const url = useMediaUrl(media)
  const isImg = media.mime.startsWith('image/')
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <div className="safe-top flex justify-end p-3 text-white"><button aria-label={tr("Fermer")}><X /></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={e => e.stopPropagation()}>
        {!url ? <span className="text-white">{tr("Chargement…")}</span>
          : media.mime.startsWith('video/') ? <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
          : media.mime.startsWith('audio/') ? <audio src={url} controls autoPlay />
          : media.mime === 'application/pdf' ? <iframe src={url} className="h-full w-full bg-white" title={media.name} />
          : isImg ? <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          : <a href={url} download={media.name} className="btn-primary">Télécharger {media.name}</a>}
      </div>
      <div className="safe-bottom p-3 text-center text-xs text-white/70">{media.name} · {(media.size / 1048576).toFixed(2)} Mo · {url && <a href={url} download={media.name} className="underline" onClick={e => e.stopPropagation()}>Télécharger</a>}</div>
    </div>
  )
}
