import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Admin customer list — cached by page / limit / search.
 */
export const useAdminUsersStore = createQueryStore(async ({ page, limit, search, city }) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) params.append('search', search);
  if (city && city !== 'all') params.append('city', city);

  const res = await api.get(`/admin/users?${params.toString()}`);
  const payload = res.data?.data;

  return {
    users: payload?.data ?? [],
    pagination: payload?.pagination ?? { total: 0, pages: 1 },
  };
});
