import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Scissors,
  Package,
  ShoppingCart,
  Wallet,
  FileText,
  Settings,
  Database,
  Sparkles,
  Trophy,
  ShieldCheck
} from 'lucide-react'
import { cn } from '../utils/cn'
import { getAppVersion } from '../utils/desktop'
import { hasSectionAccess, type SectionKey } from '../utils/permissions'
import { useAuthStore } from '../stores/authStore'

type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  sectionKey?: SectionKey
}

export const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, sectionKey: 'dashboard' },
  { name: 'Clientes', href: '/clients', icon: Users, sectionKey: 'clients' },
  { name: 'Ranking', href: '/ranking', icon: Trophy, sectionKey: 'ranking' },
  { name: 'Citas', href: '/appointments', icon: Calendar, sectionKey: 'appointments' },
  { name: 'Servicios', href: '/services', icon: Scissors, sectionKey: 'services' },
  { name: 'Productos', href: '/products', icon: Package, sectionKey: 'products' },
  { name: 'Ventas', href: '/sales', icon: ShoppingCart, sectionKey: 'sales' },
  { name: 'Caja', href: '/cash', icon: Wallet, sectionKey: 'cash' },
  { name: 'Cuentas', href: '/accounts', icon: ShieldCheck, adminOnly: true },
  { name: 'Reportes', href: '/reports', icon: FileText, adminOnly: true },
  { name: 'Configuración', href: '/settings', icon: Settings, sectionKey: 'settings' },
  { name: 'SQL', href: '/sql', icon: Database, adminOnly: true },
]

type SidebarProps = {
  className?: string
  onNavigate?: () => void
}

export default function Sidebar({ className, onNavigate }: SidebarProps = {}) {
  const { user } = useAuthStore()
  const [appVersion, setAppVersion] = useState('2.0.0')

  useEffect(() => {
    let active = true

    void getAppVersion()
      .then((version) => {
        if (active) {
          setAppVersion(version)
        }
      })
      .catch(() => {
        // Keep the packaged fallback version when the runtime bridge is unavailable.
      })

    return () => {
      active = false
    }
  }, [])

  const isAdmin = user?.role === 'ADMIN'

  const visibleNavigation = navigation.filter((item) => {
    if (item.adminOnly) return isAdmin
    if (!item.sectionKey) return false
    return hasSectionAccess(user, item.sectionKey)
  })

  return (
    <div className={cn('w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col', className)}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-8 h-8 text-primary-600" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            Lucy3000
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {visibleNavigation.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                end={item.href === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {`Lucy3000 v${appVersion}`}
        </p>
      </div>
    </div>
  )
}
