import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Phase 6.4a — the platform-operator session is a COMPLETELY SEPARATE store
// from useAuthStore (tenant users): different localStorage key ('platform-auth'
// vs 'pos-auth'), no shared state, no shared axios instance (see
// services/platformApi.js). A browser can hold a tenant session AND a
// platform session simultaneously without either clobbering the other.
export const usePlatformAuthStore = create(
  persist(
    (set) => ({
      token: null,
      operator: null,

      login: (token, operator) => set({ token, operator }),

      logout: () => set({ token: null, operator: null }),
    }),
    {
      name: 'platform-auth',
      partialize: (state) => ({ token: state.token, operator: state.operator }),
    },
  ),
)
