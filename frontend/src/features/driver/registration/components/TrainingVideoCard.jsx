import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, PlayCircle } from 'lucide-react';
import Button from '../../../../components/Button';

function extractYouTubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

const TrainingVideoCard = ({ video, active, onProgress, saving, onSelect }) => {
  const videoRef = useRef(null);
  const lastSentRef = useRef(0);
  const [localWatched, setLocalWatched] = useState(video.watchedSeconds || 0);

  const ytId = video.youtubeId || extractYouTubeId(video.videoUrl);
  const isYouTube = video.videoType === 'youtube' || Boolean(ytId);

  useEffect(() => {
    setLocalWatched(video.watchedSeconds || 0);
  }, [video.watchedSeconds, video._id]);

  useEffect(() => {
    if (!active || !videoRef.current || isYouTube) return;
    if (localWatched > 0 && localWatched < (video.durationSeconds || 0)) {
      videoRef.current.currentTime = localWatched;
    }
  }, [active, video._id, isYouTube]);

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || video.completed || isYouTube) return;

    const seconds = Math.floor(el.currentTime);
    setLocalWatched(seconds);

    if (seconds - lastSentRef.current < 3) return;
    lastSentRef.current = seconds;
    onProgress({ watchedSeconds: seconds, completed: false });
  };

  const handleEnded = () => {
    const duration = video.durationSeconds || Math.floor(videoRef.current?.currentTime || 0);
    onProgress({ watchedSeconds: duration, completed: true });
  };

  const handleMarkCompleted = (e) => {
    e.stopPropagation();
    const duration = video.durationSeconds || 60;
    onProgress({ watchedSeconds: duration, completed: true });
  };

  const progressPct = video.durationSeconds
    ? Math.min(100, Math.round((localWatched / video.durationSeconds) * 100))
    : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
      className={`rounded-2xl border-2 p-4 transition-all cursor-pointer ${
        video.completed
          ? 'border-emerald-500 bg-emerald-50/50'
          : active
            ? 'border-primary bg-white shadow-md'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 text-sm">{video.title}</h3>
            {video.isRequired && (
              <span className="text-[10px] font-bold uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                Required
              </span>
            )}
            {isYouTube && (
              <span className="text-[10px] font-bold uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                YouTube
              </span>
            )}
          </div>
          {video.description && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{video.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
          {video.completed ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          ) : (
            <Circle className="w-6 h-6 text-slate-300" />
          )}
        </div>
      </div>

      {active && (
        <div className="mt-2 space-y-3" onClick={(e) => e.stopPropagation()}>
          {isYouTube && ytId ? (
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-inner">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1`}
                title={video.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <video
              ref={videoRef}
              src={video.videoUrl}
              controls
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              className="w-full rounded-xl bg-black max-h-64"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
            />
          )}

          {!video.completed && (
            <div className="pt-1 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkCompleted}
                disabled={saving}
                className="text-xs flex items-center gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark as Watched
              </Button>
            </div>
          )}
        </div>
      )}

      {!video.completed && video.durationSeconds > 0 && !isYouTube && (
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );
};

export default TrainingVideoCard;
