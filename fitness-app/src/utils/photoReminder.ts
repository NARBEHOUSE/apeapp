import { localDateStr } from './dateHelpers';

export type PhotoReminderMode = 'interval' | 'weekdays';

export interface PhotoReminderSchedule {
  enabled: boolean;
  /** 'interval' fires N days after the last photo; 'weekdays' fires on fixed days of the week. */
  mode: PhotoReminderMode;
  /** Days between photos, used when mode is 'interval'. */
  intervalDays: number;
  /** Days the reminder fires when mode is 'weekdays'. 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Local time of day ('HH:MM') the reminder becomes due on a scheduled day. */
  timeOfDay: string;
}

const DEFAULT_SCHEDULE: PhotoReminderSchedule = {
  enabled: false,
  mode: 'interval',
  intervalDays: 14,
  weekdays: [1],
  timeOfDay: '09:00',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const INTERVAL_OPTIONS = [3, 7, 14, 21, 30];

/** Marker used when an interval reminder has no previous photo to count from. */
const START_OCCASION = 'start';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function scheduleKey(profileId: string): string {
  return `fitos-photo-reminder-${profileId}`;
}

function notifiedKey(profileId: string): string {
  return `fitos-photo-reminder-notified-${profileId}`;
}

// Stored schedules predate `mode`, `weekdays`, and `timeOfDay`, and a schedule can also
// come back from an edited backup, so every field is validated rather than trusted.
function normalizeSchedule(raw: unknown): PhotoReminderSchedule {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCHEDULE;
  const r = raw as Partial<PhotoReminderSchedule>;

  return {
    enabled: r.enabled === true,
    // Schedules saved before day-of-week support existed were always interval-based.
    mode: r.mode === 'weekdays' ? 'weekdays' : 'interval',
    intervalDays:
      typeof r.intervalDays === 'number' && Number.isFinite(r.intervalDays) && r.intervalDays >= 1
        ? Math.round(r.intervalDays)
        : DEFAULT_SCHEDULE.intervalDays,
    // An empty selection is preserved (it means "no day picked yet"), not silently defaulted.
    weekdays: Array.isArray(r.weekdays)
      ? [...new Set(r.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
      : DEFAULT_SCHEDULE.weekdays,
    timeOfDay:
      typeof r.timeOfDay === 'string' && TIME_PATTERN.test(r.timeOfDay)
        ? r.timeOfDay
        : DEFAULT_SCHEDULE.timeOfDay,
  };
}

export function getPhotoReminderSchedule(profileId: string): PhotoReminderSchedule {
  try {
    const raw = localStorage.getItem(scheduleKey(profileId));
    if (!raw) return DEFAULT_SCHEDULE;
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function savePhotoReminderSchedule(profileId: string, schedule: PhotoReminderSchedule): void {
  localStorage.setItem(scheduleKey(profileId), JSON.stringify(normalizeSchedule(schedule)));
}

export function daysSincePhoto(lastPhotoDate: string | null): number | null {
  if (!lastPhotoDate) return null;
  const last = new Date(lastPhotoDate + 'T00:00:00');
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/** True once `timeOfDay` on `dateStr` has passed — always true for a date already in the past. */
function timeReached(dateStr: string, timeOfDay: string, now: Date): boolean {
  const [h, m] = timeOfDay.split(':').map(Number);
  const target = new Date(dateStr + 'T00:00:00');
  target.setHours(h, m, 0, 0);
  return now.getTime() >= target.getTime();
}

/**
 * The date of the reminder occasion currently outstanding, or null when nothing is due.
 *
 * Returning the occasion date rather than a bare boolean lets the notifier fire once per
 * occasion: a weekly reminder re-notifies each scheduled day, instead of going quiet
 * forever after the first one.
 */
export function photoReminderDueSince(
  schedule: PhotoReminderSchedule,
  lastPhotoDate: string | null,
  now: Date = new Date(),
): string | null {
  if (!schedule.enabled) return null;

  if (schedule.mode === 'weekdays') {
    if (schedule.weekdays.length === 0) return null;
    // Walk back from today to the most recent scheduled day whose time has arrived. Walking
    // (rather than only looking at today) keeps a missed day outstanding until a photo is
    // taken, and stops as soon as a scheduled day is already covered by a photo.
    for (let back = 0; back < 14; back++) {
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      if (!schedule.weekdays.includes(d.getDay())) continue;
      const dateStr = localDateStr(d);
      if (lastPhotoDate != null && lastPhotoDate >= dateStr) return null;
      if (timeReached(dateStr, schedule.timeOfDay, now)) return dateStr;
    }
    return null;
  }

  // Interval mode: with no photo yet there is nothing to count from, so it is due immediately.
  if (!lastPhotoDate) return START_OCCASION;
  const occasion = addDays(lastPhotoDate, schedule.intervalDays);
  return timeReached(occasion, schedule.timeOfDay, now) ? occasion : null;
}

/** The next date the reminder will fire, or null if it can never fire as configured. */
export function nextPhotoReminderDate(
  schedule: PhotoReminderSchedule,
  lastPhotoDate: string | null,
  now: Date = new Date(),
): string | null {
  if (!schedule.enabled) return null;

  if (schedule.mode === 'weekdays') {
    if (schedule.weekdays.length === 0) return null;
    for (let ahead = 0; ahead < 8; ahead++) {
      const d = new Date(now);
      d.setDate(d.getDate() + ahead);
      if (!schedule.weekdays.includes(d.getDay())) continue;
      const dateStr = localDateStr(d);
      if (ahead === 0 && timeReached(dateStr, schedule.timeOfDay, now)) continue;
      return dateStr;
    }
    return null;
  }

  if (!lastPhotoDate) return localDateStr(now);
  return addDays(lastPhotoDate, schedule.intervalDays);
}

/** '09:00' → '9:00 AM' */
export function formatReminderTime(timeOfDay: string): string {
  const [h, m] = timeOfDay.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Short human summary of the schedule, e.g. 'Mon, Thu at 9:00 AM'. */
export function describePhotoReminder(schedule: PhotoReminderSchedule): string {
  if (!schedule.enabled) return 'Off';
  const at = `at ${formatReminderTime(schedule.timeOfDay)}`;

  if (schedule.mode === 'weekdays') {
    if (schedule.weekdays.length === 0) return 'No days selected';
    if (schedule.weekdays.length === 7) return `Every day ${at}`;
    return `${schedule.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')} ${at}`;
  }

  const every = schedule.intervalDays === 1 ? 'Every day' : `Every ${schedule.intervalDays} days`;
  return `${every} ${at}`;
}

// Fire at most one browser notification per due occasion, so reopening the app during the
// same occasion doesn't re-notify.
export function notifyPhotoReminderIfDue(profileId: string, lastPhotoDate: string | null): void {
  const occasion = photoReminderDueSince(getPhotoReminderSchedule(profileId), lastPhotoDate);
  if (!occasion) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  if (localStorage.getItem(notifiedKey(profileId)) === occasion) return;

  try {
    new Notification('Progress Photo Reminder', {
      body: "It's time for your scheduled progress photo.",
      icon: '/icons/icon-192.png',
      tag: 'photo-reminder',
      requireInteraction: false,
    });
    localStorage.setItem(notifiedKey(profileId), occasion);
  } catch {
    // ignore — notifications are best-effort
  }
}
