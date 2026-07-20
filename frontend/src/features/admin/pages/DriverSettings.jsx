import { useState, useEffect, useCallback } from 'react';
import { Star, ShieldAlert, Loader2, Video } from 'lucide-react';
import RatingQuestionsTab from '../components/PlatformSettings/RatingQuestionsTab';
import TrainingVideosTab from '../components/PlatformSettings/TrainingVideosTab';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManagePlatformSettings } from '../../../constants/staffRoles';

const DriverSettings = () => {
  const { admin } = useAdminAuthStore();
  const [platformSettings, setPlatformSettings] = useState(null);
  const [trainingVideos, setTrainingVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('policies');
  const [submitting, setSubmitting] = useState(false);

  const [policyForm, setPolicyForm] = useState({
    noKitPenaltyAmount: 50,
  });

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [res, trainingRes] = await Promise.all([
        api.get('/admin/platform-settings').catch(() => ({ data: { data: null } })),
        api.get('/admin/settings/training-videos').catch(() => ({ data: { data: [] } }))
      ]);
      
      setTrainingVideos(trainingRes.data?.data || []);
      
      if (res.data?.data) {
        setPlatformSettings(res.data.data);
        setPolicyForm({
          noKitPenaltyAmount: res.data.data.noKitPenaltyAmount ?? 50,
        });
      }
    } catch (err) {
      console.error('Failed to fetch platform data', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put('/admin/platform-settings', {
        ...platformSettings,
        noKitPenaltyAmount: policyForm.noKitPenaltyAmount,
      });
      await fetchData({ silent: true });
      alert('Driver policies updated successfully');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update policies');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManagePlatformSettings(admin?.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        You do not have permission to manage platform settings.
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8 animate-fade-in-up pb-10 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Driver Settings & Policies</h2>
          <p className="text-sm text-slate-500 mt-1">Configure policies and ratings specific to drivers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto pb-1 no-scrollbar">
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl w-fit">
          {[
            { id: 'policies', label: 'Driver Kit Policy', icon: ShieldAlert },
            { id: 'ratings', label: 'Driver Rating Questions', icon: Star },
            { id: 'training', label: 'Driver Training', icon: Video },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-yellow-400 text-black shadow-md' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-4.5 h-4.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading settings...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {activeTab === 'policies' && (
            <div className="space-y-6 max-w-2xl">
              <form onSubmit={handlePolicySubmit} className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Driver Kit Policy</h3>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Configure the penalty deducted from a driver's wallet if they take a trip without purchasing a driver kit.</p>
                  <div className="space-y-4">
                    <Input
                      label="No Kit Penalty Amount (₹)"
                      type="number"
                      min="0"
                      value={policyForm.noKitPenaltyAmount}
                      onChange={(e) => setPolicyForm({ ...policyForm, noKitPenaltyAmount: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Saving...' : 'Save Policies'}
                </Button>
              </form>
            </div>
          )}

          {activeTab === 'ratings' && (
            <RatingQuestionsTab 
              platformSettings={platformSettings}
              fetchData={fetchData}
              isDriverTab={true}
            />
          )}

          {activeTab === 'training' && (
            <TrainingVideosTab
              videos={trainingVideos}
              onRefresh={() => fetchData({ silent: true })}
              onCreate={(payload) => api.post('/admin/settings/training-videos', payload)}
              onUpdate={(id, payload) => api.put(`/admin/settings/training-videos/${id}`, payload)}
              onDelete={async (id) => {
                if (!window.confirm('Delete this training video?')) return;
                await api.delete(`/admin/settings/training-videos/${id}`);
                await fetchData({ silent: true });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default DriverSettings;
