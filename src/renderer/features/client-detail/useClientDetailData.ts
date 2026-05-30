import { useEffect, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { ClientAssetsResponse } from '../../utils/desktop'
import toast from 'react-hot-toast'
import {
  fetchAccountBalanceHistory,
  fetchClientAssets,
  fetchClientDetail,
  fetchClientQuotes
} from './clientDetailApi'
import type {
  ClientDetailAccountBalanceMovement,
  ClientDetailClient,
  ClientDetailQuote
} from './types'

type UseClientDetailDataArgs = {
  clientId?: string
  navigate: NavigateFunction
}

export const useClientDetailData = ({ clientId, navigate }: UseClientDetailDataArgs) => {
  const [client, setClient] = useState<ClientDetailClient | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientQuotes, setClientQuotes] = useState<ClientDetailQuote[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [clientAssets, setClientAssets] = useState<ClientAssetsResponse | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [accountBalanceHistory, setAccountBalanceHistory] = useState<ClientDetailAccountBalanceMovement[]>([])
  const [accountBalanceLoading, setAccountBalanceLoading] = useState(false)

  const refreshAccountBalanceHistory = async (targetClientId: string) => {
    try {
      setAccountBalanceLoading(true)
      const response = await fetchAccountBalanceHistory(targetClientId)
      const movements = Array.isArray(response?.movements) ? response.movements : []
      setAccountBalanceHistory(movements)
      const currentBalance = Number(response?.currentBalance || 0)
      setClient((current) => (current ? { ...current, accountBalance: currentBalance } : current))
    } catch (error) {
      console.error('Error loading account balance history:', error)
      toast.error('No se pudo cargar el historial de abonos')
      setAccountBalanceHistory([])
    } finally {
      setAccountBalanceLoading(false)
    }
  }

  const refreshClientQuotes = async (targetClientId: string) => {
    try {
      setQuotesLoading(true)
      const nextQuotes = await fetchClientQuotes(targetClientId)
      setClientQuotes(nextQuotes)
    } catch (error) {
      console.error('Error loading quotes:', error)
      toast.error('No se pudieron cargar los presupuestos')
      setClientQuotes([])
    } finally {
      setQuotesLoading(false)
    }
  }

  const refreshClientAssets = async (targetClient: ClientDetailClient) => {
    if (!targetClient?.id) return

    try {
      setAssetsLoading(true)
      const assets = await fetchClientAssets(targetClient)
      setClientAssets(assets)
    } catch (error) {
      console.error('Error loading client assets:', error)
      setClientAssets(null)
    } finally {
      setAssetsLoading(false)
    }
  }

  const refreshClient = async () => {
    if (!clientId) return

    try {
      const nextClient = await fetchClientDetail(clientId)
      setClient(nextClient)
      setLoading(false)
      void refreshAccountBalanceHistory(nextClient.id)
      void refreshClientQuotes(nextClient.id)
      void refreshClientAssets(nextClient)
    } catch (error) {
      console.error('Error fetching client:', error)
      toast.error('Error al cargar el cliente')
      navigate('/clients')
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshClient()
  }, [clientId])

  return {
    accountBalanceHistory,
    accountBalanceLoading,
    assetsLoading,
    client,
    clientAssets,
    clientQuotes,
    loading,
    quotesLoading,
    refreshAccountBalanceHistory,
    refreshClient,
    refreshClientQuotes,
    setAssetsLoading,
    setClientAssets,
    setClient
  }
}
