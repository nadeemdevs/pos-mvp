import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: ({ token, user }) => set({ token, user }),

      logout: () => set({ token: null, user: null }),

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
    },
  ),
)
