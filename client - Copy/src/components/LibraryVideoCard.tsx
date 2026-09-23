import { Check } from "lucide-react";
import { getVideoArtistLabel } from "@/lib/videoPresentation";

export type LibraryVideoCardVideo = {
  id: number;
  title: string;
  artist?: string | null;
  sizeBytes: number;
  thumbnailUrl?: string | null;
  storageUrl: string;
  createdAt: Date;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function LibraryVideoCard({ video }: { video: LibraryVideoCardVideo }) {
  const artist = getVideoArtistLabel(video.artist);
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/75 shadow-[0_14px_55px_rgba(30,38,48,0.06)]">
      <div className="aspect-video bg-[#dceaf4]">
        {video.storageUrl.startsWith("/manus-storage/vcdn/") ? <iframe className="h-full w-full border-0" src={video.storageUrl} title={video.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> : <video className="h-full w-full object-cover" controls controlsList="nodownload noremoteplayback" disablePictureInPicture preload="metadata" poster={video.thumbnailUrl || undefined} src={video.storageUrl} onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()} />}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.04em]">{video.title}</h3>
            {artist && <p className="mt-1 text-sm text-black/60">{artist}</p>}
            <p className="mt-2 text-xs text-black/45">{formatBytes(video.sizeBytes)} · Added {new Date(video.createdAt).toLocaleDateString()}</p>
          </div>
          <Check className="mt-1 h-5 w-5 shrink-0 text-[#7ba6c5]" />
        </div>
      </div>
    </article>
  );
}
