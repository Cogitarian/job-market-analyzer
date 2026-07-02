import { useState } from 'react'
import './App.css'
import Header from './components/Header'
import Navigation from './components/Navigation'
import DataLoader from './pages/DataLoader'
import Dashboard from './pages/Dashboard'
import Predictions from './pages/Predictions'
import Chat from './pages/Chat'
import OutcomesExplorer from './pages/OutcomesExplorer'
import KierunkoweEfekty from './pages/KierunkoweEfekty'
import EfektyAnalysis from './pages/EfektyAnalysis'
import TresciAnalysis from './pages/TresciAnalysis'
import StudyPlanner from './pages/StudyPlanner'
import JobMarketPlanner from './pages/JobMarketPlanner'

type PageType = 'data' | 'dashboard' | 'predictions' | 'chat' | 'outcomes' | 'kierunkowe' | 'analiza' | 'tresci' | 'planner' | 'jobmarket'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('data')
  const [dataLoaded, setDataLoaded] = useState(false)

  return (
    <div className="app">
      <Header />
      <div className="app-container">
        <Navigation currentPage={currentPage} onNavigate={setCurrentPage} dataLoaded={dataLoaded} />
        <main className="main-content">
          {currentPage === 'data' && <DataLoader onDataLoaded={() => setDataLoaded(true)} />}
          {currentPage === 'dashboard' && dataLoaded && <Dashboard />}
          {currentPage === 'predictions' && dataLoaded && <Predictions />}
          {currentPage === 'chat' && dataLoaded && <Chat />}
          {currentPage === 'outcomes' && <OutcomesExplorer />}
          {currentPage === 'kierunkowe' && <KierunkoweEfekty />}
          {currentPage === 'analiza' && <EfektyAnalysis />}
          {currentPage === 'tresci' && <TresciAnalysis />}
          {currentPage === 'planner' && <StudyPlanner />}
          {currentPage === 'jobmarket' && <JobMarketPlanner />}
        </main>
      </div>
    </div>
  )
}

export default App
