import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Admin active service cities list — cached.
 * Fetches distinct operational cities where services are active.
 */
export const useAdminServiceCitiesStore = createQueryStore(async () => {
  const res = await api.get('/admin/service-cities');
  return res.data?.data ?? [];
});
