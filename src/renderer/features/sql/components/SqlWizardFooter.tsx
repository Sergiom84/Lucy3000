import { ChevronLeft, ChevronRight } from 'lucide-react'
import { steps } from '../viewModels'

type SqlWizardFooterProps = {
  currentStepIndex: number
  analysisAvailable: boolean
  moveStep: (direction: -1 | 1) => void
}

export default function SqlWizardFooter({
  currentStepIndex,
  analysisAvailable,
  moveStep
}: SqlWizardFooterProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={() => moveStep(-1)}
        disabled={currentStepIndex === 0}
        className="btn btn-secondary disabled:opacity-50"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Paso anterior
      </button>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        {analysisAvailable ? `Paso ${currentStepIndex + 1} de ${steps.length}` : 'Analiza un SQL para desbloquear el wizard'}
      </div>

      <button
        type="button"
        onClick={() => moveStep(1)}
        disabled={currentStepIndex === steps.length - 1 || !analysisAvailable}
        className="btn btn-primary disabled:opacity-50"
      >
        Siguiente paso
        <ChevronRight className="ml-2 h-4 w-4" />
      </button>
    </div>
  )
}
