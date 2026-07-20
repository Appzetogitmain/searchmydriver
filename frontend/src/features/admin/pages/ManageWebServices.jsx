import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Layout,
  X,
  Minus,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Drawer from '../../../components/Drawer';
import api from '../../../utils/api';
import ConfirmDialog from '../../../components/ConfirmDialog';

const ManageWebServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/web-services/admin');
      setServices(res?.data?.data || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load website services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleNew = () => {
    setEditingService(null);
    setShowForm(true);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingService(null);
    fetchServices();
  };

  const handleDelete = async () => {
    if (!confirmDelete?._id) return;
    setDeleting(true);
    try {
      await api.delete(`/web-services/admin/${confirmDelete._id}`);
      toast.success('Service deleted successfully');
      setConfirmDelete(null);
      fetchServices();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete service');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Manage Web Services</h2>
          <p className="text-sm text-slate-500 font-medium">
            Publish and manage services shown on the public Services page.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={fetchServices} variant="outline" className="p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleNew} className="rounded-xl font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Service
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {loading && services.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Layout className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Services Published</h3>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              Click "Add Service" to publish your first service offering.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {services.map((service) => (
            <Card key={service._id} className="border-slate-200 p-5 flex flex-col md:items-start justify-between gap-4">
              <div className="space-y-2 flex-1 w-full">
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        service.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {service.isActive ? 'Active' : 'Draft'}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">Sort Order: {service.sortOrder}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(service)}
                      className="p-2 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(service)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                   {service.title} <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">Icon: {service.iconName}</span>
                </h3>
                <p className="text-xs font-bold text-slate-400">{service.subtitle}</p>
                <p className="text-sm text-slate-600 font-medium pl-3 border-l-2 border-slate-200 mt-2">{service.description}</p>
                
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Features ({service.features?.length || 0})</p>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                    {service.features?.slice(0,3).map((f, i) => (
                      <li key={i} className="truncate">{f}</li>
                    ))}
                    {service.features?.length > 3 && <li className="text-slate-400 italic">...and {service.features.length - 3} more</li>}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ServiceFormDrawer
          service={editingService}
          onClose={() => {
            setShowForm(false);
            setEditingService(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Service"
        description="Are you sure you want to delete this service? It will be removed from the public website."
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
        loading={deleting}
      />
      )}
    </div>
  );
};

const ServiceFormDrawer = ({ service, onClose, onSaved }) => {
  const isEdit = !!service;
  const [title, setTitle] = useState(service?.title || '');
  const [subtitle, setSubtitle] = useState(service?.subtitle || '');
  const [description, setDescription] = useState(service?.description || '');
  const [iconName, setIconName] = useState(service?.iconName || 'Clock');
  const [features, setFeatures] = useState(service?.features || []);
  const [sortOrder, setSortOrder] = useState(service?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const [newFeature, setNewFeature] = useState('');

  const addFeature = () => {
    if (newFeature.trim()) {
      setFeatures([...features, newFeature.trim()]);
      setNewFeature('');
    }
  };

  const removeFeature = (idx) => {
    setFeatures(features.filter((_, i) => i !== idx));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !subtitle.trim() || !description.trim() || !iconName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      description: description.trim(),
      iconName: iconName.trim(),
      features,
      sortOrder: Number(sortOrder),
      isActive,
    };

    try {
      if (isEdit) {
        await api.put(`/web-services/admin/${service._id}`, payload);
        toast.success('Service updated successfully');
      } else {
        await api.post('/web-services/admin', payload);
        toast.success('Service created successfully');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const drawerHeader = (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {isEdit ? 'Edit Service' : 'New Service'}
        </p>
        <h2 className="text-base font-bold text-slate-900 truncate font-sans">
          {isEdit ? 'Edit Service Offering' : 'Add Service Offering'}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-slate-100"
        aria-label="Close"
      >
        <X className="w-5 h-5 text-slate-600" />
      </button>
    </div>
  );

  const drawerFooter = (
    <div className="px-5 py-3 flex gap-3">
      <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        fullWidth
        loading={saving}
        onClick={handleSave}
      >
        {isEdit ? 'Save Changes' : 'Publish Service'}
      </Button>
    </div>
  );

  return (
    <Drawer isOpen onClose={onClose} header={drawerHeader} footer={drawerFooter} width="max-w-xl">
      <form onSubmit={handleSave} className="p-5 space-y-5">
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Service Title
            </p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hourly Driver Booking"
              required
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Lucide Icon Name
            </p>
            <Input
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="e.g. Clock, Compass"
              required
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Subtitle (Short Description)
          </p>
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. Flexible short-term hiring starting from 4-hour slabs"
            required
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Detailed Description
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Write the detailed description here..."
            className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-medium text-slate-700"
            required
          />
        </div>
        
        <hr className="border-slate-100" />

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Features (Bullet Points)
          </p>
          <div className="space-y-2 mb-3">
            {features.map((feat, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 pl-3">
                <span className="flex-1 text-sm text-slate-700 truncate">{feat}</span>
                <button type="button" onClick={() => removeFeature(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded-lg">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input 
              value={newFeature} 
              onChange={(e) => setNewFeature(e.target.value)} 
              placeholder="Add a new feature..."
              onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
            />
            <Button type="button" onClick={addFeature} variant="outline" className="px-4">
              Add
            </Button>
          </div>
        </div>
        
        <hr className="border-slate-100" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Sort order
            </p>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Visibility
            </p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-700 font-medium">
                Show on website
              </span>
            </label>
          </div>
        </div>
      </form>
    </Drawer>
  );
};

export default ManageWebServices;
