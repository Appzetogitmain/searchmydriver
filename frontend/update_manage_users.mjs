import fs from 'fs';
import path from 'path';

const filePath = path.resolve('d:/pro 10 SearchMyDriver/frontend/src/features/admin/pages/ManageUsers.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add Imports
content = content.replace(
  "import UserStats from '../components/ManageUsers/UserStats';",
  `import UserStats from '../components/ManageUsers/UserStats';
import api from '../../../utils/api';
import useNotificationStore from '../../../store/useNotificationStore';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';`
);

// 2. Add State and Handlers
content = content.replace(
  "const users = data?.users ?? [];",
  `const users = data?.users ?? [];
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
      await api.patch(\`/admin/users/\${suspendModal.userId}/suspend\`, { reason: suspendModal.reason });
      showNotification('User suspended successfully', 'success');
      setSuspendModal({ isOpen: false, userId: null, reason: '' });
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to suspend user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnsuspend = async (userId) => {
    if (!window.confirm('Are you sure you want to unsuspend this user?')) return;
    try {
      await api.patch(\`/admin/users/\${userId}/unsuspend\`);
      showNotification('User unsuspended successfully', 'success');
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to unsuspend user', 'error');
    }
  };`
);

// 3. Update Columns (Cars, Cancelled Rides, Status, Actions)
content = content.replace(
  `      {
        key: 'isActive',
        label: 'Status',
        width: '14%',
        render: (val) => (
          <span
            className={\`text-xs font-semibold \${val ? 'text-emerald-600' : 'text-rose-600'}\`}
          >
            {val ? 'Active' : 'Inactive'}
          </span>
        ),
      },`,
  `      {
        key: 'cancelledRidesCount',
        label: 'Cancelled',
        width: '10%',
        render: (val) => (
          <span className={\`text-xs font-semibold \${val > 2 ? 'text-rose-600' : 'text-slate-600'}\`}>
            {val || 0}
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
              className={\`text-xs font-semibold \${val ? 'text-emerald-600' : 'text-slate-500'}\`}
            >
              {val ? 'Active' : 'Inactive'}
            </span>
          );
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '14%',
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
      },`
);

// 4. Update Render JSX
content = content.replace(
  `      <ServerPaginatedTable`,
  `      <Modal
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

      <ServerPaginatedTable`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('ManageUsers.jsx updated successfully');
