import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Film,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  Pencil,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { uploadVideoFile, uploadVideoFileResumable, type UploadProgress } from "@/lib/videoUpload";
import { getVideoArtistLabel } from "@/lib/videoPresentation";
import LibraryVideoCard from "@/components/LibraryVideoCard";
const MAX_VIDEO_BYTES = 3 * 1024 * 1024 * 1024;
const MAX_VIDEO_GB = 3;

type VideoRecord = {
  id: number;
  title: string;
  artist?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageUrl: string;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  thumbnailMimeType?: string | null;
  thumbnailSizeBytes?: number | null;
  createdAt: Date;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUploadEta(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "estimating time";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `about ${rounded}s left`;
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `about ${minutes}m ${remainingSeconds}s left`;
}

function formatUploadSpeed(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function GeometricAccent({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${position === "top" ? "right-[-3rem] top-[-4rem]" : "bottom-[-6rem] left-[-5rem]"}`}
    >
      <div className="accent-blue h-40 w-40 rotate-12 rounded-[2.5rem]" />
      <div className="accent-pink absolute left-16 top-20 h-28 w-28 -rotate-12 rounded-full" />
    </div>
  );
}

function CodeEntry({
  admin = false,
  onSubmit,
  isPending,
}: {
  admin?: boolean;
  onSubmit: (code: string) => void;
  isPending: boolean;
}) {
  const [code, setCode] = useState("");
  const label = admin ? "Administrator code" : "Six-digit access code";
  const hint = admin ? "Enter the separate admin code to manage this library." : "This library is private. Enter the code shared with you.";

  return (
    <form
      className="space-y-5"
      onSubmit={event => {
        event.preventDefault();
        if (code.length === 6) onSubmit(code);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={admin ? "admin-code" : "viewer-code"}>{label}</Label>
        <Input
          id={admin ? "admin-code" : "viewer-code"}
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="h-14 rounded-2xl border-black/10 bg-white/70 text-center font-mono text-2xl tracking-[0.4em] shadow-none"
          aria-describedby={admin ? "admin-code-hint" : "viewer-code-hint"}
          autoFocus
        />
        <p id={admin ? "admin-code-hint" : "viewer-code-hint"} className="fine-print">
          {hint}
        </p>
      </div>
      <Button type="submit" disabled={code.length !== 6 || isPending} className="h-12 w-full rounded-full bg-black text-white hover:bg-black/80">
        {isPending ? "Checking…" : admin ? "Open admin panel" : "Unlock video library"}
        <ArrowUpRight className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}

function ViewerGate({ onSuccess }: { onSuccess: () => void }) {
  const verify = trpc.access.verifyViewer.useMutation({
    onSuccess: () => {
      onSuccess();
      toast.success("Library unlocked");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden px-5 py-10 sm:px-10">
      <GeometricAccent position="top" />
      <div className="mx-auto flex w-full max-w-md items-center justify-center">
        <Card className="relative z-10 w-full overflow-hidden rounded-[2rem] border-black/10 bg-white/85 shadow-[0_28px_90px_rgba(30,38,48,0.10)] backdrop-blur">
          <CardHeader className="space-y-3 px-7 pb-4 pt-8 sm:px-10 sm:pt-10">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dceaf4] text-black"><KeyRound className="h-5 w-5" /></div>
            <CardTitle className="text-2xl tracking-[-0.04em]">Enter to continue</CardTitle>
            <p className="text-sm leading-6 text-black/50">Your access code opens the private collection without exposing it publicly.</p>
          </CardHeader>
          <CardContent className="px-7 pb-8 sm:px-10 sm:pb-10"><CodeEntry onSubmit={code => verify.mutate({ code })} isPending={verify.isPending} /></CardContent>
          <div className="h-2 bg-gradient-to-r from-[#dceaf4] via-white to-[#f5dfe4]" />
        </Card>
      </div>
    </main>
  );
}

function AdminGate({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const verify = trpc.access.verifyAdmin.useMutation({
    onSuccess: () => {
      onSuccess();
      toast.success("Admin panel unlocked");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm">
      <Card className="relative w-full max-w-md rounded-[2rem] border-black/10 bg-[#f4f6f7] shadow-2xl">
        <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20" aria-label="Close admin gate"><X className="h-5 w-5" /></button>
        <CardHeader className="px-7 pb-4 pt-8 sm:px-9 sm:pt-9"><div className="eyebrow mb-4"><ShieldCheck className="h-4 w-4" /> Admin area</div><CardTitle className="text-2xl tracking-[-0.04em]">Manage the library</CardTitle><p className="text-sm leading-6 text-black/50">A second code keeps publishing controls separate from viewer access.</p></CardHeader>
        <CardContent className="px-7 pb-8 sm:px-9 sm:pb-9"><CodeEntry admin onSubmit={code => verify.mutate({ code })} isPending={verify.isPending} /></CardContent>
      </Card>
    </div>
  );
}

function VideoCard({ video, onEdit, onDelete, deleting }: { video: VideoRecord; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-black/10 bg-white/70 shadow-[0_10px_40px_rgba(30,38,48,0.05)] transition-transform duration-200 hover:-translate-y-1">
      <div className="relative aspect-video overflow-hidden bg-[#dceaf4]">
        <video className="h-full w-full object-cover" controls controlsList="nodownload noremoteplayback" disablePictureInPicture preload="metadata" poster={video.thumbnailUrl || undefined} src={video.storageUrl} onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()} />
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0"><h3 className="truncate font-semibold tracking-[-0.02em]">{video.title}</h3>{getVideoArtistLabel(video.artist) && <p className="mt-1 truncate text-sm text-black/60">{getVideoArtistLabel(video.artist)}</p>}<p className="mt-1 truncate text-xs text-black/45">{video.originalName} · {formatBytes(video.sizeBytes)}</p></div>
        <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" onClick={onEdit} className="rounded-full text-black/45 hover:bg-[#dceaf4] hover:text-black" aria-label={`Edit ${video.title}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} className="rounded-full text-black/45 hover:bg-[#f5dfe4] hover:text-black" aria-label={`Delete ${video.title}`}><Trash2 className="h-4 w-4" /></Button></div>
      </div>
    </article>
  );
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumbnailProgress, setThumbnailProgress] = useState(0);
  const [uploadProgressDetails, setUploadProgressDetails] = useState<UploadProgress | null>(null);
  const [uploadStage, setUploadStage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [editingVideo, setEditingVideo] = useState<VideoRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editThumbnailFile, setEditThumbnailFile] = useState<File | null>(null);
  const [clearEditThumbnail, setClearEditThumbnail] = useState(false);
  const [editThumbnailProgress, setEditThumbnailProgress] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const editThumbnailInputRef = useRef<HTMLInputElement>(null);
  const videosQuery = trpc.admin.listVideos.useQuery();
  const codesQuery = trpc.admin.listAccessCodes.useQuery();
  const finalizeUpload = trpc.admin.finalizeUpload.useMutation();
  const deleteVideo = trpc.admin.deleteVideo.useMutation({ onSuccess: () => { utils.admin.listVideos.invalidate(); utils.library.list.invalidate(); toast.success("Video deleted"); }, onError: error => toast.error(error.message) });
  const updateVideo = trpc.admin.updateVideo.useMutation({ onSuccess: async () => { await utils.admin.listVideos.invalidate(); await utils.library.list.invalidate(); toast.success("Video updated"); }, onError: error => toast.error(error.message) });
  const addCode = trpc.admin.addAccessCode.useMutation({ onSuccess: () => { setNewCode(""); utils.admin.listAccessCodes.invalidate(); toast.success("Access code added"); }, onError: error => toast.error(error.message) });
  const deleteCode = trpc.admin.deleteAccessCode.useMutation({ onSuccess: () => { utils.admin.listAccessCodes.invalidate(); toast.success("Access code removed"); }, onError: error => toast.error(error.message) });
  const logoutAdmin = trpc.access.logoutAdmin.useMutation({ onSuccess: onClose });

  const handleUpload = async () => {
    if (!file) return toast.error("Choose a video first.");
    if (!title.trim()) return toast.error("Add a title for this video.");
    if (!file.type.startsWith("video/") || file.size > MAX_VIDEO_BYTES) return toast.error("Choose a video file no larger than 3 GB.");
    if (thumbnailFile && (!thumbnailFile.type.startsWith("image/") || thumbnailFile.size > 10 * 1024 * 1024)) return toast.error("Choose an image thumbnail no larger than 10 MB.");
    setUploading(true); setProgress(0); setThumbnailProgress(0); setUploadProgressDetails(null); setUploadStage("Uploading video…");
    try {
      const upload = await uploadVideoFileResumable(file, (value, detail) => { setProgress(value); setUploadProgressDetails(detail ?? null); }, status => setUploadStage(status === "assembling" ? "Assembling video in storage…" : "Uploading video…"));
      setUploadStage(thumbnailFile ? "Uploading thumbnail…" : "Saving video details…");
      const thumbnailUpload = thumbnailFile ? await uploadVideoFile(thumbnailFile, setThumbnailProgress, "thumbnail") : null;
      setUploadStage("Saving video details…");
      await finalizeUpload.mutateAsync({
        title: title.trim(),
        ...(artist.trim() ? { artist: artist.trim() } : {}),
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey: upload.key,
        storageUrl: upload.url,
        ...(thumbnailUpload && thumbnailFile ? {
          thumbnailKey: thumbnailUpload.key,
          thumbnailUrl: thumbnailUpload.url,
          thumbnailMimeType: thumbnailFile.type,
          thumbnailSizeBytes: thumbnailFile.size,
        } : {}),
      });
      setTitle(""); setArtist(""); setFile(null); setThumbnailFile(null); setProgress(100); setThumbnailProgress(100); if (fileInputRef.current) fileInputRef.current.value = ""; if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
      await utils.admin.listVideos.invalidate(); await utils.library.list.invalidate();
      toast.success("Video added to the library");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally { setUploading(false); setUploadStage(""); }
  };

  const openEdit = (video: VideoRecord) => {
    setEditingVideo(video);
    setEditTitle(video.title);
    setEditArtist(video.artist ?? "");
    setEditThumbnailFile(null);
    setClearEditThumbnail(false);
    setEditThumbnailProgress(0);
  };

  const handleUpdate = async () => {
    if (!editingVideo) return;
    if (!editTitle.trim()) return toast.error("Add a title for this video.");
    if (clearEditThumbnail && editThumbnailFile) return toast.error("Choose a new thumbnail or clear the existing one.");
    if (editThumbnailFile && (!editThumbnailFile.type.startsWith("image/") || editThumbnailFile.size > 10 * 1024 * 1024)) return toast.error("Choose an image thumbnail no larger than 10 MB.");
    setSavingEdit(true); setEditThumbnailProgress(0);
    try {
      const thumbnailUpload = editThumbnailFile ? await uploadVideoFile(editThumbnailFile, setEditThumbnailProgress, "thumbnail") : null;
      await updateVideo.mutateAsync({
        id: editingVideo.id,
        title: editTitle.trim(),
        ...(editArtist.trim() ? { artist: editArtist.trim() } : {}),
        ...(clearEditThumbnail ? { clearThumbnail: true } : {}),
        ...(thumbnailUpload && editThumbnailFile ? {
          thumbnailKey: thumbnailUpload.key,
          thumbnailUrl: thumbnailUpload.url,
          thumbnailMimeType: editThumbnailFile.type,
          thumbnailSizeBytes: editThumbnailFile.size,
        } : {}),
      });
      setEditingVideo(null);
      if (editThumbnailInputRef.current) editThumbnailInputRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video update failed");
    } finally { setSavingEdit(false); }
  };

  const videos = (videosQuery.data ?? []) as VideoRecord[];

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="eyebrow mb-3"><ShieldCheck className="h-4 w-4" /> Admin controls</div><h2 className="section-heading">Keep the collection<br /><span className="heading-muted">in your hands.</span></h2></div><Button variant="outline" onClick={() => logoutAdmin.mutate()} className="w-fit rounded-full border-black/15 bg-white/50"><LogOut className="mr-2 h-4 w-4" /> Lock admin</Button></div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[1.75rem] border-black/10 bg-white/70 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UploadCloud className="h-5 w-5" /> Add a video</CardTitle><p className="fine-print">Files go directly to secure object storage. Maximum size: {MAX_VIDEO_GB} GB.</p></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="video-title">Video title</Label><Input id="video-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Friday evening learning" className="rounded-xl border-black/10 bg-white/75" /></div>
          <div className="space-y-2"><Label htmlFor="video-artist">Artist <span className="font-normal text-black/40">(optional)</span></Label><Input id="video-artist" value={artist} onChange={event => setArtist(event.target.value)} placeholder="e.g. Rabbi David Cohen" className="rounded-xl border-black/10 bg-white/75" /></div>
          <div className="space-y-2"><Label htmlFor="video-file">Video file</Label><Input ref={fileInputRef} id="video-file" type="file" accept="video/*" onChange={event => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border-black/10 bg-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1 file:text-xs file:font-medium file:text-white" /></div>
          {file && <div className="rounded-xl bg-[#dceaf4]/50 px-4 py-3 text-sm text-black/65">{file.name} <span className="text-black/35">· {formatBytes(file.size)}</span></div>}
          <div className="space-y-2"><Label htmlFor="thumbnail-file">Thumbnail <span className="font-normal text-black/40">(optional, image up to 10 MB)</span></Label><Input ref={thumbnailInputRef} id="thumbnail-file" type="file" accept="image/*" onChange={event => setThumbnailFile(event.target.files?.[0] ?? null)} className="rounded-xl border-black/10 bg-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1 file:text-xs file:font-medium file:text-white" /></div>
          {thumbnailFile && <div className="rounded-xl bg-[#f5dfe4]/45 px-4 py-3 text-sm text-black/65">{thumbnailFile.name} <span className="text-black/35">· {formatBytes(thumbnailFile.size)}</span></div>}
          {uploading && <div className="space-y-3 rounded-2xl bg-[#dceaf4]/35 p-4"><div className="space-y-2"><div className="flex flex-col gap-1 text-xs text-black/55 sm:flex-row sm:items-center sm:justify-between"><span>{uploadStage || "Uploading video…"}</span><span className="font-medium text-black/70">{progress}%{uploadProgressDetails && progress < 100 ? ` · ${formatUploadSpeed(uploadProgressDetails.speedBytesPerSecond)} · ${formatUploadEta(uploadProgressDetails.etaSeconds)}` : progress >= 100 ? " · finalizing" : ""}</span></div><Progress value={progress} className="h-2 bg-black/10" /><p className="text-[11px] leading-5 text-black/45">Keep this window open while the video streams to storage. Large files can take several minutes depending on your upload speed.</p></div>{thumbnailFile && <div className="space-y-2"><div className="flex justify-between text-xs text-black/50"><span>Uploading thumbnail</span><span>{thumbnailProgress}%</span></div><Progress value={thumbnailProgress} className="h-2 bg-black/10" /></div>}</div>}
          <Button onClick={handleUpload} disabled={uploading} className="h-11 w-full rounded-full bg-black text-white hover:bg-black/80">{uploading ? `Uploading ${progress}%` : "Upload video"}<UploadCloud className="ml-2 h-4 w-4" /></Button>
        </CardContent></Card>
        <Card className="rounded-[1.75rem] border-black/10 bg-white/70 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" /> Viewer access codes</CardTitle><p className="fine-print">Only these six-digit codes can unlock the collection.</p></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input value={newCode} onChange={event => setNewCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" maxLength={6} className="rounded-xl border-black/10 bg-white/75 font-mono tracking-[0.25em]" aria-label="New six-digit access code" /><Button size="icon" onClick={() => newCode.length === 6 && addCode.mutate({ code: newCode })} disabled={newCode.length !== 6 || addCode.isPending} className="shrink-0 rounded-xl bg-black text-white" aria-label="Add access code"><Plus className="h-4 w-4" /></Button></div><Separator className="bg-black/10" /><div className="space-y-2">{codesQuery.isLoading ? <p className="flex items-center gap-2 py-4 text-sm text-black/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading access codes…</p> : codesQuery.isError ? <p className="rounded-xl bg-[#f5dfe4]/45 px-4 py-3 text-sm text-black/60">Access codes could not be loaded. Please try again.</p> : (codesQuery.data ?? []).length === 0 ? <p className="py-4 text-sm text-black/45">No viewer codes yet. Add the first one above.</p> : (codesQuery.data ?? []).map(code => <div key={code.id} className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3"><span className="font-mono tracking-[0.25em]">{code.code}</span><Button variant="ghost" size="icon" onClick={() => deleteCode.mutate({ id: code.id })} disabled={deleteCode.isPending} className="rounded-full text-black/45 hover:bg-[#f5dfe4] hover:text-black" aria-label={`Delete access code ${code.code}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div></CardContent></Card>
      </div>
      <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="eyebrow">Current collection</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Uploaded videos</h3></div><Badge variant="outline" className="rounded-full border-black/15 bg-white/50">{videos.length} {videos.length === 1 ? "video" : "videos"}</Badge></div>{videosQuery.isLoading ? <div className="flex items-center gap-2 rounded-[1.5rem] bg-white/45 px-6 py-12 text-sm text-black/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading videos…</div> : videosQuery.isError ? <div className="rounded-[1.5rem] border border-[#f5dfe4] bg-[#f5dfe4]/40 px-6 py-12 text-sm text-black/60">Videos could not be loaded. Please try again.</div> : videos.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center"><Film className="mx-auto h-7 w-7 text-black/30" /><p className="mt-3 text-sm text-black/50">Your uploaded videos will appear here.</p></div> : <div className="grid gap-5 md:grid-cols-2">{videos.map(video => <VideoCard key={video.id} video={video} onEdit={() => openEdit(video)} onDelete={() => { if (window.confirm(`Delete “${video.title}”?`)) deleteVideo.mutate({ id: video.id }); }} deleting={deleteVideo.isPending} />)}</div>}</div>
      {editingVideo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5" role="dialog" aria-modal="true" aria-labelledby="edit-video-title"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] border border-black/10 bg-[#f7f8f9] p-6 shadow-[0_28px_90px_rgba(30,38,48,0.2)] sm:p-8"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="eyebrow">Edit video</p><h3 id="edit-video-title" className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Update details</h3></div><Button variant="ghost" size="icon" onClick={() => setEditingVideo(null)} disabled={savingEdit} className="rounded-full text-black/50" aria-label="Close edit video dialog"><X className="h-5 w-5" /></Button></div><div className="space-y-4"><div className="space-y-2"><Label htmlFor="edit-video-title-input">Video title</Label><Input id="edit-video-title-input" value={editTitle} onChange={event => setEditTitle(event.target.value)} className="rounded-xl border-black/10 bg-white/80" /></div><div className="space-y-2"><Label htmlFor="edit-video-artist">Artist <span className="font-normal text-black/40">(optional)</span></Label><Input id="edit-video-artist" value={editArtist} onChange={event => setEditArtist(event.target.value)} className="rounded-xl border-black/10 bg-white/80" /></div><div className="space-y-2"><Label htmlFor="edit-video-thumbnail">Replace thumbnail <span className="font-normal text-black/40">(optional, image up to 10 MB)</span></Label><Input ref={editThumbnailInputRef} id="edit-video-thumbnail" type="file" accept="image/*" onChange={event => { setEditThumbnailFile(event.target.files?.[0] ?? null); setClearEditThumbnail(false); }} className="rounded-xl border-black/10 bg-white/80 file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1 file:text-xs file:font-medium file:text-white" /></div>{editThumbnailFile && <div className="rounded-xl bg-[#f5dfe4]/45 px-4 py-3 text-sm text-black/65">{editThumbnailFile.name} <span className="text-black/35">· {formatBytes(editThumbnailFile.size)}</span></div>}{editingVideo.thumbnailUrl && <label className="flex items-center gap-3 text-sm text-black/60"><input type="checkbox" checked={clearEditThumbnail} onChange={event => { setClearEditThumbnail(event.target.checked); if (event.target.checked) { setEditThumbnailFile(null); if (editThumbnailInputRef.current) editThumbnailInputRef.current.value = ""; } }} className="h-4 w-4 rounded border-black/20" /> Remove current thumbnail</label>}{savingEdit && editThumbnailFile && <div className="space-y-2"><div className="flex justify-between text-xs text-black/50"><span>Uploading thumbnail</span><span>{editThumbnailProgress}%</span></div><Progress value={editThumbnailProgress} className="h-2 bg-black/10" /></div>}<div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditingVideo(null)} disabled={savingEdit} className="rounded-full border-black/15 bg-white/60">Cancel</Button><Button onClick={handleUpdate} disabled={savingEdit} className="rounded-full bg-black text-white hover:bg-black/80">{savingEdit ? "Saving…" : "Save changes"}</Button></div></div></div></div>}
    </section>
  );
}

function Library({ onAdmin }: { onAdmin: () => void }) {
  const utils = trpc.useUtils();
  const library = trpc.library.list.useQuery(undefined, { retry: false });
  const logout = trpc.access.logoutViewer.useMutation({ onSuccess: () => { utils.access.status.invalidate(); toast.success("Library locked"); } });
  const videos = (library.data ?? []) as VideoRecord[];

  return <main className="relative min-h-screen overflow-hidden px-5 py-7 sm:px-10 sm:py-10"><GeometricAccent position="bottom" /><header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-5"><div><div className="eyebrow"><span className="eyebrow-dot" /> Private collection</div><h1 className="mt-3 text-3xl font-bold tracking-[-0.07em] sm:text-4xl">Jewish Videos<span className="text-[#b7cfe2]">.</span></h1></div><div className="flex items-center gap-2"><Button variant="outline" onClick={onAdmin} className="rounded-full border-black/15 bg-white/50 text-sm"><ShieldCheck className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Admin Panel</span><span className="sm:hidden">Admin</span></Button><Button variant="ghost" size="icon" onClick={() => logout.mutate()} className="rounded-full text-black/45" aria-label="Lock library"><LogOut className="h-4 w-4" /></Button></div></header><section className="relative z-10 mx-auto mt-16 w-full max-w-6xl"><div className="max-w-2xl"><p className="eyebrow">Shared with you</p><h2 className="section-heading mt-3">Watch at your<br /><span className="heading-muted">own pace.</span></h2><p className="mt-5 max-w-lg text-base leading-7 text-black/55">A private collection of videos for your learning, reflection, and connection.</p></div>{library.isLoading ? <div className="mt-12 grid gap-5 md:grid-cols-2"><div className="skeleton-card" /><div className="skeleton-card" /></div> : library.isError ? <div className="mt-12 rounded-[1.5rem] border border-[#f5dfe4] bg-[#f5dfe4]/40 p-6 text-sm text-black/65">This viewer code is no longer active. Lock the library and enter a current code to continue.</div> : videos.length === 0 ? <div className="mt-12 rounded-[1.5rem] border border-dashed border-black/15 bg-white/40 px-6 py-16 text-center"><Film className="mx-auto h-8 w-8 text-black/25" /><p className="mt-4 text-sm text-black/50">Your library is ready. Videos will appear here when they are uploaded.</p></div> : <div className="mt-12 grid gap-6 md:grid-cols-2">{videos.map(video => <LibraryVideoCard key={video.id} video={video} />)}</div>}</section></main>;
}

export default function Home() {
  const status = trpc.access.status.useQuery(undefined, { retry: false });
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  useEffect(() => {
    if (status.data?.admin && status.data?.viewer) setAdminPanelOpen(true);
  }, [status.data?.admin, status.data?.viewer]);

  if (status.isLoading) return <div className="min-h-screen bg-[#eef1f3]" />;
  if (!status.data?.viewer) return <ViewerGate onSuccess={() => status.refetch()} />;
  if (adminPanelOpen && status.data.admin && status.data.viewer) return <div className="min-h-screen bg-[#eef1f3] px-5 py-8 sm:px-10 sm:py-12"><div className="mx-auto max-w-6xl"><div className="mb-8 flex items-center justify-between"><button onClick={() => setAdminPanelOpen(false)} className="rounded-lg text-sm text-black/50 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20">← Back to library</button><div className="eyebrow"><ShieldCheck className="h-4 w-4" /> Jewish Videos</div></div><AdminPanel onClose={() => { setAdminPanelOpen(false); status.refetch(); }} /></div></div>;
  return <><Library onAdmin={() => status.data?.admin ? setAdminPanelOpen(true) : setAdminGateOpen(true)} />{adminGateOpen && <AdminGate onSuccess={() => { setAdminGateOpen(false); status.refetch(); setAdminPanelOpen(true); }} onClose={() => setAdminGateOpen(false)} />}</>;
}
