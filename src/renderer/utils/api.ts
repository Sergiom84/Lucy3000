import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
const MAX_NETWORK_RETRIES = 4
const NETWORK_RETRY_DELAY_MS = 500
const SLOW_REQUEST_WARNING_MS = 2_000

type RetryableAxiosConfig = {
  _networkRetryCount?: number
  _requestStartedAt?: number
  method?: string
  url?: string
}

const getRequestDuration = (config: RetryableAxiosConfig | undefined) =>
  config?._requestStartedAt ? Date.now() - config._requestStartedAt : null

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const serializeAxiosError = (error: any) => ({
  code: error?.code ?? null,
  message: error?.message ?? null,
  status: error?.response?.status ?? null,
  method: error?.config?.method ?? null,
  url: error?.config?.url ?? null,
  baseURL: error?.config?.baseURL ?? null,
  params: error?.config?.params ?? null,
  requestData: error?.config?.data ?? null,
  responseData: error?.response?.data ?? null,
  durationMs: getRequestDuration(error?.config)
})

const isBootstrapOrLoginRequest = (url: string | undefined) => {
  if (!url) return false

  return ['/auth/login', '/auth/bootstrap-admin', '/auth/bootstrap-status'].some((path) =>
    url.includes(path)
  )
}

const redirectToLogin = () => {
  if (window.location.protocol === 'file:') {
    window.location.hash = '#/login'
    return
  }

  window.location.assign('/login')
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const setApiBaseUrl = (apiUrl: string) => {
  api.defaults.baseURL = normalizeApiBaseUrl(apiUrl)
}

// Request interceptor para agregar el token
api.interceptors.request.use(
  (config) => {
    ;(config as RetryableAxiosConfig)._requestStartedAt = Date.now()
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor para manejar errores
api.interceptors.response.use(
  (response) => {
    const config = response.config as RetryableAxiosConfig | undefined
    const durationMs = getRequestDuration(config)
    const method = config?.method?.toLowerCase()

    if (
      durationMs !== null &&
      durationMs >= SLOW_REQUEST_WARNING_MS &&
      method &&
      method !== 'get' &&
      method !== 'head'
    ) {
      console.warn('[api] Slow request completed', {
        method: config?.method ?? null,
        url: config?.url ?? null,
        baseURL: response.config.baseURL ?? null,
        status: response.status,
        durationMs
      })
    }

    return response
  },
  async (error) => {
    const config = error.config as RetryableAxiosConfig | undefined
    const method = config?.method?.toLowerCase()
    const retryCount = config?._networkRetryCount ?? 0

    if (error.code === 'ERR_NETWORK' && method === 'get' && config && retryCount < MAX_NETWORK_RETRIES) {
      config._networkRetryCount = retryCount + 1
      console.warn('[api] Network error, retrying request', {
        ...serializeAxiosError(error),
        retryCount: config._networkRetryCount
      })
      await wait(NETWORK_RETRY_DELAY_MS * config._networkRetryCount)
      return api.request(config)
    }

    console.error('[api] Request failed', serializeAxiosError(error))

    const hasActiveSession = Boolean(useAuthStore.getState().token)

    if (error.response?.status === 401 && hasActiveSession && !isBootstrapOrLoginRequest(config?.url)) {
      useAuthStore.getState().logout()
      redirectToLogin()
    }
    return Promise.reject(error)
  }
)

export default api

