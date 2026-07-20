import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Banknote, Search, Check, X } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import api from '../../../utils/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../../../components/Modal';

export default function ManageWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [selectedAction, setSelectedAction] = useState(null); // { row: Object, type: 'approve' | 'reject' }

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const res = await api.get('/admin/withdrawals');
      setWithdrawals(res.data?.data?.withdrawals || []);
    } catch (err) {
      toast.error('Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      await api.put(`/admin/withdrawals/${id}/${action}`);
      toast.success(`Withdrawal ${action}d successfully`);
      fetchWithdrawals();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} withdrawal`);
    }
  };

  const filteredWithdrawals = withdrawals.filter(w => {
    const u = w.userType === 'Driver' ? w.driverId : w.userId;
    return u?.name?.toLowerCase().includes(search.toLowerCase()) ||
           u?.phone_no?.includes(search) ||
           u?.phone?.includes(search);
  });

  const columns = [
    {
      key: 'user',
      label: 'User/Driver',
      render: (_, row) => {
        const u = row.userType === 'Driver' ? row.driverId : row.userId;
        return (
          <div>
            <div className="font-medium flex items-center gap-1.5">
              {u?.name || 'Unknown'}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">{row.userType}</span>
            </div>
            <div className="text-sm text-text-muted">{u?.phone_no || u?.phone}</div>
          </div>
        );
      },
    },
    {
      key: 'amount',
      label: 'Amount (₹)',
      render: (_, row) => (
        <div className="font-semibold text-rose-600">
          ₹{row.amount}
        </div>
      ),
    },
    {
      key: 'bankDetails',
      label: 'Bank Details',
      render: (_, row) => {
        const u = row.userType === 'Driver' ? row.driverId : row.userId;
        const bank = u?.bankDetails;
        return (
          <div className="text-sm">
            {bank ? (
              <>
                <div><span className="text-text-muted">Bank:</span> {bank.bankName}</div>
                <div><span className="text-text-muted">A/C:</span> {bank.accountNumber}</div>
                <div><span className="text-text-muted">IFSC:</span> {bank.ifscCode}</div>
              </>
            ) : (
              <span className="text-text-muted">No details</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const statusMap = {
          pending: 'warning',
          approved: 'success',
          rejected: 'error',
        };
        return <StatusBadge status={row.status.toUpperCase()} type={statusMap[row.status] || 'default'} />;
      },
    },
    {
      key: 'date',
      label: 'Date',
      render: (_, row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.status === 'pending' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                icon={Check} 
                onClick={() => setSelectedAction({ row, type: 'approve' })}
                className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 px-2 py-1 h-auto text-xs"
              >
                Approve
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                icon={X} 
                onClick={() => setSelectedAction({ row, type: 'reject' })}
                className="text-red-600 border-red-600 hover:bg-red-50 px-2 py-1 h-auto text-xs"
              >
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <Input
          icon={Search}
          placeholder="Search driver by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md"
        />
      </div>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredWithdrawals}
          loading={loading}
          emptyMessage="No withdrawal requests found"
          showSearch={false}
          showToolbar={false}
          embedded={true}
        />
      </Card>

      {/* Confirmation Modal */}
      {selectedAction && (
        <Modal
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          title={selectedAction.type === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
          size="md"
        >
          <div className="p-5 space-y-5">
            <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden text-sm">
              <div className="p-3.5 border-b border-slate-100 bg-slate-100/50 flex justify-between items-center">
                <span className="font-semibold text-slate-800">Account Info</span>
                <span className="font-bold text-rose-600">₹{selectedAction.row.amount}</span>
              </div>
              <div className="p-3.5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">User/Driver:</span>
                  <span className="font-medium text-slate-900 truncate max-w-[180px]">
                    {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.name : selectedAction.row.userId?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-medium text-slate-900">
                    {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.phone_no : selectedAction.row.userId?.phone_no}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden text-sm">
              <div className="p-3.5 border-b border-slate-100 bg-slate-100/50">
                <span className="font-semibold text-slate-800">Bank Details</span>
              </div>
              <div className="p-3.5">
                {selectedAction.row.userType === 'Driver' && selectedAction.row.driverId?.bankDetails || selectedAction.row.userId?.bankDetails ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Name:</span>
                      <span className="font-medium text-slate-900 truncate max-w-[180px]">
                        {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.bankDetails?.accountHolderName : selectedAction.row.userId?.bankDetails?.accountHolderName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank Name:</span>
                      <span className="font-medium text-slate-900 truncate max-w-[180px]">
                        {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.bankDetails?.bankName : selectedAction.row.userId?.bankDetails?.bankName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account No:</span>
                      <span className="font-medium text-slate-900">
                        {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.bankDetails?.accountNumber : selectedAction.row.userId?.bankDetails?.accountNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">IFSC:</span>
                      <span className="font-medium text-slate-900 uppercase">
                        {selectedAction.row.userType === 'Driver' ? selectedAction.row.driverId?.bankDetails?.ifscCode : selectedAction.row.userId?.bankDetails?.ifscCode}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-1">No bank details provided.</p>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-600 bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-100/50">
              {selectedAction.type === 'approve' 
                ? 'Make sure you have processed the payment manually before confirming this action.'
                : 'The amount will be refunded to their wallet upon rejection.'}
            </p>

            <div className="flex items-center gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedAction(null)}>
                Cancel
              </Button>
              <Button 
                variant={selectedAction.type === 'approve' ? 'primary' : 'danger'}
                onClick={() => {
                  handleAction(selectedAction.row._id, selectedAction.type);
                  setSelectedAction(null);
                }}
              >
                Confirm {selectedAction.type === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
