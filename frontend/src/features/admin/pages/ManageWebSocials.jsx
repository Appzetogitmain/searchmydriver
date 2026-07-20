import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, X, Globe, Settings, Check } from 'lucide-react';
import api from '../../../utils/api';

const Facebook = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const Twitter = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);
const Instagram = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
const Linkedin = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);
const Youtube = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
  </svg>
);
const Github = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const ICON_MAP = {
  facebook: Facebook,
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
  github: Github,
  globe: Globe,
};

const ICON_OPTIONS = [
  { value: 'facebook', label: 'Facebook', Icon: Facebook },
  { value: 'twitter', label: 'Twitter/X', Icon: Twitter },
  { value: 'instagram', label: 'Instagram', Icon: Instagram },
  { value: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { value: 'youtube', label: 'YouTube', Icon: Youtube },
  { value: 'github', label: 'GitHub', Icon: Github },
  { value: 'globe', label: 'Website', Icon: Globe },
];

const ConfirmModal = ({ open, title, message, confirmLabel = 'Confirm', onConfirm, onClose, loading }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 z-10">
        <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 font-medium mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const SocialFormPanel = ({ social, onClose, onSaved }) => {
  const isEdit = !!social?._id;
  const [platform, setPlatform] = useState(social?.platform || '');
  const [url, setUrl] = useState(social?.url || '');
  const [icon, setIcon] = useState(social?.icon || 'facebook');
  const [sortOrder, setSortOrder] = useState(social?.sortOrder !== undefined ? social.sortOrder : 0);
  const [isActive, setIsActive] = useState(social?.isActive !== false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedPlatform = platform.trim();
    const trimmedUrl = url.trim();
    if (!trimmedPlatform) { toast.error('Platform name is required'); return; }
    if (!trimmedUrl) { toast.error('Redirect URL is required'); return; }
    setSaving(true);
    try {
      const payload = { platform: trimmedPlatform, url: trimmedUrl, icon, sortOrder: Number(sortOrder), isActive };
      if (isEdit) {
        await api.put('/web-socials/admin/' + social._id, payload);
        toast.success('Social link updated!');
      } else {
        await api.post('/web-socials/admin', payload);
        toast.success('Social link created!');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-[480px] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col" style={{animation:'slideInRight 0.25s ease'}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Social Link' : 'Add Social Link'}</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{isEdit ? 'Update the details below' : 'Fill in the details below'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="social-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Platform Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. Facebook, Instagram, Twitter/X"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Redirect URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://facebook.com/your-page"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Select Icon</label>
            <div className="grid grid-cols-4 gap-2">
              {ICON_OPTIONS.map(({ value, label, Icon }) => (
                <button key={value} type="button" onClick={() => setIcon(value)} title={label}
                  className={"flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer " + (icon === value ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-bold leading-none">{label.split('/')[0].trim()}</span>
                  {icon === value && <Check className="w-3 h-3 text-amber-500" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Display Order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} min="0"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all bg-white" />
            <p className="text-[11px] text-slate-400 font-medium mt-1">Lower numbers appear first.</p>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-800">Show in footer</p>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Disabled links won't appear on the public website.</p>
            </div>
            <button type="button" onClick={() => setIsActive((v) => !v)}
              className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer " + (isActive ? 'bg-emerald-500' : 'bg-slate-300')}>
              <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (isActive ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </div>
        </form>

        <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-white flex gap-3">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer">
            Cancel
          </button>
          <button type="submit" form="social-form" disabled={saving}
            className="flex-1 h-11 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
            {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving</>) : (isEdit ? 'Update Link' : 'Save Link')}
          </button>
        </div>
      </aside>
    </div>
  );
};

const ManageWebSocials = () => {
  const [socials, setSocials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingSocial, setEditingSocial] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSocials = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/web-socials/admin');
      setSocials(res?.data?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to load social links';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSocials(); }, [fetchSocials]);

  const openNew = () => { setEditingSocial(null); setShowForm(true); };
  const openEdit = (s) => { setEditingSocial(s); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingSocial(null); };
  const handleSaved = () => { closeForm(); fetchSocials(); };

  const handleDelete = async () => {
    if (!confirmDelete?._id) return;
    setDeleting(true);
    try {
      await api.delete('/web-socials/admin/' + confirmDelete._id);
      toast.success('Social link deleted');
      setConfirmDelete(null);
      fetchSocials();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete social link');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manage Website Social Links</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Configure social media profiles shown in the landing page footer.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchSocials} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer">
            <RefreshCw className={"w-4 h-4 " + (loading ? 'animate-spin' : '')} />
          </button>
          <button onClick={openNew} className="h-10 px-4 bg-amber-400 hover:bg-amber-500 text-slate-900 text-sm font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-sm">
            <Plus className="w-4 h-4" /> Add Social Link
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold">{error}</div>}

      {loading && socials.length === 0 ? (
        <div className="flex justify-center items-center py-24"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : socials.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
            <Settings className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-800 text-base mb-1">No Social Links Configured</h3>
          <p className="text-sm text-slate-400 font-medium max-w-sm mb-6">Add social profiles so customers can connect with you from the landing page footer.</p>
          <button onClick={openNew} className="h-11 px-6 bg-amber-400 hover:bg-amber-500 text-slate-900 text-sm font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Add First Social Link
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {socials.map((s) => {
            const IconComponent = ICON_MAP[s.icon] || Globe;
            return (
              <div key={s._id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="p-3 bg-slate-50 rounded-xl text-slate-600 border border-slate-100 shrink-0">
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{s.platform}</h4>
                    <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {s.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:text-amber-700 truncate block mb-3 transition-colors">
                    {s.url}
                  </a>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Order: {s.sortOrder}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} title="Edit" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-all cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(s)} title="Delete" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <SocialFormPanel social={editingSocial} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Social Link?"
        message={"Are you sure you want to remove the link for " + (confirmDelete?.platform || '') + "? This cannot be undone."}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
        loading={deleting}
      />
    </div>
  );
};

export default ManageWebSocials;
