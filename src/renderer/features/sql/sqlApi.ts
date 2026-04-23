import api from '../../utils/api'
import type {
  LucyUser,
  SqlAnalysisResult,
  SqlEventLogEntry,
  SqlImportPayload,
  SqlImportReport,
  SqlTrackEventPayload
} from './types'

export const fetchSqlUsers = async () => {
  const response = await api.get('/users')
  return response.data as LucyUser[]
}

export const fetchSqlEvents = async (sessionId: string, limit = 30) => {
  const response = await api.get('/sql/events', {
    params: {
      sessionId,
      limit
    }
  })

  return {
    entries: (response.data.entries || []) as SqlEventLogEntry[],
    filePath: (response.data.filePath || null) as string | null
  }
}

export const createSqlEvent = async (sessionId: string, payload: SqlTrackEventPayload) => {
  const response = await api.post('/sql/events', {
    sessionId,
    type: payload.type,
    step: payload.step ?? null,
    message: payload.message,
    payload: payload.payload
  })

  return response.data as SqlEventLogEntry
}

export const analyzeSqlFile = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post('/sql/analyze', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })

  return response.data as SqlAnalysisResult
}

export const importSqlAnalysis = async (payload: SqlImportPayload) => {
  const response = await api.post('/sql/import', payload)
  return response.data as SqlImportReport
}
