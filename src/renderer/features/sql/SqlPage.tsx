import SqlEventLogPanel from './components/SqlEventLogPanel'
import SqlStepNavigation from './components/SqlStepNavigation'
import SqlWarningsPanel from './components/SqlWarningsPanel'
import SqlWizardFooter from './components/SqlWizardFooter'
import SqlStepContent from './steps/SqlStepContent'
import { useSqlWizard } from './useSqlWizard'

export default function SqlPage() {
  const wizard = useSqlWizard()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">SQL</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-info">Dump 01dat plano</span>
          <span className="badge badge-warning">Ventas, caja y fotos fuera</span>
          <span className={`badge ${wizard.desktopRestoreAvailable ? 'badge-success' : 'badge-warning'}`}>
            {wizard.desktopRestoreAvailable ? 'Restauración segura habilitada' : 'Modo análisis: sin bridge de escritorio'}
          </span>
        </div>
      </div>

      <SqlStepNavigation
        currentStep={wizard.currentStep}
        goToStep={wizard.goToStep}
        stepEnabled={wizard.stepEnabled}
      />

      <SqlWarningsPanel warnings={wizard.visibleWarnings} />

      <SqlStepContent
        file={wizard.file}
        analysis={wizard.analysis}
        currentStep={wizard.currentStep}
        loading={wizard.loading}
        usersLoading={wizard.usersLoading}
        usersCount={wizard.usersCount}
        sessionId={wizard.sessionId}
        handleAnalyze={wizard.handleAnalyze}
        handleImport={wizard.handleImport}
        handleFileSelection={wizard.handleFileSelection}
        updateAnalysisRows={wizard.updateAnalysisRows}
        trackEvent={wizard.trackEvent}
        selectedSummary={wizard.selectedSummary}
        importReport={wizard.importReport}
        userOptions={wizard.userOptions}
        desktopRestoreAvailable={wizard.desktopRestoreAvailable}
      />

      <SqlEventLogPanel
        eventEntries={wizard.eventEntries}
        eventLogPath={wizard.eventLogPath}
        eventsLoading={wizard.eventsLoading}
        refreshEvents={wizard.refreshEvents}
      />

      <SqlWizardFooter
        currentStepIndex={wizard.currentStepIndex}
        analysisAvailable={Boolean(wizard.analysis)}
        moveStep={wizard.moveStep}
      />
    </div>
  )
}
