import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, TrendingUp, Settings } from 'lucide-react';

const tabs = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/workout', label: 'Train', icon: Dumbbell },
  { path: '/nutrition', label: 'Eat', icon: Apple },
  { path: '/progress', label: 'Track', icon: TrendingUp },
  { path: '/settings', label: 'More', icon: Settings },
];

function hasPendingCoachChanges(): boolean {
  return localStorage.getItem('fitos-pending-coach-changes') === '1';
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [coachDot, setCoachDot] = useState(hasPendingCoachChanges);

  useEffect(() => {
    const check = () => setCoachDot(hasPendingCoachChanges());
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [location.pathname]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-bg/90 backdrop-blur-lg safe-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = location.pathname.startsWith(tab.path);
          const Icon = tab.icon;
          const showDot = tab.path === '/settings' && coachDot;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors text-text-muted"
              style={active ? { color: 'var(--color-nav-active)' } : undefined}
            >
              <div className="relative">
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {showDot && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent-orange rounded-full" />
                )}
              </div>
              <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
