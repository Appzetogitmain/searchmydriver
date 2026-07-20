import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import StatusBadge from '../components/StatusBadge';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import DriverStats from '../components/ManageDrivers/DriverStats';
import DriverFilters from '../components/ManageDrivers/DriverFilters';
import DriverSuspendActions from '../components/ManageDrivers/DriverSuspendActions';
import TaskAssigneeBadge from '../components/ManageTasks/TaskAssigneeBadge';
import { getCarTypeLabel } from '../components/ManageDrivers/driverProfileUtils';
import UploadDriverDocModal from '../components/ManageDrivers/UploadDriverDocModal';
import { FilePlus } from 'lucide-react';

const ManageDrivers = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [uploadingForDriver, setUploadingForDriver] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch,
      status: statusFilter,
      assigneeId: assigneeFilter || undefined,
    }),
    [page, limit, debouncedSearch, statusFilter, assigneeFilter],
  );

  const cacheKey = buildCacheKey('admin-drivers', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminDriversStore,
    cacheKey,
    queryParams,
  );

  const drivers = data?.drivers ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Driver',
        width: '20%',
        render: (val, row) => {
          const selfie = row.documents?.find((d) => d.type === 'selfie')?.fileUrl;
          return (
            <div className="flex items-center gap-4 py-1">
              <Avatar name={val} size="sm" src={selfie} className="ring-2 ring-white shadow-md" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-slate-800">{val}</p>
                  {row.driverId && (
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                      {row.driverId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{row.phone}</p>
              </div>
            </div>
          );
        },
      },
      {
        key: 'approvalStatus',
        label: 'Status',
        width: '10%',
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: 'reviewTask',
        label: 'Assigned to',
        width: '10%',
        className: 'hidden md:table-cell',
        render: (_val, row) => <TaskAssigneeBadge task={row.reviewTask} compact />,
      },
      {
        key: 'experienceYears',
        label: 'Experience',
        width: '8%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-sm font-medium text-slate-700">
            {val != null && val !== '' ? `${val} yr${Number(val) === 1 ? '' : 's'}` : '—'}
          </span>
        ),
      },
      {
        key: 'rating',
        label: 'Rating',
        width: '8%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
            <svg className="w-4 h-4 text-amber-500 fill-amber-500" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {val ? Number(val).toFixed(1) : 'New'}
          </span>
        ),
      },
      {
        key: 'isOnline',
        label: 'Activity',
        width: '8%',
        className: 'hidden lg:table-cell',
        render: (val, row) => <ActivityCell online={val} onTrip={row.isOnTrip} />,
      },
      {
        key: 'carTypeExperience',
        label: 'Vehicle types',
        width: '12%',
        className: 'hidden xl:table-cell',
        render: (types) => (
          <div className="flex flex-wrap gap-1.5">
            {types?.length ? (
              types.map((type) => {
                const label = getCarTypeLabel(type);
                if (!label) return null;
                return (
                  <span
                    key={type._id || label}
                    className="inline-flex items-center px-2 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 capitalize"
                  >
                    {label}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        ),
      },
      {
        key: 'documents',
        label: 'Documents',
        width: '12%',
        className: 'hidden xl:table-cell',
        render: (_val, row) => {
          const docTypes = ['aadhaar_front', 'aadhaar_back', 'driving_license', 'police_verification', 'address_proof', 'selfie'];
          const uploadedTypes = row.documents?.map(d => d.type) || [];
          return (
            <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap gap-1">
                {docTypes.map(t => {
                  const isUploaded = uploadedTypes.includes(t);
                  return (
                    <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${isUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`} title={t.replace('_', ' ')}>
                      {t.split('_')[0].substring(0, 3)}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setUploadingForDriver(row)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors w-fit"
              >
                <FilePlus className="w-3 h-3" />
                Upload Doc
              </button>
            </div>
          );
        },
      },
      {
        key: 'createdAt',
        label: 'Joined',
        width: '8%',
        className: 'hidden lg:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '12%',
        render: (_val, row) => (
          <DriverSuspendActions driver={row} onSuccess={refetch} compact />
        ),
      },
    ],
    [refetch],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      pending: drivers.filter(
        (d) => d.approvalStatus === 'pending' || d.approvalStatus === 'under_review',
      ).length,
      approved: drivers.filter((d) => d.approvalStatus === 'approved').length,
      rejected: drivers.filter((d) => d.approvalStatus === 'rejected').length,
      suspended: drivers.filter((d) => d.approvalStatus === 'suspended').length,
    }),
    [drivers, pagination.total],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up">
      <DriverFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusChange={(val) => {
          setStatusFilter(val);
          setPage(1);
        }}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={(val) => {
          setAssigneeFilter(val);
          setPage(1);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />

      <DriverStats {...stats} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        columns={columns}
        data={drivers}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/admin/drivers/${row._id}/profile`)}
        entityLabel="drivers"
        emptyMessage="No drivers found"
      />

      {uploadingForDriver && (
        <UploadDriverDocModal
          driver={uploadingForDriver}
          onClose={() => setUploadingForDriver(null)}
          onSuccess={() => {
            refetch();
            setUploadingForDriver(null);
          }}
        />
      )}
    </div>
  );
};

function ActivityCell({ online, onTrip }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
      />
      <span className="text-xs font-medium text-slate-600">
        {online ? (onTrip ? 'On Trip' : 'Online') : 'Offline'}
      </span>
    </div>
  );
}

export default ManageDrivers;
