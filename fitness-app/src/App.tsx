import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useProfile } from './hooks/useProfile';
import { Layout } from './components/layout/Layout';
import { ProfileSelector } from './pages/ProfileSelector';
import Dashboard from './pages/Dashboard';
import { Workout } from './pages/Workout';
import Nutrition from './pages/Nutrition';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { ToastContainer } from './components/shared/Toast';

function App() {
  const {
    profiles,
    activeProfile,
    createProfile,
    selectProfile,
    updateProfile,
    deleteProfile,
    logout,
    refreshProfiles,
  } = useProfile();

  if (!activeProfile) {
    return (
      <>
        <ProfileSelector
          profiles={profiles}
          onSelect={selectProfile}
          onCreate={createProfile}
          onDelete={deleteProfile}
          onRefresh={refreshProfiles}
        />
        <ToastContainer />
      </>
    );
  }

  return (
    <HashRouter>
      <Layout profileName={activeProfile.name} onLogout={logout}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard profile={activeProfile} />} />
          <Route path="/workout/*" element={<Workout profile={activeProfile} onUpdateProfile={updateProfile} />} />
          <Route path="/nutrition" element={<Nutrition profile={activeProfile} />} />
          <Route path="/progress" element={<Progress profile={activeProfile} />} />
          <Route
            path="/settings"
            element={
              <Settings
                profile={activeProfile}
                onUpdateProfile={updateProfile}
                profiles={profiles}
                onDeleteProfile={deleteProfile}
                onLogout={logout}
              />
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
      <ToastContainer />
    </HashRouter>
  );
}

export default App;
