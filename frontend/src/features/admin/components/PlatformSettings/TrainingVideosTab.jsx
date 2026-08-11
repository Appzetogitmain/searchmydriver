import { useState } from 'react';
import { Plus, Edit2, Trash2, Video, Upload, Link as LinkIcon } from 'lucide-react';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Toggle from '../../../../components/Toggle';
import Modal from '../../../../components/Modal';
import { useVideoUpload } from '../../../../hooks/useVideoUpload';

const YoutubeIcon = ({ className = 'w-5 h-5', ...props }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

function extractYouTubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

const emptyForm = {
  title: '',
  description: '',
  videoType: 'youtube', // 'youtube' | 'upload'
  youtubeUrl: '',
  videoUrl: '',
  cloudinaryPublicId: '',
  durationSeconds: 60,
  isRequired: true,
  isActive: true,
  sortOrder: 0,
};

const TrainingVideosTab = ({ videos, onRefresh, onCreate, onUpdate, onDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const { uploadVideo, uploading, error: uploadError } = useVideoUpload();

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (video) => {
    setEditing(video);
    const isYt = video.videoType === 'youtube' || Boolean(extractYouTubeId(video.videoUrl));
    setForm({
      title: video.title,
      description: video.description || '',
      videoType: isYt ? 'youtube' : 'upload',
      youtubeUrl: isYt ? video.videoUrl : '',
      videoUrl: video.videoUrl,
      cloudinaryPublicId: video.cloudinaryPublicId || '',
      durationSeconds: video.durationSeconds || 0,
      isRequired: video.isRequired,
      isActive: video.isActive,
      sortOrder: video.sortOrder || 0,
    });
    setShowModal(true);
  };

  const handleVideoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadVideo(file, editing?.cloudinaryPublicId || '');
    if (result) {
      setForm((prev) => ({
        ...prev,
        videoType: 'upload',
        videoUrl: result.url,
        cloudinaryPublicId: result.publicId,
        durationSeconds: result.durationSeconds || prev.durationSeconds,
      }));
    }
  };

  const handleYouTubeUrlChange = (e) => {
    const inputUrl = e.target.value;
    const ytId = extractYouTubeId(inputUrl);
    const finalEmbedUrl = ytId ? `https://www.youtube.com/embed/${ytId}` : inputUrl;
    setForm((prev) => ({
      ...prev,
      videoType: 'youtube',
      youtubeUrl: inputUrl,
      videoUrl: finalEmbedUrl,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.videoType === 'youtube') {
      const ytId = extractYouTubeId(form.youtubeUrl || form.videoUrl);
      if (!ytId && !form.videoUrl) {
        alert('Please enter a valid YouTube video URL');
        return;
      }
    } else {
      if (!form.videoUrl) {
        alert('Please upload a video file');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        videoType: form.videoType,
        videoUrl: form.videoUrl,
        cloudinaryPublicId: form.videoType === 'upload' ? form.cloudinaryPublicId : '',
        durationSeconds: Number(form.durationSeconds) || 0,
        isRequired: form.isRequired,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      };

      if (editing) {
        await onUpdate(editing._id, payload);
      } else {
        await onCreate(payload);
      }
      setShowModal(false);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const currentYtId = extractYouTubeId(form.youtubeUrl || form.videoUrl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Driver training videos</h3>
          <p className="text-sm text-slate-500 mt-1">Required videos drivers must complete before submission</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add video
        </Button>
      </div>

      <div className="space-y-3">
        {videos.map((video) => {
          const isYt = video.videoType === 'youtube' || Boolean(extractYouTubeId(video.videoUrl));
          return (
            <div key={video._id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isYt ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {isYt ? <YoutubeIcon className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{video.title}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      isYt ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {isYt ? 'YouTube' : 'Uploaded File'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {Math.round(video.durationSeconds || 0)} sec {video.isRequired ? '· Required' : ''}
                  </p>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(video)} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors" title="Edit video">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => onDelete(video._id)} className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors" title="Delete video">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit training video' : 'New training video'}>
        <form onSubmit={handleSubmit} className="space-y-4 p-2">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Driver Onboarding & Safety Rules" required />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description of the training module" />

          {/* Video Source Switcher */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
              Video Type / Source
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, videoType: 'youtube' }))}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  form.videoType === 'youtube'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <YoutubeIcon className="w-4 h-4" />
                YouTube Link
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, videoType: 'upload' }))}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  form.videoType === 'upload'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload File
              </button>
            </div>
          </div>

          {/* YouTube Link Mode */}
          {form.videoType === 'youtube' && (
            <div className="space-y-3">
              <Input
                label="YouTube Video Link"
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={form.youtubeUrl || form.videoUrl}
                onChange={handleYouTubeUrlChange}
                required
              />

              {currentYtId ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <LinkIcon className="w-3.5 h-3.5" /> YouTube Video Detected (ID: {currentYtId})
                  </p>
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-200">
                    <iframe
                      src={`https://www.youtube.com/embed/${currentYtId}`}
                      title="YouTube preview"
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Paste any YouTube watch link, shorts link, or share link.
                </p>
              )}
            </div>
          )}

          {/* Upload File Mode */}
          {form.videoType === 'upload' && (
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">
                  {uploading ? 'Uploading video file...' : 'Upload video (MP4, WEBM, MOV)'}
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={handleVideoFile}
                  disabled={uploading}
                />
              </label>
              {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
              {form.videoUrl && form.videoType === 'upload' && (
                <p className="text-xs text-emerald-600 truncate font-medium">✓ Video file uploaded</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Duration (Seconds)"
              type="number"
              min="1"
              value={form.durationSeconds}
              onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })}
              required
            />
            <Input
              label="Sort order"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Required for drivers</span>
              <Toggle checked={form.isRequired} onChange={(v) => setForm({ ...form, isRequired: v })} />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Active</span>
              <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button fullWidth type="submit" loading={submitting || uploading}>
              {editing ? 'Update Video' : 'Create Video'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TrainingVideosTab;
