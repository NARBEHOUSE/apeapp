import { useEffect } from 'react';
import { getLatestPhotoDate } from '../db/progress';
import {
  ensurePhotoReminderAnchor,
  getPhotoReminderSchedule,
  notifyPhotoReminderIfDue,
} from '../utils/photoReminder';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Fires the scheduled progress-photo notification from anywhere in the app, so a reminder
 * doesn't wait for the user to open the Progress page — which is where they'd be going
 * anyway. Best-effort by nature: the browser only delivers this while APE is running, so
 * the Progress tab also shows an in-app banner for anyone who missed the notification.
 */
export function usePhotoReminderNotifier(profileId: string | null) {
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function check(id: string) {
      if (document.visibilityState !== 'visible') return;
      // Bail before touching IndexedDB when there is no reminder to act on at all.
      if (!getPhotoReminderSchedule(id).enabled) return;

      try {
        const lastPhotoDate = await getLatestPhotoDate(id);
        if (cancelled) return;
        // Runs regardless of notification permission — the anchor also drives the in-app banner.
        ensurePhotoReminderAnchor(id, lastPhotoDate);
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        notifyPhotoReminderIfDue(id, lastPhotoDate);
      } catch {
        // Reminders are best-effort — a failed read just means no notification this tick.
      }
    }

    const onVisibility = () => check(profileId);

    check(profileId);
    const timer = setInterval(() => check(profileId), CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [profileId]);
}
