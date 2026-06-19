export interface DashboardCardConfig {
  calories: boolean;
  weight: boolean;
  measurements: boolean;
  lifts: boolean;
  selectedMeasurement: string;
  selectedLift: string;
  trendRange: '7d' | '30d' | '90d';
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
