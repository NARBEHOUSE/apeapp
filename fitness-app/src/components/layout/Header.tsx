import { LogOut } from 'lucide-react';

interface Props {
  profileName: string;
  onLogout: () => void;
}

export function Header({ profileName, onLogout }: Props) {
  return (
    <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-lg">
      <div className="flex items-center justify-between px-5 h-12 max-w-lg mx-auto">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="APE"
          className="h-6 invert brightness-200"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted font-medium">{profileName}</span>
          <button onClick={onLogout} className="p-1.5 rounded-lg hover:bg-surface">
            <LogOut size={14} className="text-text-muted" />
          </button>
        </div>
      </div>
    </header>
  );
}
