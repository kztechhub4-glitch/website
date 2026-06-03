import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Catalog from './pages/store/Catalog'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Storefront */}
        <Route path="/" element={<Catalog />} />

        {/* Admin Dashboard */}
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
