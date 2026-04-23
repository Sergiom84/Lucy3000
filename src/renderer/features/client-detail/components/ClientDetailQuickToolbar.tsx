import type { ClientDetailTab, ClientDetailToolbarItem } from '../types'

type ClientDetailQuickToolbarProps = {
  items: ClientDetailToolbarItem[]
  onSelectTab: (tab: ClientDetailTab) => void
}

export default function ClientDetailQuickToolbar({
  items,
  onSelectTab
}: ClientDetailQuickToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const isEnabled = Boolean(item.tab)

        return (
          <button
            key={item.label}
            type="button"
            onClick={() => item.tab && onSelectTab(item.tab)}
            disabled={!isEnabled}
            title={isEnabled ? 'Abrir sección' : 'Próximamente'}
            className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-colors ${
              isEnabled
                ? 'border-primary-200 dark:border-primary-700 bg-white dark:bg-gray-800 hover:border-primary-500'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-50 cursor-not-allowed'
            }`}
          >
            <Icon className={`w-5 h-5 ${isEnabled ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
            <span
              className={`text-xs ${
                isEnabled ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
