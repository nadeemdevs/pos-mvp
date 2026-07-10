import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { connectSocket, disconnectSocket } from '../services/socket'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: ({ token, user }) => {
        set({ token, user })
        connectSocket(token)
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
