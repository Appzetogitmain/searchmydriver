import { createQueryStore } from '../lib/createQueryStore';
import api from '../../utils/api';

export const useAdminUserWalletStore = createQueryStore(
  async (params) => {
    const res = await api.get('/admin/user-wallet-history', { params });
    return res.data?.data || { data: [], pagination: { total: 0, pages: 1 } };
  }
);
