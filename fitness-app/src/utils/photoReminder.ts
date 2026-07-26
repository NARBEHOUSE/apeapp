export interface PhotoReminderSchedule {
  enabled: boolean;
  intervalDays: number;
}

const DEFAULT_SCHEDULE: PhotoReminderSchedule = { enabled: false, intervalDays: 14 };

function scheduleKey(profileId: string): string {
  return `fitos-photo-reminder-${profileId}`;
}

function notifiedKey(profileId: string): string {
  return `fitos-photo-reminder-notified-${profileId}`;
}

export function getPhotoReminderSchedule(profileId: string): PhotoReminderSchedule {
  try {
    const raw = localStorage.getItem(scheduleKey(profileId));
    if (!raw) return DEFAULT_SCHEDULE;
    return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function savePhotoReminderSchedule(profileId: string, schedule: PhotoReminderSchedule): void {
  localStorage.setItem(scheduleKey(profileId), JSON.stringify(schedule));
}

export function daysSincePhoto(lastPhotoDate: string | null): number | null {
  if (!lastPhotoDate) return null;
  const last = new Date(lastPhotoDate + 'T00:00:00');
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

export function isPhotoReminderDue(profileId: string, lastPhotoDate: string | null): boolean {
  const schedule = getPhotoReminderSchedule(profileId);
  if (!schedule.enabled) return false;
  const days = daysSincePhoto(lastPhotoDate);
  if (days == null) return true;
  return days >= schedule.intervalDays;
}

// Fire at most one browser notification per due period (tracked by the last photo
// date the notification was raised for), so reopening the app doesn't re-notify.
export function notifyPhotoReminderIfDue(profileId: string, lastPhotoDate: string | null): void {
  if (!isPhotoReminderDue(profileId, lastPhotoDate)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const marker = lastPhotoDate || 'never';
  if (localStorage.getItem(notifiedKey(profileId)) === marker) return;

  try {
    new Notification('Progress Photo Reminder', {
      body: "It's time for your scheduled progress photo.",
      icon: '/icons/icon-192.png',
      tag: 'photo-reminder',
      requireInteraction: false,
    });
    localStorage.setItem(notifiedKey(profileId), marker);
  } catch {
    // ignore — notifications are best-effort
  }
}

export function requestPhotoReminderPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
