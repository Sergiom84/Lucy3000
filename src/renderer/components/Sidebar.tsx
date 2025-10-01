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
  Sparkles
} from 'lucide-react'
import { cn } from '../utils/cn'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Clientes', href: '/clients', icon: Users },
  { name: 'Citas', href: '/appointments', icon: Calendar },
  { name: 'Servicios', href: '/services', icon: Scissors },
  { name: 'Productos', href: '/products', icon: Package },
  { name: 'Ventas', href: '/sales', icon: ShoppingCart },
  { name: 'Caja', href: '/cash', icon: Wallet },
  { name: 'Reportes', href: '/reports', icon: FileText },
  { name: 'Configuración', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
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
          {navigation.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
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
          Lucy3000 v1.0.0
        </p>
      </div>
    </div>
  )
}

