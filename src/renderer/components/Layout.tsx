import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { navigation } from './Sidebar'
import Navbar from './Navbar'
import { cn } from '../utils/cn'
import { useAuthStore } from '../stores/authStore'

const mobilePrimaryRoutes = new Set(['/app/dashboard', '/clients', '/appointments', '/sales', '/cash'])

export default function Layout() {
  const { user } = useAuthStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileNavigation = navigation.filter((item) => {
    if (!mobilePrimaryRoutes.has(item.href)) return false
    if (item.adminOnly) return user?.role === 'ADMIN'
    return true
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar className="hidden lg:flex" />

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar navegación"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            className="relative h-full w-[min(20rem,calc(100vw-2rem))] shadow-2xl"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 lg:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-5 gap-1">
            {mobileNavigation.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span className="max-w-full truncate">{item.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}

