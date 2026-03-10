import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const MAX_NETWORK_RETRIES = 4
const NETWORK_RETRY_DELAY_MS = 500

type RetryableAxiosConfig = {
  _networkRetryCount?: number
  method?: string
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor para agregar el token
api.interceptors.request.use(
  (config) => {
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
  (response) => response,
  async (error) => {
    const config = error.config as RetryableAxiosConfig | undefined
    const method = config?.method?.toLowerCase()
    const retryCount = config?._networkRetryCount ?? 0

    if (error.code === 'ERR_NETWORK' && method === 'get' && config && retryCount < MAX_NETWORK_RETRIES) {
      config._networkRetryCount = retryCount + 1
      await wait(NETWORK_RETRY_DELAY_MS * config._networkRetryCount)
      return api.request(config)
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

