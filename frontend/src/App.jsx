import { Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import PublicLayout from './layouts/PublicLayout';
import LandingPage from './pages/LandingPage';
import About from './pages/About';
import Contact from './pages/Contact';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import InstructorDashboard from './pages/InstructorDashboard';
import DeptHeadDashboard from './pages/DeptHeadDashboard';
import SystemAdminDashboard from './pages/SystemAdminDashboard';
import ChangePassword from './pages/ChangePassword';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import CollegeDeanDashboard from './pages/CollegeDeanDashboard';
import DirectorateDashboard from './pages/DirectorateDashboard';
import LabAssistantDashboard from './pages/LabAssistantDashboard';
import VicePresidentDashboard from './pages/VicePresidentDashboard';
import Unauthorized from './pages/Unauthorized';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { EvaluationProvider } from './context/EvaluationContext';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <EvaluationProvider>
          <ThemeProvider>
          <div className="min-h-screen flex flex-col bg-white dark:bg-black text-black dark:text-white">
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#22c55e',
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
      <main className="flex-grow">
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
          </Route>
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/student-dashboard" element={<ProtectedRoute allowedRoles={['student']}><DashboardLayout role="student"><StudentDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/instructor-dashboard" element={<ProtectedRoute allowedRoles={['instructor', 'teacher', 'dept_head', 'department_head']}><DashboardLayout role="instructor"><InstructorDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/lab-assistant/dashboard" element={<ProtectedRoute allowedRoles={['lab_assistant']}><DashboardLayout role="lab_assistant"><LabAssistantDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['systemadmin']}><DashboardLayout role="systemadmin"><SystemAdminDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['systemadmin']}><DashboardLayout role="systemadmin"><SystemAdminDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/dept-head/dashboard" element={<ProtectedRoute allowedRoles={['depthead']}><DashboardLayout role="depthead"><DeptHeadDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/depthead-dashboard" element={<ProtectedRoute allowedRoles={['depthead']}><DashboardLayout role="depthead"><DeptHeadDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/dept-head-dashboard" element={<ProtectedRoute allowedRoles={['dept_head', 'department_head', 'head', 'admin']}><DashboardLayout role="depthead"><DeptHeadDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/system-admin-dashboard" element={<ProtectedRoute allowedRoles={['systemadmin']}><DashboardLayout role="systemadmin"><SystemAdminDashboard /></DashboardLayout></ProtectedRoute>} />
          <Route element={<ProtectedRoute allowedRoles={['college_dean', 'dean']}><DashboardLayout role="college_dean" title="College Dean Dashboard" subtitle="College performance, approvals, and announcements." /></ProtectedRoute>}>
            <Route path="/dean/dashboard" element={<CollegeDeanDashboard />} />
            <Route path="/dean-dashboard" element={<CollegeDeanDashboard />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['academic_directorate', 'academic_director', 'directorate']}><DashboardLayout role="academic_directorate" title="Academic Directorate Dashboard" subtitle="University-wide evaluation oversight and cycle control." /></ProtectedRoute>}>
            <Route path="/directorate/dashboard" element={<DirectorateDashboard />} />
            <Route path="/directorate-dashboard" element={<DirectorateDashboard />} />
          </Route>
          <Route path="/vice-president-dashboard" element={<ProtectedRoute allowedRoles={['academic_vice_president']}><DashboardLayout role="academic_vice_president" title="Vice President Dashboard" subtitle="Evaluate Academic Directorate performance and review submitted evaluations."><VicePresidentDashboard /></DashboardLayout></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
          </ThemeProvider>
        </EvaluationProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;