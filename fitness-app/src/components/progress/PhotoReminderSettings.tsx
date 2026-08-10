import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { formatDate, today } from '../../utils/dateHelpers';
import {
  INTERVAL_OPTIONS,
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  describePhotoReminder,
  formatReminderTime,
  nextPhotoReminderDate,
  type PhotoReminderMode,
  type PhotoReminderSchedule,
} from '../../utils/photoReminder';

interface Props {
  schedule: PhotoReminderSchedule;
  onChange: (updates: Partial<PhotoReminderSchedule>) => void;
  lastPhotoDate: string | null;
}

const MODES: { value: PhotoReminderMode; label: string }[] = [
  { value: 'interval', label: 'Every X days' },
  { value: 'weekdays', label: 'Days of week' },
];

type PermissionState = 'unsupported' | 'granted' | 'denied' | 'default';

function notificationState(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function PhotoReminderSettings({ schedule, onChange, lastPhotoDate }: Props) {
  // Tracked in state rather than read on every render so the notice below updates as soon as
  // the browser prompt is answered.
  const [permission, setPermission] = useState<PermissionState>(notificationState);
  const nextDate = nextPhotoReminderDate(schedule, lastPhotoDate);
  const noDaysPicked = schedule.mode === 'weekdays' && schedule.weekdays.length === 0;

  function askPermission() {
    if (notificationState() !== 'default') return;
    Notification.requestPermission()
      .then(setPermission)
      .catch(() => {
        // Prompt dismissed or unavailable — the in-app banner still covers the reminder.
      });
  }

  function toggleWeekday(day: number) {
    const next = schedule.weekdays.includes(day)
      ? schedule.weekdays.filter((d) => d !== day)
      : [...schedule.weekdays, day].sort((a, b) => a - b);
    onChange({ weekdays: next });
  }

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {schedule.enabled ? (
            <Bell size={14} className="text-accent-blue" />
          ) : (
            <BellOff size={14} className="text-text-muted" />
          )}
          <div>
            <div className="text-xs font-semibold text-text-secondary">Photo Reminder</div>
            <div className="text-[0.625rem] text-text-muted">{describePhotoReminder(schedule)}</div>
          </div>
        </div>
        <button
          onClick={() => {
            const next = !schedule.enabled;
            // Re-anchor on every switch-on so an interval reminder counts from now rather
            // than from a stale date, which would read as instantly overdue.
            onChange(next ? { enabled: true, anchorDate: today() } : { enabled: false });
            if (next) askPermission();
          }}
          aria-label={schedule.enabled ? 'Turn photo reminder off' : 'Turn photo reminder on'}
          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
            schedule.enabled ? 'bg-accent-blue' : 'bg-surface-raised'
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              schedule.enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {schedule.enabled && (
        <div className="space-y-3 pt-1">
          {/* How often */}
          <div className="flex bg-surface-raised rounded-lg p-0.5 gap-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onChange({ mode: m.value })}
                className={`flex-1 py-1.5 rounded-md text-[0.625rem] font-semibold transition-colors ${
                  schedule.mode === m.value ? 'bg-accent-blue text-white' : 'text-text-muted'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {schedule.mode === 'interval' ? (
            <div className="space-y-1.5">
              <div className="text-[0.625rem] text-text-muted">Remind me this many days after my last photo</div>
              <div className="flex gap-1.5">
                {INTERVAL_OPTIONS.map((days) => (
                  <button
                    key={days}
                    onClick={() => onChange({ intervalDays: days })}
                    className={`flex-1 py-1.5 rounded-lg text-[0.6875rem] font-semibold transition-colors ${
                      schedule.intervalDays === days
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-raised text-text-muted border border-border-light'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[0.625rem] text-text-muted">Remind me on these days</div>
              <div className="flex gap-1.5">
                {WEEKDAY_INITIALS.map((initial, day) => {
                  const active = schedule.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleWeekday(day)}
                      aria-label={WEEKDAY_LABELS[day]}
                      aria-pressed={active}
                      className={`flex-1 aspect-square rounded-lg text-[0.6875rem] font-semibold transition-colors ${
                        active
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-raised text-text-muted border border-border-light'
                      }`}
                    >
                      {initial}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time of day */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[0.625rem] text-text-muted">Time of day</div>
            <input
              type="time"
              value={schedule.timeOfDay}
              onChange={(e) => {
                // An empty or partial value from the time input would clear a valid setting.
                if (e.target.value) onChange({ timeOfDay: e.target.value });
              }}
              className="input-field text-xs py-1.5 px-2 w-auto"
            />
          </div>

          {/* Strict vs. catch-up */}
          <div className="flex items-start justify-between gap-3 pt-0.5">
            <div>
              <div className="text-[0.6875rem] font-medium text-text-secondary">Keep showing if I miss it</div>
              <div className="text-[0.625rem] text-text-muted">
                {schedule.catchUpMissed
                  ? 'A missed reminder stays up until you take the photo.'
                  : 'Reminds you only on the scheduled day and time.'}
              </div>
            </div>
            <button
              onClick={() => onChange({ catchUpMissed: !schedule.catchUpMissed })}
              aria-label="Keep showing a missed reminder"
              aria-pressed={schedule.catchUpMissed}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
                schedule.catchUpMissed ? 'bg-accent-blue' : 'bg-surface-raised border border-border-light'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  schedule.catchUpMissed ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Next fire / setup problems */}
          {noDaysPicked ? (
            <div className="text-[0.625rem] text-warning">Pick at least one day for the reminder to fire.</div>
          ) : (
            nextDate && (
              <div className="text-[0.625rem] text-text-muted">
                Next reminder: <span className="text-text-secondary font-medium">{formatDate(nextDate)}</span> at{' '}
                {formatReminderTime(schedule.timeOfDay)}
              </div>
            )
          )}

          {permission === 'denied' && (
            <div className="text-[0.625rem] text-warning">
              Notifications are blocked for this site, so only the in-app banner will appear. Re-enable them in
              your browser's site settings.
            </div>
          )}
          {permission === 'default' && (
            <button
              onClick={askPermission}
              className="text-[0.625rem] text-accent-blue font-semibold underline"
            >
              Allow notifications
            </button>
          )}
          {permission === 'unsupported' && (
            <div className="text-[0.625rem] text-text-muted">
              This browser can't show notifications — the in-app banner will still appear.
            </div>
          )}
          <div className="text-[0.625rem] text-text-muted">
            Notifications are delivered while APE is open.{' '}
            {schedule.catchUpMissed
              ? "If it isn't running at the scheduled time, the reminder waits for you here."
              : "If it isn't running at the scheduled time, that reminder is skipped — turn on “Keep showing” above if you'd rather see it late."}
          </div>
        </div>
      )}
    </div>
  );
}
