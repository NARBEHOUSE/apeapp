import { useState, useCallback } from 'react';
import { getDashboardConfig, saveDashboardConfig } from '../utils/dashboardConfig';
import { toDisplayWeight, fromDisplayWeight, type WeightUnit } from '../utils/units';

export function useWeightUnit() {
  const [unit, setUnitState] = useState<WeightUnit>(() => getDashboardConfig().weightUnit ?? 'lbs');

  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u);
    const config = getDashboardConfig();
    saveDashboardConfig({ ...config, weightUnit: u });
  }, []);

  return { unit, setUnit, toDisplay: (lbs: number) => toDisplayWeight(lbs, unit), fromDisplay: (v: number) => fromDisplayWeight(v, unit) };
}
