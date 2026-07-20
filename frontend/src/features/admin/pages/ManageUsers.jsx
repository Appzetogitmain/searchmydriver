import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUsersStore } from '../../../store/admin/useAdminUsersStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import UserFilters from '../components/ManageUsers/UserFilters';
import UserStats from '../components/ManageUsers/UserStats';
import api from '../../../utils/api';
import useNotificationStore from '../../../store/useNotificationStore';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';

const ManageUsers = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useMemo(
    () => ({ page, limit, search: debouncedSearch }),
    [page, limit, debouncedSearch],
  );

  const cacheKey = buildCacheKey('admin-users', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminUsersStore,
    cacheKey,
    queryParams,
  );

  const users = data?.users ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };
  const { showNotification } = useNotificationStore();
  const [suspendModal, setSuspendModal] = useState({ isOpen: false, userId: null, reason: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuspend = async () => {
    if (!suspendModal.reason.trim()) {
      showNotification('Please provide a reason for suspension', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(`/admin/users/${suspendModal.userId}/suspend`, { reason: suspendModal.reason });
      showNotification('User suspended successfully', 'success');
      setSuspendModal({ isOpen: false, userId: null, reason: '' });
      refetch();
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Failed to suspend user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnsuspend = async (userId) => {
    if (!window.confirm('Are you sure you want to unsuspend this user?')) return;
    try {
      await api.patch(`/admin/users/${userId}/unsuspend`);
      showNotification('User unsuspended successfully', 'success');
      refetch();
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Failed to unsuspend user', 'error');
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'User',
        width: '28%',
        render: (val, row) => (
          <div className="flex items-center gap-3 py-1">
            <Avatar name={val} size="sm" src={row.profilePicture} />
            <div>
              <p className="font-semibold text-sm text-slate-800">{val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{row.email}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5" title="User ID">ID: {row.userId || row._id}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'phone_no',
        label: 'Phone',
        width: '16%',
        render: (val) => <span className="text-sm text-slate-600">{val || '—'}</span>,
      },
      {
        key: 'carsCount',
        label: 'Vehicles',
        width: '12%',
        render: (val) => (
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              val > 0 ? 'bg-primary/10 text-primary-dark' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {val} {val === 1 ? 'car' : 'cars'}
          </span>
        ),
      },
      {
        key: 'cancelledRidesCount',
        label: 'Cancelled',
        width: '10%',
        render: (val) => (
          <span className={`text-xs font-semibold ${val > 2 ? 'text-rose-600' : 'text-slate-600'}`}>
            {val || 0}
          </span>
        ),
      },
      {
        key: 'rating',
        label: 'Rating',
        width: '10%',
        render: (val) => (
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <svg className="w-3 h-3 text-amber-500 fill-amber-500" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {val ? Number(val).toFixed(1) : 'New'}
          </span>
        ),
      },
      {
        key: 'isActive',
        label: 'Status',
        width: '12%',
        render: (val, row) => {
          if (row.isSuspended) {
            return <span className="text-xs font-semibold text-rose-600">Suspended</span>;
          }
          return (
            <span
              className={`text-xs font-semibold ${val ? 'text-emerald-600' : 'text-slate-500'}`}
            >
              {val ? 'Active' : 'Inactive'}
            </span>
          );
        },
      },
      {
        key: 'createdAt',
        label: 'Joined',
        width: '12%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '10%',
        render: (_, row) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {row.isSuspended ? (
              <button
                onClick={() => handleUnsuspend(row._id)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
              >
                Unsuspend
              </button>
            ) : (
              <button
                onClick={() => setSuspendModal({ isOpen: true, userId: row._id, reason: '' })}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded transition-colors"
              >
                Suspend
              </button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      withCars: users.filter((u) => u.carsCount > 0).length,
    }),
    [users, pagination.total],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up">
      <UserFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />
      <UserStats {...stats} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Modal
        isOpen={suspendModal.isOpen}
        onClose={() => !isSubmitting && setSuspendModal({ isOpen: false, userId: null, reason: '' })}
        title="Suspend User"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-600">
            Please provide a reason for suspending this user. They will no longer be able to log in or book rides.
          </p>
          <textarea
            value={suspendModal.reason}
            onChange={(e) => setSuspendModal((prev) => ({ ...prev, reason: e.target.value }))}
            className="w-full h-24 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none outline-none"
            placeholder="Reason for suspension..."
            disabled={isSubmitting}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setSuspendModal({ isOpen: false, userId: null, reason: '' })}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-rose-600 hover:bg-rose-700 border-none"
              onClick={handleSuspend}
              loading={isSubmitting}
            >
              Suspend User
            </Button>
          </div>
        </div>
      </Modal>

      <ServerPaginatedTable
        columns={columns}
        data={users}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/admin/users/${row._id}/profile`)}
        entityLabel="users"
        emptyMessage="No users found"
      />
    </div>
  );
};

export default ManageUsers;
