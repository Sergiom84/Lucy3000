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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 animate-fade-in sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative flex max-h-[100dvh] w-full ${maxWidthClasses[maxWidth]} flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-gray-800 sm:max-h-[90vh] sm:rounded-2xl`}>
        {hideTitle ? (
          <button
            aria-label={`Cerrar ${title}`}
            onClick={onClose}
            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-6">
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={`Cerrar ${title}`}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))] ${hideTitle ? 'p-4 pt-5' : 'p-4 sm:p-6'}`}>
          {hideTitle && <h2 className="sr-only">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  )
}
