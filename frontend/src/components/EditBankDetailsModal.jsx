import React, { useState, useEffect } from 'react';
import { Building2, CreditCard, Hash, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EditBankDetailsModal = ({ isOpen, onClose, initialData, onSave, isDriver = false }) => {
  const [formData, setFormData] = useState({
    accountHolderName: initialData?.accountHolderName || '',
    accountNumber: initialData?.accountNumber || '',
    ifscCode: initialData?.ifscCode || '',
    bankName: initialData?.bankName || '',
    upiId: initialData?.upiId || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        accountHolderName: initialData?.accountHolderName || '',
        accountNumber: initialData?.accountNumber || '',
        ifscCode: initialData?.ifscCode || '',
        bankName: initialData?.bankName || '',
        upiId: initialData?.upiId || '',
      });
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.accountHolderName || !formData.accountNumber || !formData.ifscCode || !formData.bankName) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setSaving(true);
    try {
      const endpoint = isDriver ? '/driver/wallet/bank-details' : '/auth/wallet/bank-details';
      const { data } = await api.post(endpoint, formData);
      toast.success(data.message || 'Bank details updated');
      onSave(data.data.bankDetails);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update bank details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-bold text-text">Edit Bank Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-border-light flex items-center justify-center text-text-muted hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Account Holder Name *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Building2 className="w-4 h-4 text-text-muted" />
              </div>
              <input
                type="text"
                value={formData.accountHolderName}
                onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border-light rounded-xl text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="Name as per bank"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Bank Name *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Building2 className="w-4 h-4 text-text-muted" />
              </div>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border-light rounded-xl text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="e.g. HDFC Bank"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Account Number *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <CreditCard className="w-4 h-4 text-text-muted" />
              </div>
              <input
                type="text"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '') })}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border-light rounded-xl text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                placeholder="Account Number"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">IFSC Code *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Hash className="w-4 h-4 text-text-muted" />
              </div>
              <input
                type="text"
                value={formData.ifscCode}
                onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border-light rounded-xl text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                placeholder="e.g. HDFC0001234"
                maxLength={11}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">UPI ID (Optional)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Wallet className="w-4 h-4 text-text-muted" />
              </div>
              <input
                type="text"
                value={formData.upiId}
                onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border-light rounded-xl text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="e.g. name@bank"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold shadow-btn hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Bank Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditBankDetailsModal;
