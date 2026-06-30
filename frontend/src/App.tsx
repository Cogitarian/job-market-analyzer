import { useState, useEffect } from 'react'
import './App.css'
import Header from './components/Header'
import Navigation from './components/Navigation'
import DataLoader from './pages/DataLoader'
import Dashboard from './pages/Dashboard'
import Predictions from './pages/Predictions'
import Chat from './pages/Chat'

type PageType = 'data' | 'dashboard' | 'predictions' | 'chat'

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
        </main>
      </div>
    </div>
  )
}

export default App
