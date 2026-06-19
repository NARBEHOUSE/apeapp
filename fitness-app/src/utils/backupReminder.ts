const LAST_BACKUP_KEY = 'fitos-last-backup';
const REMINDER_INTERVAL_DAYS = 7;

export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function markBackupDone(): void {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString().split('T')[0]);
}

export function shouldShowBackupReminder(): boolean {
  const last = getLastBackupDate();
  if (!last) return true;

  const lastDate = new Date(last + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= REMINDER_INTERVAL_DAYS;
}

export function daysSinceBackup(): number | null {
  const last = getLastBackupDate();
  if (!last) return null;
  const lastDate = new Date(last + 'T00:00:00');
  const now = new Date();
  return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
}
