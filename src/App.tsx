import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ChatInterface } from './components/ChatInterface';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-blue-500 text-lg font-semibold">Loading...</div>
      </div>
    );
  }

  return user ? <ChatInterface /> : <Auth />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
