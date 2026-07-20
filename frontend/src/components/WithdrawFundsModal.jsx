import React, { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const WithdrawFundsModal = ({ isOpen, onClose, maxAmount, isDriver = false, onWithdrawSuccess, bankDetails }) => {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const withdrawAmount = Number(amount);
    
    if (!withdrawAmount || withdrawAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > maxAmount) {
      toast.error(`Maximum withdrawal amount is \u20B9${maxAmount}`);
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = isDriver ? '/driver/wallet/withdraw' : '/auth/wallet/withdraw';
      await api.post(endpoint, {
        amount: withdrawAmount,
        payoutMethod: 'bank',
        payoutDetails: bankDetails?.accountNumber
          ? `${bankDetails.bankName || 'Bank'} (****${bankDetails.accountNumber.slice(-4)})`
          : 'Primary Bank Account'
      });
      
      toast.success('Withdrawal request submitted');
      onWithdrawSuccess();
      onClose();
      setAmount('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-bold text-text">Withdraw Funds</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-border-light flex items-center justify-center text-text-muted hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center justify-between bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-200 text-sm">
            <span className="font-semibold">Available to withdraw:</span>
            <span className="font-bold">₹{maxAmount.toLocaleString('en-IN')}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Enter Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-text-muted">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-border-light rounded-xl text-lg font-bold focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="0"
                min="1"
                max={maxAmount}
                step="1"
                required
              />
            </div>
          </div>

          <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-border-light">
            <Building2 className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-text">Bank Transfer</p>
              <p className="text-text-secondary text-xs mt-0.5">Funds will be sent to your verified bank account.</p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || Number(amount) > maxAmount || Number(amount) <= 0}
              className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold shadow-btn hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing...' : 'Request Withdrawal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WithdrawFundsModal;
