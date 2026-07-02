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
        📥 Wczytaj dane
      </button>
      <button
        className={`nav-item ${isActive('dashboard')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('dashboard')}
        disabled={!dataLoaded}
      >
        📈 Pulpit
      </button>
      <button
        className={`nav-item ${isActive('predictions')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('predictions')}
        disabled={!dataLoaded}
      >
        🔮 Prognozy
      </button>
      <button
        className={`nav-item ${isActive('chat')} ${!dataLoaded ? 'disabled' : ''}`}
        onClick={() => dataLoaded && onNavigate('chat')}
        disabled={!dataLoaded}
      >
        💬 Czat
      </button>
      <button
        className={`nav-item ${isActive('outcomes')}`}
        onClick={() => onNavigate('outcomes')}
      >
        🎓 Efekty kształcenia
      </button>
      <button
        className={`nav-item ${isActive('kierunkowe')}`}
        onClick={() => onNavigate('kierunkowe')}
      >
        🏛 Rejestr efektów wg kierunków
      </button>
      <button
        className={`nav-item ${isActive('analiza')}`}
        onClick={() => onNavigate('analiza')}
      >
        🧬 Analiza porównawcza
      </button>
      <button
        className={`nav-item ${isActive('tresci')}`}
        onClick={() => onNavigate('tresci')}
      >
        📖 Analiza treści
      </button>
      <button
        className={`nav-item ${isActive('planner')}`}
        onClick={() => onNavigate('planner')}
      >
        🗺 Zaplanuj swoje studia
      </button>
      <button
        className={`nav-item ${isActive('jobmarket')}`}
        onClick={() => onNavigate('jobmarket')}
      >
        💼 Rynek pracy → Program
      </button>
    </nav>
  )
}
