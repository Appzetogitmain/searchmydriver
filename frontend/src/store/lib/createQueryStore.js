import { create } from 'zustand';

const EMPTY_ENTRY = {
  data: null,
  isFetched: false,
  loading: false,
  error: null,
  fetchedAt: null,
};

/** In-flight dedupe per store instance (same cache key → one network call). */
const inflightByStore = new WeakMap();

/**
 * Generic Zustand query cache factory.
 * @param {(params: object) => Promise<any>} fetcher - Axios-backed async fetcher
 */
export function createQueryStore(fetcher) {
  const useStore = create((set, get) => ({
    entries: {},

    getEntry: (cacheKey) => get().entries[cacheKey] ?? EMPTY_ENTRY,

    fetch: async (cacheKey, params = {}, options = {}) => {
      const { force = false } = options;
      const current = get().entries[cacheKey];

      if (current?.isFetched && !force && !current.loading) {
        return current.data;
      }

      let inflight = inflightByStore.get(useStore);
      if (!inflight) {
        inflight = new Map();
        inflightByStore.set(useStore, inflight);
      }

      if (inflight.has(cacheKey)) {
        return inflight.get(cacheKey);
      }

      set((state) => ({
        entries: {
          ...state.entries,
          [cacheKey]: {
            ...(state.entries[cacheKey] ?? EMPTY_ENTRY),
            loading: true,
            error: null,
          },
        },
      }));

      const promise = (async () => {
        try {
          const data = await fetcher(params);
          set((state) => ({
            entries: {
              ...state.entries,
              [cacheKey]: {
                data,
                isFetched: true,
                loading: false,
                error: null,
                fetchedAt: Date.now(),
              },
            },
          }));
          return data;
        } catch (err) {
          const message =
            err?.response?.data?.message || err?.message || 'Request failed';

          set((state) => ({
            entries: {
              ...state.entries,
              [cacheKey]: {
                ...(state.entries[cacheKey] ?? EMPTY_ENTRY),
                loading: false,
                error: message,
                isFetched: Boolean(state.entries[cacheKey]?.isFetched),
              },
            },
          }));
          throw err;
        } finally {
          inflight.delete(cacheKey);
        }
      })();

      inflight.set(cacheKey, promise);
      return promise;
    },

    refresh: (cacheKey, params) => get().fetch(cacheKey, params, { force: true }),

    // No matcher → drop every entry. Callers do `invalidate()` after a
    // mutation; without this guard `matcher(key)` threw a TypeError, which
    // surfaced as a failure even though the server call had succeeded.
    invalidate: (matcher) => {
      set((state) => {
        const entries = { ...state.entries };
        Object.keys(entries).forEach((key) => {
          const match =
            matcher == null
              ? true
              : typeof matcher === 'string'
                ? key.startsWith(matcher)
                : matcher(key);
          if (match) delete entries[key];
        });
        return { entries };
      });
    },

    reset: () => set({ entries: {} }),
  }));

  return useStore;
}
