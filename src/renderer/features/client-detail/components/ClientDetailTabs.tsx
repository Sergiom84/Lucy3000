import type { ClientDetailTab, ClientDetailTabOption } from '../types'

type ClientDetailTabsProps = {
  activeTab: ClientDetailTab
  onSelectTab: (tab: ClientDetailTab) => void
  tabs: ClientDetailTabOption[]
}

export default function ClientDetailTabs({
  activeTab,
  onSelectTab,
  tabs
}: ClientDetailTabsProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex space-x-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center space-x-2 pb-4 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="font-medium">{tab.label}</span>
            {tab.count !== undefined && <span className="badge badge-secondary">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
