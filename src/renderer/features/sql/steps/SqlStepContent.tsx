import type { UseSqlWizardResult } from '../useSqlWizard'
import SqlEditableStepViews from './SqlEditableStepViews'
import SqlFileStep from './SqlFileStep'
import SqlSummaryStep from './SqlSummaryStep'

type SqlStepContentProps = Pick<
  UseSqlWizardResult,
  | 'file'
  | 'analysis'
  | 'currentStep'
  | 'loading'
  | 'usersLoading'
  | 'usersCount'
  | 'sessionId'
  | 'handleAnalyze'
  | 'handleImport'
  | 'handleFileSelection'
  | 'updateAnalysisRows'
  | 'trackEvent'
  | 'selectedSummary'
  | 'importReport'
  | 'userOptions'
> & { desktopRestoreAvailable: boolean }

export default function SqlStepContent({
  file,
  analysis,
  currentStep,
  loading,
  usersLoading,
  usersCount,
  sessionId,
  handleAnalyze,
  handleImport,
  handleFileSelection,
  updateAnalysisRows,
  trackEvent,
  selectedSummary,
  importReport,
  userOptions,
  desktopRestoreAvailable
}: SqlStepContentProps) {
  if (currentStep === 'file') {
    return (
      <SqlFileStep
        file={file}
        analysis={analysis}
        loading={loading}
        usersLoading={usersLoading}
        usersCount={usersCount}
        sessionId={sessionId}
        onFileChange={handleFileSelection}
        onAnalyze={handleAnalyze}
      />
    )
  }

  if (!analysis) {
    return null
  }

  if (currentStep === 'summary' && selectedSummary) {
    return (
      <SqlSummaryStep
        analysis={analysis}
        selectedSummary={selectedSummary}
        usersCount={usersCount}
        desktopRestoreAvailable={desktopRestoreAvailable}
        loading={loading}
        importReport={importReport}
        onImport={handleImport}
      />
    )
  }

  if (currentStep === 'summary') {
    return null
  }

  return (
    <SqlEditableStepViews
      currentStep={currentStep}
      analysis={analysis}
      updateAnalysisRows={updateAnalysisRows}
      trackEvent={trackEvent}
      userOptions={userOptions}
    />
  )
}
