import './Navigation.css'

interface NavigationProps {
  currentPage: string
  onNavigate: (page: any) => void
  dataLoaded: boolean
}

export default function Navigation({ currentPage, onNavigate, dataLoaded }: NavigationProps) {
  const isActive = (page: string) => currentPage === page ? 'active' : ''

  return (
    <nav className="navigation">
      <button
        className={`nav-item ${isActive('data')}`}
        onClick={() => onNavigate('data')}
      >
        📥 Data Loader
      </button>
      <button
        className={`nav-item ${isActive('dashboard')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('dashboard')}
        disabled={!dataLoaded}
      >
        📈 Dashboard
      </button>
      <button
        className={`nav-item ${isActive('predictions')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('predictions')}
        disabled={!dataLoaded}
      >
        🔮 Predictions
      </button>
      <button
        className={`nav-item ${isActive('chat')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('chat')}
        disabled={!dataLoaded}
      >
        💬 Chat
      </button>
    </nav>
  )
}
