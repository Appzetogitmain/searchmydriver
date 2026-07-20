import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Mail, Phone, User, Users, Copy, CheckCircle, AlertCircle, Edit2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Badge from '../../../../components/Badge';
import Button from '../../../../components/Button';
import Modal from '../../../../components/Modal';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { useUserProfileStore } from '../../../../store/user/useUserProfileStore';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { formatDate } from '../../../../utils/formatters';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';

const UserProfilePage = () => {
  const navigate = useNavigate();
  const authUser = useUserAuthStore((s) => s.user);
  const setAuth = useUserAuthStore((s) => s.setAuth);
  const profileKey = buildCacheKey('user-profile', { userId: authUser?._id || '' });
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ 
    name: '',
    email: '',
    gender: '', 
    dateOfBirth: '',
    profilePicture: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { data: profile, loading, error, refetch } = useCachedQuery(
    useUserProfileStore,
    profileKey,
    { userId: authUser?._id || '' },
  );

  useEffect(() => {
    if (authUser?._id) {
      refetch().catch((err) => {
        console.error('Failed to fetch profile:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?._id]);

  useEffect(() => {
    if (!profile?.user) return;
    setAuth(profile.user);
  }, [profile?.user, setAuth]);

  const user = profile?.user || authUser || {};
  const displayEmail = user?.email && !user.email.endsWith('@phone.searchmydriver.local') ? user.email : 'No email added';

  const handleCopyReferralCode = () => {
    if (user?.referralCode) {
      navigator.clipboard.writeText(user.referralCode);
      toast.success('Referral code copied!');
    }
  };

  const handleOpenEdit = () => {
    setEditForm({
      name: user?.name || '',
      email: user?.email && !user.email.endsWith('@phone.searchmydriver.local') ? user.email : '',
      gender: user?.gender || '',
      dateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
      profilePicture: user?.profilePicture || ''
    });
    setIsEditModalOpen(true);
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const { uploadImage } = await import('../../../../utils/upload');
      const { url } = await uploadImage(file);
      setEditForm(prev => ({ ...prev, profilePicture: url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Image upload failed');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await api.put('/auth/profile', {
        name: editForm.name || undefined,
        email: editForm.email || undefined,
        gender: editForm.gender || null,
        dateOfBirth: editForm.dateOfBirth || null,
        profilePicture: editForm.profilePicture || ''
      });
      toast.success('Profile updated successfully');
      setIsEditModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <ScreenFrame title="My Profile" onBack={() => navigate('/user/account')}>
        <Card className="p-6 text-center text-text-secondary">
          <div className="animate-pulse">Loading profile...</div>
        </Card>
      </ScreenFrame>
    );
  }

  if (error && !profile) {
    return (
      <ScreenFrame title="My Profile" onBack={() => navigate('/user/account')}>
        <Card className="p-4 flex items-start gap-3 text-sm text-rose-700 bg-rose-50 border border-rose-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load profile</p>
            <p className="text-xs mt-1">{error}</p>
            <button 
              onClick={() => refetch()}
              className="mt-2 px-3 py-1 bg-rose-700 text-white rounded-lg text-xs hover:bg-rose-800 transition"
            >
              Retry
            </button>
          </div>
        </Card>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame title="My Profile" onBack={() => navigate('/user/account')}>
      <Card className="p-4 space-y-4 relative">
        <button onClick={handleOpenEdit} className="absolute top-4 right-4 p-2 text-text-muted hover:text-primary transition-colors bg-bg/50 rounded-full">
          <Edit2 className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0 overflow-hidden relative">
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (user?.name || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h1 className="text-lg font-bold text-text truncate">{user?.name || 'Customer'}</h1>
              <Badge variant={user?.isPhoneVerified ? 'success' : 'warning'}>
                {user?.isPhoneVerified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>
            <p className="text-sm text-text-muted truncate">{displayEmail}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Phone</p>
        <div className="flex items-center gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
          <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0">
            <Phone className="w-4 h-4 text-text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text truncate">{formatPhoneNumber(user?.phone_no)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Email</p>
        <div className="flex items-center gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
          <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text truncate">{displayEmail}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Profile</p>
          <button onClick={handleOpenEdit} className="p-1 text-text-muted hover:text-primary transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-start gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
            <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-text-muted">Gender</p>
              <p className="text-sm font-semibold text-text break-words">{user?.gender || 'Not set'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
            <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
              <Calendar className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-text-muted">Date of birth</p>
              <p className="text-sm font-semibold text-text break-words">{user?.dateOfBirth ? formatDate(user.dateOfBirth) : 'Not set'}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Referral Code</p>
        <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-white px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">Your Code</p>
            <p className="text-sm font-mono font-semibold text-text">{user?.referralCode || 'Not generated'}</p>
          </div>
          {user?.referralCode && (
            <button
              onClick={handleCopyReferralCode}
              className="p-2 hover:bg-bg rounded-lg transition text-text-muted hover:text-primary"
              title="Copy referral code"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Cars linked</p>
        {Array.isArray(profile?.cars) && profile.cars.length > 0 ? (
          <div className="space-y-2">
            {profile.cars.map((car) => (
              <div key={car._id} className="rounded-2xl border border-border-light bg-white px-3 py-3">
                <p className="text-sm font-semibold text-text">{formatCar(car)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No cars added yet.</p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">Checklist</p>
        {Array.isArray(profile?.checklist) && profile.checklist.length > 0 ? (
          <div className="space-y-2">
            {profile.checklist.map((item) => (
              <div key={item._id} className="flex items-center justify-between gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{item.question}</p>
                  <p className="text-xs text-text-muted">{item.isRequired ? 'Required' : 'Optional'}</p>
                </div>
                <span className={`text-xs font-semibold ${item.value === true ? 'text-success' : item.value === false ? 'text-rose-600' : 'text-amber-600'}`}>
                  {item.value === true ? 'Accepted' : item.value === false ? 'Declined' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No checklist items found.</p>
        )}
      </Card>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Profile"
      >
        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-20 h-20 rounded-2xl bg-bg border border-border-light flex items-center justify-center overflow-hidden shrink-0 group">
              {editForm.profilePicture ? (
                <img src={editForm.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-text-secondary" />
              )}
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Edit2 className="w-5 h-5 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e.target.files?.[0])} disabled={isUploadingImage} />
              </label>
            </div>
            {isUploadingImage && <p className="text-xs text-primary animate-pulse">Uploading...</p>}
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Tap to change photo</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-bg border border-border-light rounded-xl text-sm outline-none focus:border-primary transition-colors"
              value={editForm.name}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Your full name"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 bg-bg border border-border-light rounded-xl text-sm outline-none focus:border-primary transition-colors"
              value={editForm.email}
              onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Your email address"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Gender</label>
            <select
              className="w-full px-3 py-2 bg-bg border border-border-light rounded-xl text-sm outline-none focus:border-primary transition-colors"
              value={editForm.gender}
              onChange={(e) => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Date of Birth</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-bg border border-border-light rounded-xl text-sm outline-none focus:border-primary transition-colors"
              value={editForm.dateOfBirth}
              onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <Button fullWidth onClick={handleSaveProfile} isLoading={isSaving || isUploadingImage} className="mt-2" disabled={isUploadingImage}>
            Save Changes
          </Button>
        </div>
      </Modal>
    </ScreenFrame>
  );
};

function ScreenFrame({ title, onBack, body, children }) {
  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">{title}</h1>
            <p className="text-xs text-text-muted">Live profile data</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">{body || children}</div>
    </div>
  );
}

function InfoCard({ title, rows }) {
  return (
    <Card className="p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">{title}</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 rounded-2xl border border-border-light bg-white px-3 py-3">
            <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
              <row.icon className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-text-muted">{row.label}</p>
              <p className="text-sm font-semibold text-text break-words">{row.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatCar(car) {
  const parts = [car.carTypeId?.name, car.brandId?.name, car.modelId?.name, car.modelName, car.fuelTypeId?.name, car.vehicleNumber].filter(Boolean);
  return parts.join(' ◆ ') || 'Car';
}

function formatPhoneNumber(phone) {
  if (!phone) return 'Not added';
  // If already has +91, return as is
  if (phone.startsWith('+91')) return phone;
  // If 10 digits, add +91
  if (phone.length === 10) return `+91 ${phone}`;
  // Otherwise return as is
  return phone;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'No email';
  // Don't mask, show full email as per screenshot
  return email;
}

export default UserProfilePage;
