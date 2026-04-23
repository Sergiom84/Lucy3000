import type { WizardStepId } from '../types'
import { steps } from '../viewModels'

type SqlStepNavigationProps = {
  currentStep: WizardStepId
  goToStep: (stepId: WizardStepId) => void
  stepEnabled: (stepId: WizardStepId) => boolean
}

export default function SqlStepNavigation({
  currentStep,
  goToStep,
  stepEnabled
}: SqlStepNavigationProps) {
  return (
    <div className="card overflow-x-auto">
      <div className="flex min-w-max gap-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isEnabled = stepEnabled(step.id)

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => goToStep(step.id)}
              disabled={!isEnabled}
              className={`min-h-[6.5rem] min-w-[8.5rem] rounded-xl border px-3 py-3 text-left transition-all ${
                isActive
                  ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                  : isEnabled
                    ? 'border-gray-200 hover:border-primary-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-primary-500 dark:hover:bg-gray-700/40'
                    : 'cursor-not-allowed border-gray-200 opacity-50 dark:border-gray-700'
              }`}
            >
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Paso {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-tight text-gray-900 dark:text-white">
                    {step.shortLabel}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
