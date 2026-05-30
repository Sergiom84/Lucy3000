import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import api from './utils/api'
import type { DatabaseConfigStatus } from '../shared/electron'

const Layout = lazy(() => import('./components/Layout'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const ClientDetail = lazy(() => import('./pages/ClientDetail'))
const Appointments = lazy(() => import('./pages/Appointments'))
const Services = lazy(() => import('./pages/Services'))
const Products = lazy(() => import('./pages/Products'))
const Sales = lazy(() => import('./pages/Sales'))
const Cash = lazy(() => import('./pages/Cash'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const ClientRanking = lazy(() => import('./pages/ClientRanking'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Sql = lazy(() => import('./pages/Sql'))
const DatabaseSetup = lazy(() => import('./pages/DatabaseSetup'))

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-200">
      Cargando Lucy3000...
    </div>
  )
}

function AdminOnlyRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore()

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />
  }

  return children
}

function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#363636',
          color: '#fff',
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  )
}

function App() {
  const { isAuthenticated, token, updateUser, logout } = useAuthStore()
  const [authReady, setAuthReady] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseConfigStatus | null>(null)
  const [databaseStatusReady, setDatabaseStatusReady] = useState(false)
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

  useEffect(() => {
    let cancelled = false

    const loadDatabaseStatus = async () => {
      if (!window.electronAPI?.databaseConfig) {
        setDatabaseStatusReady(true)
        return
      }

      try {
        const status = await window.electronAPI.databaseConfig.getStatus()
        if (!cancelled) {
          setDatabaseStatus(status)
        }
      } finally {
        if (!cancelled) {
          setDatabaseStatusReady(true)
        }
      }
    }

    void loadDatabaseStatus()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const validateSession = async () => {
      setAuthReady(false)

      if (!databaseStatusReady || databaseStatus?.needsSetup) {
        if (!cancelled && databaseStatus?.needsSetup) {
          setAuthReady(true)
        }
        return
      }

      if (!token) {
        if (!cancelled) {
          setAuthReady(true)
        }
        return
      }

      try {
        const response = await api.get('/auth/me')
        if (!cancelled) {
          updateUser(response.data)
        }
      } catch (_error) {
        if (!cancelled) {
          logout()
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true)
        }
      }
    }

    void validateSession()

    return () => {
      cancelled = true
    }
  }, [databaseStatusReady, databaseStatus?.needsSetup, token, updateUser, logout])

  if (!databaseStatusReady || !authReady) {
    return <RouteLoader />
  }

  if (databaseStatus?.needsSetup) {
    return (
      <>
        <AppToaster />
        <Suspense fallback={<RouteLoader />}>
          <DatabaseSetup initialStatus={databaseStatus} />
        </Suspense>
      </>
    )
  }

  return (
    <Router>
      <AppToaster />

      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />

          <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/services" element={<Services />} />
            <Route path="/products" element={<Products />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/cash" element={<Cash />} />
            <Route
              path="/reports"
              element={
                <AdminOnlyRoute>
                  <Reports />
                </AdminOnlyRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <AdminOnlyRoute>
                  <Accounts />
                </AdminOnlyRoute>
              }
            />
            <Route path="/ranking" element={<ClientRanking />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/sql"
              element={
                <AdminOnlyRoute>
                  <Sql />
                </AdminOnlyRoute>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App

