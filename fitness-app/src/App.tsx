import { useEffect } from 'react';
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
import { GoogleAuthProvider, useGoogleAuth } from './contexts/GoogleAuthContext';

function AppContent() {
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
  const { isSignedIn } = useGoogleAuth();

  // If signed out of Google while on a Google-linked profile, kick back to profile selector
  useEffect(() => {
    if (!isSignedIn && activeProfile?.googleEmail) {
      logout();
    }
  }, [isSignedIn, activeProfile, logout]);

  if (!activeProfile || (!isSignedIn && activeProfile?.googleEmail)) {
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
          <Route path="/dashboard" element={<Dashboard profile={activeProfile} onUpdateProfile={updateProfile} />} />
          <Route path="/workout/*" element={<Workout profile={activeProfile} onUpdateProfile={updateProfile} />} />
          <Route path="/nutrition" element={<Nutrition profile={activeProfile} onUpdateProfile={updateProfile} />} />
          <Route path="/progress" element={<Progress profile={activeProfile} onUpdateProfile={updateProfile} />} />
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

function App() {
  return (
    <GoogleAuthProvider>
      <AppContent />
    </GoogleAuthProvider>
  );
}

export default App;
