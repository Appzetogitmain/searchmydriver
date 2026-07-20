import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Headset,
  X,
  Phone,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Drawer from '../../../components/Drawer';
import api from '../../../utils/api';
import ConfirmDialog from '../../../components/ConfirmDialog';

const ManageHelplines = () => {
  const [helplines, setHelplines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingHelpline, setEditingHelpline] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHelplines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/helplines');
      setHelplines(res?.data?.data || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load helpline numbers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHelplines();
  }, [fetchHelplines]);

  const handleNew = () => {
    setEditingHelpline(null);
    setShowForm(true);
  };

  const handleEdit = (helpline) => {
    setEditingHelpline(helpline);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingHelpline(null);
    fetchHelplines();
  };

  const handleDelete = async () => {
    if (!confirmDelete?._id) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/helplines/${confirmDelete._id}`);
      toast.success('Helpline deleted successfully');
      setConfirmDelete(null);
      fetchHelplines();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete helpline');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Manage Helpline Numbers</h2>
          <p className="text-sm text-slate-500 font-medium">
            Configure dynamic emergency and support helpline contact numbers that are visible to drivers and users in the Help Desk modal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={fetchHelplines} variant="outline" className="p-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleNew} className="rounded-xl font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Helpline
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {loading && helplines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-slate-500 font-medium text-sm">Loading helplines...</p>
        </div>
      ) : helplines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 text-center px-4">
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-100">
            <Headset className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 mb-1">No Helpline Numbers Defined</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            Helpline numbers mapped to cities appear in the emergency section of the help desk modal. Add your first helpline.
          </p>
          <Button onClick={handleNew} className="font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Helpline
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {helplines.map((helpline) => (
            <Card key={helpline._id} className="relative overflow-hidden group border border-slate-200 hover:border-primary/30 transition-all duration-200 hover:shadow-md">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors">
                      {helpline.cityName}
                    </h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                      {helpline.description || 'Emergency Support'}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                    helpline.isActive 
                      ? 'bg-emerald-55 border border-emerald-100 text-emerald-700' 
                      : 'bg-slate-50 border border-slate-200 text-slate-400'
                  }`}>
                    {helpline.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <a href={`tel:${helpline.contactNumber}`} className="text-slate-700 font-bold hover:text-primary transition-colors">
                    {helpline.contactNumber}
                  </a>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400 font-medium">
                    Order: {helpline.sortOrder}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(helpline)}
                      className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(helpline)}
                      className="p-2 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Form Drawer */}
      <Drawer
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingHelpline ? 'Edit Helpline Number' : 'Add Helpline Number'}
      >
        <HelplineForm
          helpline={editingHelpline}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete Helpline Number"
        message={`Are you sure you want to delete the helpline number for "${confirmDelete?.cityName}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={deleting}
      />
    </div>
  );
};

const HelplineForm = ({ helpline, onSaved, onCancel }) => {
  const [cityName, setCityName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (helpline) {
      setCityName(helpline.cityName || '');
      setContactNumber(helpline.contactNumber || '');
      setDescription(helpline.description || '');
      setSortOrder(String(helpline.sortOrder ?? 0));
      setIsActive(helpline.isActive !== false);
    } else {
      setCityName('');
      setContactNumber('');
      setDescription('');
      setSortOrder('0');
      setIsActive(true);
    }
  }, [helpline]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cityName.trim() || !contactNumber.trim()) {
      toast.error('City name and contact number are required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        cityName: cityName.trim(),
        contactNumber: contactNumber.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };

      if (helpline?._id) {
        await api.put(`/admin/helplines/${helpline._id}`, payload);
        toast.success('Helpline updated successfully');
      } else {
        await api.post('/admin/helplines', payload);
        toast.success('Helpline added successfully');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save helpline');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="space-y-4">
        <Input
          label="City Name"
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          placeholder="e.g. Mumbai, New Delhi"
          required
        />

        <Input
          label="Contact Number"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="e.g. +91 9999999999, 022-28282828"
          required
        />

        <Input
          label="Description / Label"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Emergency Support, Admin Hotline"
        />

        <Input
          label="Sort Order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="0"
        />

        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-slate-800">Active Status</span>
            <p className="text-xs text-slate-500 font-medium">Inactive helplines are hidden from the Help Desk.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
              isActive ? 'bg-primary' : 'bg-slate-300'
            }`}
          >
            <span className={`block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              isActive ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          loading={submitting}
        >
          Save Helpline
        </Button>
      </div>
    </form>
  );
};

export default ManageHelplines;
