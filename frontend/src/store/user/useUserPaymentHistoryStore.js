import { createQueryStore } from '../lib/createQueryStore';
import api from '../../utils/api';

export const useUserPaymentHistoryStore = createQueryStore(async ({ page = 1, limit = 20 } = {}) => {
  const res = await api.get('/auth/wallet/withdrawals', {
    params: { page, limit },
  });
  return {
    withdrawals: res.data?.data?.withdrawals || [],
    hasMore: res.data?.data?.hasMore || false,
    total: res.data?.data?.total || 0,
  };
});
