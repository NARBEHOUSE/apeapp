export interface DashboardCardConfig {
  calories: boolean;
  weight: boolean;
  measurements: boolean;
  lifts: boolean;
  selectedMeasurement: string;
  selectedLift: string;
  trendRange: '7d' | '30d' | '90d';
  workoutCounter: boolean;
  checkInReminder: boolean;
  checkInFrequency: 'daily' | 'weekly' | 'biweekly';
  aiCoach: boolean;
  steps: boolean;
  water: boolean;
  calendar: boolean;
  aiVoice: boolean;
  weightUnit: 'lbs' | 'kg';
  cardOrder?: string[];
}

const STORAGE_KEY = 'fitos-dashboard-cards';

const DEFAULTS: DashboardCardConfig = {
  calories: true,
  weight: true,
  measurements: false,
  lifts: false,
  selectedMeasurement: 'waist',
  selectedLift: '',
  trendRange: '30d',
  workoutCounter: true,
  checkInReminder: true,
  checkInFrequency: 'daily',
  aiCoach: false,
  steps: false,
  water: true,
  calendar: false,
  aiVoice: false,
  weightUnit: 'lbs',
};

export function getDashboardConfig(): DashboardCardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveDashboardConfig(config: DashboardCardConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
