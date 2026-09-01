import { Users, Car, CalendarCheck, DollarSign } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../../utils/api';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import Badge from '../../../components/Badge';
import Avatar from '../../../components/Avatar';
import { ADMIN_MOCK_DRIVERS, ADMIN_MOCK_BOOKINGS } from '../../../utils/constants';
import useAdminAuthStore from '../../../store/useAdminAuthStore';

const AdminDashboard = () => {
  const { admin } = useAdminAuthStore();
  const navigate = useNavigate();

  // Role Protection: Team members go straight to Drivers page
  if (admin?.role !== 'admin' && admin?.role !== 'sub_admin') {
    return <Navigate to="/admin/drivers" replace />;
  }

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    bookingsToday: 0,
    revenueMonth: 0,
  });
  const [recentDrivers, setRecentDrivers] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  
  const handleBookingClick = async (row) => {
    try {
      const res = await api.get(`/admin/bookings/${row._id}`);
      setSelectedBooking(res.data.data);
    } catch (error) {
      console.error('Failed to fetch booking details:', error);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/admin/dashboard/stats');
        const data = response.data.data;
        if (data) {
          setStats(data.stats);
          setRecentDrivers(data.recentDrivers || []);
          setRecentBookings(data.recentBookings || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (admin?.role === 'admin' || admin?.role === 'sub_admin') {
      fetchStats();
    }
  }, [admin]);

  const assignedZoneNames = (admin?.assignedZones || [])
    .map((z) => (typeof z === 'object' ? z.city || z.name : 'Zone'))
    .filter(Boolean);

  const scopeLabel =
    admin?.role === 'admin'
      ? 'All Cities (Global Super Admin)'
      : assignedZoneNames.length > 0
        ? `Scoped to: ${[...new Set(assignedZoneNames)].join(', ')}`
        : 'No City Assigned';

  const driverColumns = [
    {
      key: 'name',
      label: 'Driver',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={val} size="sm" />
          <div>
            <p className="font-semibold">{val}</p>
            <p className="text-[10px] text-text-muted">{row.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'approvalStatus',
      label: 'Status',
      render: (val) => {
        const variants = {
          approved: 'success',
          pending: 'warning',
          rejected: 'danger',
          under_review: 'info',
        };
        return <Badge variant={variants[val]} text={val.replace('_', ' ')} />;
      },
    },
    {
      key: 'createdAt',
      label: 'Joined',
      render: (val) => new Date(val).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Scope Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {admin?.role === 'admin' ? 'Super Admin Dashboard' : 'City Admin Dashboard'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Overview of active metrics, drivers, and trips</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access Scope:</span>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold ${
            admin?.role === 'admin'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${admin?.role === 'admin' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {scopeLabel}
          </span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={Users}
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          color="#3498DB"
          onClick={() => navigate('/admin/users')}
        />
        <StatsCard
          icon={Car}
          label="Total Drivers"
          value={stats.totalDrivers.toLocaleString()}
          color="#2ECC71"
          onClick={() => navigate('/admin/drivers')}
        />
        <StatsCard
          icon={CalendarCheck}
          label="Bookings Today"
          value={stats.bookingsToday.toLocaleString()}
          color="#F39C12"
          onClick={() => navigate('/admin/bookings')}
        />
        <StatsCard
          icon={DollarSign}
          label="Revenue (Month)"
          value={`₹${stats.revenueMonth.toLocaleString()}`}
          color="#9B59B6"
          onClick={() => navigate('/admin/account/revenue')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Drivers */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Recent Drivers</h2>
            <button 
              onClick={() => navigate('/admin/drivers')}
              className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              View All
            </button>
          </div>
          <DataTable
            columns={driverColumns}
            data={recentDrivers}
            searchPlaceholder="Search drivers..."
            pageSize={5}
            onRowClick={(row) => navigate(`/admin/drivers/${row._id}/profile`)}
          />
        </div>

        {/* Recent Bookings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Live Bookings</h2>
            <button 
              onClick={() => navigate('/admin/bookings')}
              className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              View All
            </button>
          </div>
          <DataTable
            columns={[
              { key: '_id', label: 'ID', render: (val) => <span className="font-mono text-xs">{val?.substring(0,8)}...</span> },
              { key: 'serviceType', label: 'Service' },
              {
                key: 'status',
                label: 'Status',
                render: (val) => (
                  <Badge
                    variant={val === 'completed' ? 'success' : val === 'pending' ? 'warning' : 'info'}
                    text={val.replace('_', ' ')}
                  />
                ),
              },
            ]}
            data={recentBookings}
            searchPlaceholder="Search bookings..."
            pageSize={5}
            onRowClick={handleBookingClick}
          />
        </div>
      </div>
      
      <BookingDetailsModal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
      />
    </div>
  );
};

export default AdminDashboard;
