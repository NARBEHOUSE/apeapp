import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

interface Props {
  children: ReactNode;
  profileName: string;
  onLogout: () => void;
}

export function Layout({ children, profileName, onLogout }: Props) {
  return (
    <div className="min-h-screen bg-bg">
      <Header profileName={profileName} onLogout={onLogout} />
      <main className="max-w-lg mx-auto px-5 pt-2 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
