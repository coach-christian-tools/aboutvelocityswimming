import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { WORKSHARE_PATH } from './lib/routes'
const Login = lazy(() => import("./components/auth/Login").then(module => ({ default: module.Login })))
const FamiliesAdmin = lazy(() => import("./components/admin/Families").then(module => ({ default: module.FamiliesAdmin })))
const FamilyDetailAdmin = lazy(() => import("./components/admin/FamilyDetail").then(module => ({ default: module.FamilyDetailAdmin })))
const RegistrationsAdmin = lazy(() => import("./components/admin/Registrations").then(module => ({ default: module.RegistrationsAdmin })))
const JobBoard = lazy(() => import("./components/jobs/JobBoard").then(module => ({ default: module.JobBoard })))
const FamilyDashboard = lazy(() => import("./components/dashboard/FamilyDashboard").then(module => ({ default: module.FamilyDashboard })))
const GuestProxy = lazy(() => import("./components/guest/GuestProxy").then(module => ({ default: module.GuestProxy })))
const Settings = lazy(() => import("./components/admin/Settings").then(module => ({ default: module.Settings })))
const VolunteerLogs = lazy(() => import("./components/dashboard/VolunteerLogs").then(module => ({ default: module.VolunteerLogs })))

function App() {
  return (
    <BrowserRouter basename={WORKSHARE_PATH}>
      <AuthProvider>
      <Suspense fallback={<div role="status" className="p-12 text-center text-slate-500">Loading portal...</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/guest" element={<GuestProxy />} />

          <Route path="/" element={<ProtectedRoute><MainLayout><FamilyDashboard /></MainLayout></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><MainLayout><VolunteerLogs /></MainLayout></ProtectedRoute>} />
          <Route path="/jobs" element={<ProtectedRoute><MainLayout><JobBoard /></MainLayout></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin/families" element={<ProtectedRoute requireAdmin><MainLayout isAdmin><FamiliesAdmin /></MainLayout></ProtectedRoute>} />
          <Route path="/admin/families/:familyId" element={<ProtectedRoute requireAdmin><MainLayout isAdmin><FamilyDetailAdmin /></MainLayout></ProtectedRoute>} />
          <Route path="/admin/roster" element={<ProtectedRoute requireAdmin><MainLayout isAdmin><RegistrationsAdmin /></MainLayout></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><MainLayout isAdmin><Settings /></MainLayout></ProtectedRoute>} />
          <Route path="*" element={<main className="p-12 text-center"><h1 className="text-2xl font-semibold">Workshare page not found</h1><a className="underline" href={WORKSHARE_PATH}>Go to Workshare</a></main>} />
        </Routes>
      </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
