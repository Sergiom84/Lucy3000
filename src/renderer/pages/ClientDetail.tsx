import { useParams } from 'react-router-dom'

export default function ClientDetail() {
  const { id } = useParams()

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Detalle del Cliente
      </h1>
      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Página en desarrollo - ID: {id}
        </p>
      </div>
    </div>
  )
}

