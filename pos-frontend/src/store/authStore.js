import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { connectSocket, disconnectSocket } from '../services/socket'
import { useBranchStore } from './branchStore'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: ({ token, user }) => {
        set({ token, user })
        connectSocket(token)
        // Phase 6.5 — branch locking. A user without branches.manage can only
        // ever work in their own home branch; force activeBranch to it right
        // now so a stale persisted value from a PRIOR different-permission
        // session in this browser (e.g. someone who used to be an Admin) is
        // never carried over. (The tenant-wide staffCanSwitchBranches opt-in
        // isn't known yet at login time — AppLayout re-applies this once
        // settings load, in case that flag is off but branches.manage is also
        // absent.)
        const canSwitch = user?.role === 'Admin' || (Array.isArray(user?.permissions) && user.permissions.includes('branches.manage'))
        if (!canSwitch && user?.branchId) {
          useBranchStore.getState().setActiveBranch(user.branchId)
        }
      },

      logout: () => {
        set({ token: null, user: null })
        disconnectSocket()
      },

      setUser: (user) => set({ user }),

      hasPermission: (perm) => {
        const user = get().user
        if (!user) return false
        if (user.role === 'Admin') return true
        return Array.isArray(user.permissions) && user.permissions.includes(perm)
      },
    }),
    {
      name: 'pos-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      // On page reload the store rehydrates from localStorage without going
      // through login(), so re-establish the socket connection here too.
      onRehydrateStorage: () => (state) => {
        if (state?.token) connectSocket(state.token)
      },
    },
  ),
)
