import React from 'react';
import {
  Building2,
  CreditCard,
  Hash,
  Wallet,
  CheckCircle2,
  Lock,
  Copy,
  User,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Badge from '../../../../components/Badge';

const DriverBankDetailsCard = ({ bankDetails }) => {
  const bank = bankDetails || null;

  const copyToClipboard = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  };

  const isVerified = Boolean(bank?.isVerified);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">
            Bank Details
          </h3>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          <Lock className="w-3 h-3 text-slate-400" />
          <span>Locked</span>
        </div>
      </div>

      <Card padding="p-4" className="border border-slate-200/90 shadow-sm rounded-3xl space-y-4">
        {!bank || !bank.accountNumber ? (
          <div className="py-5 text-center text-xs text-text-muted space-y-1">
            <p className="font-semibold text-slate-700">No bank details added yet</p>
            <p className="text-[11px] text-slate-500">
              Payout bank details are added during registration or can be updated by the Administrator.
            </p>
          </div>
        ) : (
          <>
            {/* Header: Bank name & Verification Badge */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-900 truncate">
                    {bank.bankName || 'Payout Bank Account'}
                  </h4>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {bank.accountHolderName ? `Holder: ${bank.accountHolderName}` : 'Registered Payout Account'}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 border ${
                  isVerified
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>{isVerified ? 'Verified' : 'Active'}</span>
              </span>
            </div>

            {/* Grid of Bank Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Account Number */}
              <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Account Number
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 font-mono tracking-wider truncate">
                    {bank.accountNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(bank.accountNumber, 'Account Number')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer shrink-0"
                  title="Copy Account Number"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* IFSC Code */}
              <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                    <Hash className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      IFSC Code
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 font-mono tracking-wider truncate uppercase">
                    {bank.ifscCode || bank.ifsc || '—'}
                  </p>
                </div>
                {bank.ifscCode && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(bank.ifscCode, 'IFSC Code')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer shrink-0"
                    title="Copy IFSC Code"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Account Holder Name */}
              {bank.accountHolderName && (
                <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                    <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Account Holder
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {bank.accountHolderName}
                  </p>
                </div>
              )}

              {/* UPI ID */}
              <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      UPI ID
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 font-mono truncate">
                    {bank.upiId || 'Not added'}
                  </p>
                </div>
                {bank.upiId && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(bank.upiId, 'UPI ID')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer shrink-0"
                    title="Copy UPI ID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Lock Notice Footer */}
            <div className="pt-2.5 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Bank details are locked. Once added, changes can only be modified by the Administrator via the Admin Panel.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default DriverBankDetailsCard;
