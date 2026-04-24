import { X } from 'lucide-react'
import { ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl'
  hideTitle?: boolean
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'lg', hideTitle = false }: ModalProps) {
  if (!isOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] flex flex-col`}>
        {hideTitle ? (
          <button
            aria-label={`Cerrar ${title}`}
            onClick={onClose}
            className="absolute right-3 top-3 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        ) : (
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${hideTitle ? 'p-4 pt-5' : 'p-6'}`}>
          {hideTitle && <h2 className="sr-only">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  )
}
