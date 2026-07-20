import { useState } from 'react';
import { Ban, UserCheck, Loader2, CheckCircle, XCircle } from 'lucide-react';
import api from '../../../../utils/api';
import toast from 'react-hot-toast';

/**
 * Suspend / unsuspend controls for driver list rows and profile.
 */
const DriverSuspendActions = ({
  driver,
  onSuccess,
  compact = false,
  className = '',
}) => {
  const [loading, setLoading] = useState(null);

  if (!driver?._id) return null;

  const isSuspended = driver.approvalStatus === 'suspended';
  const canSuspend = driver.approvalStatus === 'approved';
  const canUnsuspend = isSuspended;
  const canApprove = driver.approvalStatus === 'pending' || driver.approvalStatus === 'under_review';
  const canReject = driver.approvalStatus === 'pending' || driver.approvalStatus === 'under_review';

  if (!canSuspend && !canUnsuspend && !canApprove && !canReject) return null;

  const handleStatusChange = async (status, note, confirmMsg, loaderState, successMsg) => {
    if (!window.confirm(confirmMsg)) return;

    setLoading(loaderState);
    try {
      await api.put(`/admin/drivers/${driver._id}/status`, {
        approvalStatus: status,
        approvalNote: note,
      });
      toast.success(successMsg);
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${loaderState} driver`);
    } finally {
      setLoading(null);
    }
  };

  const handleApprove = (e) => {
    e?.stopPropagation?.();
    handleStatusChange('approved', 'Approved by admin', `Approve ${driver.name}?`, 'approve', 'Driver approved');
  };

  const handleReject = (e) => {
    e?.stopPropagation?.();
    const reason = window.prompt(`Reason for rejecting ${driver.name}?`, 'Rejected by admin');
    if (reason === null) return;
    handleStatusChange('rejected', reason || 'Rejected by admin', `Confirm rejection of ${driver.name}?`, 'reject', 'Driver rejected');
  };

  const handleSuspend = async (e) => {
    e?.stopPropagation?.();
    if (
      !window.confirm(
        `Suspend ${driver.name}? They will be logged out of trips and cannot go online.`,
      )
    ) {
      return;
    }

    setLoading('suspend');
    try {
      await api.patch(`/admin/drivers/${driver._id}/suspend`, {
        note: 'Suspended by admin',
      });
      toast.success('Driver suspended');
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to suspend driver');
    } finally {
      setLoading(null);
    }
  };

  const handleUnsuspend = async (e) => {
    e?.stopPropagation?.();
    if (!window.confirm(`Restore ${driver.name}? They will be approved again.`)) return;

    setLoading('unsuspend');
    try {
      await api.patch(`/admin/drivers/${driver._id}/unsuspend`);
      toast.success('Driver unsuspended');
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unsuspend driver');
    } finally {
      setLoading(null);
    }
  };

  const btnBase = compact
    ? 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50'
    : 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {canApprove && (
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={handleApprove}
          className={`${btnBase} border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
        >
          {loading === 'approve' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5" />
          )}
          Approve
        </button>
      )}
      {canReject && (
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={handleReject}
          className={`${btnBase} border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}
        >
          {loading === 'reject' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          Reject
        </button>
      )}
      {canSuspend && (
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={handleSuspend}
          className={`${btnBase} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`}
        >
          {loading === 'suspend' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Ban className="w-3.5 h-3.5" />
          )}
          Suspend
        </button>
      )}
      {canUnsuspend && (
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={handleUnsuspend}
          className={`${btnBase} border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
        >
          {loading === 'unsuspend' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserCheck className="w-3.5 h-3.5" />
          )}
          Unsuspend
        </button>
      )}
    </div>
  );
};

export default DriverSuspendActions;
