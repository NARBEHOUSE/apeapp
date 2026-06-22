import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Key,
  User,
  Database,
  Users,
  Info,
  Check,
  X,
  Download,
  Upload,
  Trash2,
  LogOut,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Calculator,
  TrendingUp,
  RefreshCw,
  LayoutDashboard,
  FileText,
  Loader2 as Loader2Icon,
  Palette,
  Cloud,
  CloudOff,
  UserPlus,
  UserX,
  Copy as CopyIcon,
  Send,
} from 'lucide-react';
import type { Profile, BodyStats, FitnessGoal, ActivityLevel, Gender } from '../types';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { hasCoachScope, requestCoachAccess } from '../utils/googleAuth';
import { useCoach } from '../hooks/useCoach';
import { ClientView } from '../components/coach/ClientView';
import { CoachHistory as CoachHistoryComponent } from '../components/coach/CoachHistory';
// USDA now uses Cloudflare Worker proxy — no user key needed
import { testClaudeKey } from '../utils/claudeVision';
import {
  exportAllData, downloadJSON, importData, clearAllData,
  exportProgram, importProgram, exportAllPrograms, importProgramsBundle,
  exportCustomFoods, importCustomFoods, exportCoachUpdate, importCoachUpdate, exportCoachPackage,
} from '../utils/exportImport';
import { importCSV, importMacroFactorXLSX, getSourceLabel, type ImportResult } from '../utils/csvImport';
import { getDashboardConfig, saveDashboardConfig, type DashboardCardConfig } from '../utils/dashboardConfig';
import { getActiveThemeId, setActiveTheme, type ThemeId } from '../utils/themes';
import { markBackupDone, getLastBackupDate } from '../utils/backupReminder';
import { generateReport, generateCSV, generateHTMLReport, generatePDFReport, downloadFile, openReportForPrint } from '../utils/reportGenerator';
import {
  calculateMacros,
  calculateTDEE,
  calculateAutoAdjustment,
  heightToCm,
  cmToFeetInches,
  lbsToKg,
  kgToLbs,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  GOAL_DESCRIPTIONS,
  type AutoAdjustResult,
} from '../utils/tdee';
import { getMeasurementsByProfile } from '../db/progress';
import { getAllPrograms } from '../db/programs';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Modal } from '../components/shared/Modal';
import { ImageCropper } from '../components/shared/ImageCropper';
import { toast } from '../components/shared/Toast';

interface Props {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  profiles: Profile[];
  onDeleteProfile: (id: string) => void;
  onLogout: () => void;
}

type Section = 'google' | 'coach' | 'theme' | 'api' | 'dashboard' | 'reports' | 'profile' | 'tdee' | 'data' | 'profiles' | 'about';

const REST_OPTIONS = [60, 90, 120];

export function Settings({ profile, onUpdateProfile, profiles, onDeleteProfile, onLogout }: Props) {
  const { user: googleUser, isSignedIn: googleSignedIn, signIn: googleSignIn, signOut: googleSignOut, deleteCloudDataAndSignOut, syncStatus, lastSynced, syncNow, isLoading: googleLoading } = useGoogleAuth();
  const {
    myCoachRels, myClients, loading: coachLoading, pendingChanges,
    shareWithCoach, revokeCoachAccess, syncCoachFiles,
    addClient, removeClient, discoverClients, getClientData, pushChangesToClient,
    checkForClientResponse, acknowledgeClientResponse, backupClientData, getLog,
  } = useCoach();

  const [coachEmail, setCoachEmail] = useState('');
  const [coachPermission, setCoachPermission] = useState<'full' | 'readonly'>('full');
  const [clientCode, setClientCode] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [viewingClient, setViewingClient] = useState<{ fileId: string; data: Record<string, unknown> } | null>(null);
  const [coachNote, setCoachNote] = useState('');

  // Expanded sections — auto-expand if navigated with state
  const location = useLocation();
  const [expanded, setExpanded] = useState<Set<Section>>(() => {
    const navSection = (location.state as { section?: Section })?.section;
    return new Set(navSection ? [navSection] : ['api']);
  });

  // API Keys
  const [usdaKey, setUsdaKey] = useState(() => localStorage.getItem('fitos-usda-key') || '');
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('fitos-claude-key') || '');
  const claudeEnabled = !!claudeKey.trim();
  const [showUsdaKey, setShowUsdaKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [usdaStatus, setUsdaStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [claudeStatus, setClaudeStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');

  // Profile editing
  const [editName, setEditName] = useState(profile.name);
  const [editGoal, setEditGoal] = useState(profile.goal);
  const [editUnits, setEditUnits] = useState(profile.units);
  const [editMeasurementUnit, setEditMeasurementUnit] = useState(profile.measurementUnit);
  const [editRestTimer, setEditRestTimer] = useState(profile.restTimerDuration);
  const [customRest, setCustomRest] = useState('');
  const [showCustomRest, setShowCustomRest] = useState(!REST_OPTIONS.includes(profile.restTimerDuration));
  const [editCalories, setEditCalories] = useState(String(profile.macroTargets.calories));
  const [editProtein, setEditProtein] = useState(String(profile.macroTargets.protein));
  const [editCarbs, setEditCarbs] = useState(String(profile.macroTargets.carbs));
  const [editFat, setEditFat] = useState(String(profile.macroTargets.fat));

  // Keep macro edit state in sync when profile changes externally (e.g. from Nutrition page)
  useEffect(() => {
    setEditCalories(String(profile.macroTargets.calories));
    setEditProtein(String(profile.macroTargets.protein));
    setEditCarbs(String(profile.macroTargets.carbs));
    setEditFat(String(profile.macroTargets.fat));
  }, [profile.macroTargets.calories, profile.macroTargets.protein, profile.macroTargets.carbs, profile.macroTargets.fat]);

  // Body stats editing
  const existingStats = profile.bodyStats;
  const existingHeight = existingStats ? cmToFeetInches(existingStats.heightCm) : { feet: 0, inches: 0 };
  const [editGender, setEditGender] = useState<Gender>(existingStats?.gender || 'male');
  const [editBirthday, setEditBirthday] = useState(profile.birthday || '');
  const editAge = editBirthday ? Math.floor((Date.now() - new Date(editBirthday + 'T00:00:00').getTime()) / (365.25 * 86400000)) : (existingStats?.age || 0);
  const [editFeet, setEditFeet] = useState(String(existingHeight.feet || ''));
  const [editInches, setEditInches] = useState(String(existingHeight.inches || ''));
  const [editWeight, setEditWeight] = useState(
    existingStats ? String(Math.round(kgToLbs(existingStats.weightKg))) : ''
  );
  const [editBodyFatPercent, setEditBodyFatPercent] = useState(
    existingStats?.bodyFatPercent != null ? String(existingStats.bodyFatPercent) : ''
  );
  const [editActivityLevel, setEditActivityLevel] = useState<ActivityLevel>(
    existingStats?.activityLevel || 'moderate'
  );
  const [editFitnessGoal, setEditFitnessGoal] = useState<FitnessGoal>(
    existingStats?.fitnessGoal || 'maintain'
  );
  const [editFiberTarget, setEditFiberTarget] = useState(String(profile.fiberTarget ?? 30));

  // Auto-adjustment
  const [autoAdjustResult, setAutoAdjustResult] = useState<AutoAdjustResult | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);

  useEffect(() => {
    checkAutoAdjust();
  }, [profile.id]);

  const checkAutoAdjust = async () => {
    if (!profile.bodyStats) return;
    setAdjustLoading(true);
    try {
      const measurements = await getMeasurementsByProfile(profile.id);
      const weightEntries = measurements
        .filter((m) => m.weight != null)
        .map((m) => ({
          date: m.date,
          weight: m.weight!,
          unit: m.weightUnit,
        }));
      const result = calculateAutoAdjustment(
        weightEntries,
        profile.macroTargets.calories,
        profile.bodyStats.fitnessGoal
      );
      setAutoAdjustResult(result);
    } catch (e) {
      console.error('Auto-adjust check failed:', e);
    }
    setAdjustLoading(false);
  };

  const applyAutoAdjust = () => {
    if (!autoAdjustResult?.shouldAdjust || !profile.bodyStats) return;
    const newMacros = calculateMacros({
      ...profile.bodyStats,
      weightKg: lbsToKg(parseFloat(editWeight) || profile.bodyStats.weightKg * 2.20462),
    });
    // Use the auto-adjusted calories but recalculate macros proportionally
    const ratio = autoAdjustResult.newCalories / newMacros.calories;
    const adjustedMacros = {
      calories: autoAdjustResult.newCalories,
      protein: newMacros.protein, // keep protein constant
      carbs: Math.round(newMacros.carbs * ratio),
      fat: Math.round(newMacros.fat * ratio),
    };

    const adjustment = {
      date: new Date().toISOString().split('T')[0],
      previousCalories: profile.macroTargets.calories,
      newCalories: autoAdjustResult.newCalories,
      reason: autoAdjustResult.reason,
      avgWeeklyChange: autoAdjustResult.avgWeeklyChange,
    };

    onUpdateProfile(profile.id, {
      macroTargets: adjustedMacros,
      lastAutoAdjustDate: new Date().toISOString().split('T')[0],
      calorieAdjustments: [...(profile.calorieAdjustments || []), adjustment],
    });

    setEditCalories(String(adjustedMacros.calories));
    setEditProtein(String(adjustedMacros.protein));
    setEditCarbs(String(adjustedMacros.carbs));
    setEditFat(String(adjustedMacros.fat));
    toast(`Calories adjusted to ${adjustedMacros.calories}`, 'success');
    setAutoAdjustResult({ ...autoAdjustResult, shouldAdjust: false });
  };

  // Data management
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV/XLSX import from other apps
  const [csvImportResult, setCsvImportResult] = useState<ImportResult | null>(null);
  const [xlsxImportResults, setXlsxImportResults] = useState<ImportResult[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  // Dashboard card config
  const [dashCards, setDashCards] = useState<DashboardCardConfig>(() => getDashboardConfig());
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);

  useEffect(() => {
    getAllPrograms().then((progs) => {
      const names = new Set<string>();
      // Only show exercises from the user's active program
      const activeProgramId = profile.activeProgram?.programId;
      const relevantPrograms = activeProgramId
        ? progs.filter((p) => p.id === activeProgramId)
        : progs.filter((p) => !p.isBuiltIn);
      for (const prog of relevantPrograms) {
        for (const day of prog.days) {
          for (const ex of day.exercises) {
            names.add(ex.name);
          }
        }
      }
      setExerciseNames(Array.from(names).sort());
    });
  }, [profile.activeProgram]);

  // Theme
  const [activeTheme, setActiveThemeState] = useState<ThemeId>(getActiveThemeId());

  function handleThemeChange(themeId: ThemeId) {
    setActiveThemeState(themeId);
    setActiveTheme(themeId);
  }

  // Coach exchange
  const [coachName, setCoachName] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [coachExportProfile, setCoachExportProfile] = useState(profile.id);

  // Reports
  const [reportPeriod, setReportPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportGenerating, setReportGenerating] = useState(false);

  function handleReportPeriod(period: 'week' | 'month' | 'custom') {
    setReportPeriod(period);
    const now = new Date();
    if (period === 'week') {
      const start = new Date(); start.setDate(now.getDate() - 7);
      setReportStartDate(start.toISOString().split('T')[0]);
      setReportEndDate(now.toISOString().split('T')[0]);
    } else if (period === 'month') {
      const start = new Date(); start.setDate(now.getDate() - 30);
      setReportStartDate(start.toISOString().split('T')[0]);
      setReportEndDate(now.toISOString().split('T')[0]);
    }
  }

  async function handleExportReport(format: 'csv' | 'html') {
    setReportGenerating(true);
    try {
      const data = await generateReport({
        profileId: profile.id, profile, startDate: reportStartDate, endDate: reportEndDate, period: reportPeriod,
      });
      const dateSlug = `${reportStartDate}-to-${reportEndDate}`;
      if (format === 'csv') {
        await downloadFile(generateCSV(data), `ape-report-${dateSlug}.csv`, 'text/csv');
      } else {
        await downloadFile(generateHTMLReport(data), `ape-report-${dateSlug}.html`, 'text/html');
      }
      toast('Report exported!', 'success');
    } catch (err) {
      console.error('Report generation failed:', err);
      toast('Report failed', 'error');
    }
    setReportGenerating(false);
  }

  const updateDashCards = (updates: Partial<DashboardCardConfig>) => {
    const next = { ...dashCards, ...updates };
    setDashCards(next);
    saveDashboardConfig(next);
  };

  // Profile photo cropper
  const [cropperImage, setCropperImage] = useState<string | null>(null);

  // Confirm dialogs
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  const toggleSection = (s: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // API Key handlers
  const handleSaveClaudeKey = () => {
    if (claudeKey.trim()) {
      localStorage.setItem('fitos-claude-key', claudeKey.trim());
    } else {
      localStorage.removeItem('fitos-claude-key');
    }
  };

  const handleTestClaude = async () => {
    if (!claudeKey.trim()) return;
    setClaudeStatus('testing');
    handleSaveClaudeKey();
    const valid = await testClaudeKey(claudeKey.trim());
    setClaudeStatus(valid ? 'valid' : 'invalid');
    setTimeout(() => setClaudeStatus('idle'), 3000);
  };

  // Claude is enabled when a key is present — update localStorage to match
  useEffect(() => {
    localStorage.setItem('fitos-claude-enabled', String(claudeEnabled));
  }, [claudeEnabled]);

  // Recalculate macros from body stats
  const handleRecalculate = () => {
    const ageNum = editAge;
    const feetNum = parseInt(editFeet);
    const weightNum = parseFloat(editWeight);
    if (!ageNum || !feetNum || !weightNum) return;

    const stats: BodyStats = {
      gender: editGender,
      age: ageNum,
      heightCm: heightToCm(feetNum, parseInt(editInches) || 0),
      weightKg: lbsToKg(weightNum),
      activityLevel: editActivityLevel,
      fitnessGoal: editFitnessGoal,
      bodyFatPercent: editBodyFatPercent ? parseFloat(editBodyFatPercent) : undefined,
    };
    const macros = calculateMacros(stats);
    setEditCalories(String(macros.calories));
    setEditProtein(String(macros.protein));
    setEditCarbs(String(macros.carbs));
    setEditFat(String(macros.fat));
    toast('Macros recalculated from your stats', 'success');
  };

  // Profile save
  const handleSaveProfile = () => {
    const calories = parseInt(editCalories) || 2000;
    const protein = parseInt(editProtein) || 150;
    const carbs = parseInt(editCarbs) || 200;
    const fat = parseInt(editFat) || 65;

    let restDuration = editRestTimer;
    if (showCustomRest) {
      const custom = parseInt(customRest);
      if (!isNaN(custom) && custom > 0) restDuration = custom;
    }

    // Build body stats if we have them
    const ageNum = editAge;
    const feetNum = parseInt(editFeet);
    const weightNum = parseFloat(editWeight);
    let bodyStats: BodyStats | undefined;
    let tdee: number | undefined;
    if (ageNum && feetNum && weightNum) {
      bodyStats = {
        gender: editGender,
        age: ageNum,
        heightCm: heightToCm(feetNum, parseInt(editInches) || 0),
        weightKg: lbsToKg(weightNum),
        activityLevel: editActivityLevel,
        fitnessGoal: editFitnessGoal,
        bodyFatPercent: editBodyFatPercent ? parseFloat(editBodyFatPercent) : undefined,
      };
      tdee = calculateTDEE(bodyStats);
    }

    onUpdateProfile(profile.id, {
      name: editName.trim() || profile.name,
      birthday: editBirthday || undefined,
      goal: editGoal.trim() || GOAL_LABELS[editFitnessGoal],
      units: editUnits,
      measurementUnit: editMeasurementUnit,
      restTimerDuration: restDuration,
      macroTargets: { calories, protein, carbs, fat },
      bodyStats,
      tdee,
      fiberTarget: parseInt(editFiberTarget) || 30,
    });
    toast('Settings saved', 'success');
  };

  // Export
  const handleExport = async () => {
    try {
      const data = await exportAllData();
      const date = new Date().toISOString().split('T')[0];
      await downloadJSON(data, `ape-backup-${date}.json`);
      markBackupDone();
      toast('Backup saved! Store it in cloud storage for safety.', 'success');
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Import
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportFile(reader.result as string);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    try {
      await importData(importFile, importMode);
      setImportStatus('success');
      setTimeout(() => setImportStatus('idle'), 3000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setImportStatus('error');
      setTimeout(() => setImportStatus('idle'), 4000);
    }
    setShowImportConfirm(false);
    setImportFile(null);
  };

  const handleDeleteEverything = async () => {
    if (googleSignedIn) await deleteCloudDataAndSignOut();
    await clearAllData();
    window.location.reload();
  };

  const SectionHeader = ({ section, icon: Icon, title }: { section: Section; icon: typeof Key; title: string }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between py-3"
    >
      <div className="flex items-center gap-3">
        <Icon size={18} className="text-text-secondary" />
        <span className="font-semibold text-sm">{title}</span>
      </div>
      {expanded.has(section) ? (
        <ChevronUp size={16} className="text-text-muted" />
      ) : (
        <ChevronDown size={16} className="text-text-muted" />
      )}
    </button>
  );

  const formatLastSynced = (iso: string | null) => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Google Account */}
      <div className="card">
        <SectionHeader section="google" icon={Cloud} title="Google Account" />
        {expanded.has('google') && (
          <div className="space-y-3 pt-2">
            {googleSignedIn && googleUser ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised border border-border">
                  {googleUser.picture ? (
                    <img src={googleUser.picture} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center">
                      <Cloud size={20} className="text-accent-blue" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{googleUser.name}</div>
                    <div className="text-xs text-text-muted truncate">{googleUser.email}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
                  <div className="flex items-center gap-2">
                    {syncStatus === 'syncing' ? (
                      <Loader2Icon size={14} className="animate-spin text-accent-blue" />
                    ) : syncStatus === 'synced' ? (
                      <Check size={14} className="text-success" />
                    ) : syncStatus === 'error' ? (
                      <X size={14} className="text-danger" />
                    ) : (
                      <Cloud size={14} className="text-text-muted" />
                    )}
                    <span className="text-xs text-text-secondary">
                      {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Sync failed' : 'Idle'}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted">
                    Last: {formatLastSynced(lastSynced)}
                  </span>
                </div>

                <button
                  onClick={() => { syncNow(); syncCoachFiles(); }}
                  disabled={syncStatus === 'syncing'}
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                  Sync Now
                </button>

                <p className="text-[11px] text-text-muted">
                  Your data automatically syncs to Google Drive every 2 minutes and when you leave the app.
                </p>

                <button
                  onClick={googleSignOut}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-text-muted hover:text-danger transition-colors"
                >
                  <CloudOff size={14} />
                  Sign Out of Google
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] text-text-muted">
                  Sign in to automatically back up your data to Google Drive. Access your workouts, nutrition, and progress photos from any device.
                </p>
                <button
                  onClick={() => googleSignIn()}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 rounded-xl p-3 font-medium text-sm active:scale-[0.98] transition-transform shadow-sm disabled:opacity-60"
                >
                  {googleLoading ? (
                    <Loader2Icon size={16} className="animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                  )}
                  {googleLoading ? 'Signing in...' : 'Sign in with Google'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Coach */}
      {googleSignedIn && (
      <div className="card">
        <SectionHeader section="coach" icon={UserPlus} title="Coach" />
        {expanded.has('coach') && (
          <div className="space-y-4 pt-2">
            {/* Pending coach changes — redirect to Dashboard for review */}
            {pendingChanges && pendingChanges.items && pendingChanges.items.length > 0 && (
              <div className="p-3 rounded-xl bg-accent-orange/10 border border-accent-orange/30 space-y-2">
                <div className="text-sm font-medium text-accent-orange">Coach changes pending</div>
                <p className="text-xs text-text-muted">
                  {pendingChanges.items.length} change{pendingChanges.items.length > 1 ? 's' : ''} to review — accept or deny each on your Dashboard.
                </p>
              </div>
            )}

            {/* Client side — share with coaches */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">My Coaches</div>

              {/* Existing coaches */}
              {myCoachRels.length > 0 && (
                <div className="space-y-2">
                  {myCoachRels.map((rel) => (
                    <div key={rel.fileId} className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{rel.coachEmail}</div>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                            rel.permission === 'full' ? 'bg-accent-blue/10 text-accent-blue' : 'bg-surface text-text-muted'
                          }`}>
                            {rel.permission === 'full' ? 'Full Access' : 'Read Only'}
                          </span>
                        </div>
                        <button
                          onClick={async () => { await revokeCoachAccess(rel.fileId); toast('Coach removed', 'success'); }}
                          className="p-1.5 text-text-muted hover:text-danger"
                        >
                          <UserX size={14} />
                        </button>
                      </div>
                      <div className="text-[9px] text-text-muted">
                        Your coach got a Google Drive notification.{' '}
                        <button onClick={() => { navigator.clipboard.writeText(rel.fileId); toast('Share code copied — send to your coach', 'success'); }} className="text-accent-blue underline">Copy share code</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new coach */}
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-text-muted">
                  Share your data with coaches or friends. Full access lets them push changes. Read only is view-only.
                </p>
                <input
                  type="email"
                  className="input-field text-sm"
                  placeholder="Coach's Gmail address"
                  value={coachEmail}
                  onChange={(e) => setCoachEmail(e.target.value)}
                />
                <div className="flex gap-2">
                  {(['full', 'readonly'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCoachPermission(p)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                        coachPermission === p
                          ? p === 'full' ? 'bg-accent-blue/20 text-accent-blue' : 'bg-surface-raised text-text-primary'
                          : 'bg-surface text-text-muted'
                      }`}
                    >
                      {p === 'full' ? 'Full Access' : 'Read Only'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (!coachEmail.trim()) return;
                    try {
                      const fileId = await shareWithCoach(coachEmail.trim(), coachPermission);
                      if (fileId) {
                        navigator.clipboard.writeText(fileId).catch(() => {});
                        toast('Shared! Coach notified via email. Share code copied.', 'success');
                        setCoachEmail('');
                      }
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Failed to share';
                      if (msg.includes('403') || msg.includes('TOKEN_EXPIRED') || msg.includes('Not signed in')) {
                        toast('Sign out of Google and sign back in to grant file permissions', 'error');
                      } else {
                        toast(msg, 'error');
                      }
                    }
                  }}
                  disabled={!coachEmail.trim() || coachLoading}
                  className="btn-primary w-full text-sm disabled:opacity-30"
                >
                  Add Coach
                </button>
              </div>
            </div>

            {/* Coach side — manage clients */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">My Clients</div>
              {myClients.length > 0 && (
                <div className="space-y-2">
                  {myClients.map((client) => (
                    <div key={client.fileId} className="p-3 rounded-xl bg-surface-raised border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{client.clientName || 'Client'}</div>
                          {client.clientEmail && <div className="text-[10px] text-text-muted">{client.clientEmail}</div>}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={async () => {
                              // Ensure coach scope — needed to read files created by another user
                              if (!hasCoachScope()) {
                                try { await requestCoachAccess(); } catch {
                                  toast('Drive access required to view client data.', 'error');
                                  return;
                                }
                              }
                              const data = await getClientData(client.fileId);
                              if (data && !data.error) {
                                setViewingClient({ fileId: client.fileId, data });
                                backupClientData(client.fileId, client.clientName || 'Client');
                              } else {
                                toast(data?.error || 'Could not load client data', 'error');
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-accent-blue/10 text-accent-blue"
                          >
                            View
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await backupClientData(client.fileId, client.clientName || 'Client');
                              toast(ok ? 'Client data backed up' : 'Backup failed', ok ? 'success' : 'error');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-success/10 text-success"
                          >
                            Backup
                          </button>
                          <button
                            onClick={() => { removeClient(client.fileId); toast('Client removed', 'success'); }}
                            className="p-1 rounded-lg text-text-muted hover:text-danger"
                          >
                            <UserX size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Add client by share code */}
              <div className="space-y-2">
                <p className="text-[11px] text-text-muted">
                  Enter the share code your client sent you, or tap "Find Clients" to auto-discover.
                </p>
                <input
                  className="input-field text-sm w-full font-mono"
                  placeholder="Client's share code"
                  value={clientCode}
                  onChange={(e) => setClientCode(e.target.value)}
                />
                <button
                  onClick={async () => {
                    const code = clientCode.trim();
                    if (!code) return;
                    setAddingClient(true);
                    try {
                      // Coaches need drive.readonly to read files created by another user.
                      // Request it once — directly from the click handler to avoid popup blockers.
                      if (!hasCoachScope()) {
                        await requestCoachAccess();
                      }
                      const data = await getClientData(code);
                      if (data?.error) {
                        toast(data.error, 'error');
                        return;
                      }
                      const name: string = data?.profile?.name || 'Client';
                      const email: string | undefined = data?.profile?.googleEmail;
                      addClient(code, name, email);
                      toast(`Added ${name}`, 'success');
                      setClientCode('');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      if (msg.includes('access_denied') || msg.includes('cancelled')) {
                        toast('Permission not granted — client not added.', 'error');
                      } else {
                        toast('Could not read client data. Check the share code.', 'error');
                      }
                    } finally {
                      setAddingClient(false);
                    }
                  }}
                  disabled={!clientCode.trim() || addingClient}
                  className="btn-primary w-full text-sm disabled:opacity-30"
                >
                  {addingClient ? 'Adding…' : 'Add Client'}
                </button>
              </div>

              {/* Auto-discover clients (may require broader scope) */}
              <button
                onClick={async () => {
                  toast('Searching for clients...', 'info');
                  const found = await discoverClients();
                  if (found.length === 0) {
                    toast('No new clients found. Ask your client for their share code.', 'info');
                  } else {
                    for (const client of found) {
                      addClient(client.fileId, client.name || client.email, client.email, client.folderId);
                    }
                    toast(`Found ${found.length} client${found.length > 1 ? 's' : ''}!`, 'success');
                  }
                }}
                className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
              >
                Find Clients
              </button>
            </div>

            {/* Coach/Client History */}
            {getLog().length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">History</div>
                <CoachHistoryComponent log={getLog()} perspective={myCoachRels.length > 0 ? 'client' : 'coach'} />
              </div>
            )}

          </div>
        )}
      </div>
      )}

      {/* Theme */}
      <div className="card">
        <SectionHeader section="theme" icon={Palette} title="Theme" />
        {expanded.has('theme') && (
          <div className="pt-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleThemeChange('dark')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTheme === 'dark' ? 'ring-2 ring-accent-orange' : ''
                }`}
                style={{ backgroundColor: '#1a1a20', color: '#ffffff' }}
              >
                🌙 Dark
                {activeTheme === 'dark' && <Check size={14} />}
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTheme === 'light' ? 'ring-2 ring-accent-orange' : ''
                }`}
                style={{ backgroundColor: '#ffffff', color: '#111111', border: '1px solid #d4d4d8' }}
              >
                ☀️ Light
                {activeTheme === 'light' && <Check size={14} />}
              </button>
              <button
                onClick={() => handleThemeChange('auto')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTheme === 'auto' ? 'ring-2 ring-accent-orange' : ''
                }`}
                style={{ backgroundColor: '#333340', color: '#ccccdd', border: '1px solid #555' }}
              >
                🔄 Auto
                {activeTheme === 'auto' && <Check size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="card">
        <SectionHeader section="api" icon={Key} title="API Keys" />
        {expanded.has('api') && (
          <div className="space-y-5 pt-2">
            {/* USDA Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
              <Check size={14} className="text-success flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary">
                USDA Food Database is built in — search over 300,000 foods with full nutrition data. No setup required.
              </p>
            </div>

            {/* Claude Key */}
            <div className="space-y-2">
              <label className="label block">Claude AI Vision Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showClaudeKey ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Enter Anthropic API key"
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    onBlur={handleSaveClaudeKey}
                  />
                  <button
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {showClaudeKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleTestClaude}
                  disabled={!claudeKey.trim() || claudeStatus === 'testing'}
                  className="btn-secondary px-4 py-2 text-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  {claudeStatus === 'testing' && (
                    <div className="w-3 h-3 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
                  )}
                  {claudeStatus === 'valid' && <Check size={14} className="text-success" />}
                  {claudeStatus === 'invalid' && <X size={14} className="text-danger" />}
                  Test
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-text-muted">
                  Get a key at{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue hover:underline inline-flex items-center gap-0.5"
                  >
                    console.anthropic.com <ExternalLink size={10} />
                  </a>
                </p>
                {claudeEnabled && (
                  <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TDEE & Auto-Adjust */}
      <div className="card">
        <SectionHeader section="tdee" icon={Calculator} title="Calorie Calculator & Auto-Adjust" />
        {expanded.has('tdee') && (
          <div className="space-y-4 pt-2">
            {/* Current TDEE display */}
            {profile.tdee && (
              <div className="bg-surface-raised rounded-xl p-4 border border-border-light">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-secondary font-semibold">YOUR TDEE (MAINTENANCE)</span>
                  <span className="text-xl font-black">{profile.tdee.toLocaleString()} cal</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-semibold">CURRENT TARGET</span>
                  <span className="text-xl font-black text-accent-orange">
                    {profile.macroTargets.calories.toLocaleString()} cal
                  </span>
                </div>
                {profile.bodyStats && (
                  <div className="mt-2 text-[10px] text-text-muted">
                    Goal: {GOAL_LABELS[profile.bodyStats.fitnessGoal]} ·{' '}
                    {GOAL_DESCRIPTIONS[profile.bodyStats.fitnessGoal]}
                  </div>
                )}
              </div>
            )}

            {/* Auto-adjustment status */}
            <div className="bg-surface-raised rounded-xl p-4 border border-border-light">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-accent-blue" />
                <span className="text-xs font-bold">Auto-Adjustment</span>
              </div>

              {adjustLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <div className="w-3 h-3 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
                  Analyzing weight data...
                </div>
              ) : !profile.bodyStats ? (
                <p className="text-xs text-text-muted">
                  Set up your body stats below to enable auto-adjustment.
                </p>
              ) : autoAdjustResult ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {autoAdjustResult.reason}
                  </p>
                  {autoAdjustResult.daysSinceStart > 0 && (
                    <p className="text-[10px] text-text-muted">
                      Based on {autoAdjustResult.daysSinceStart} days of data ·{' '}
                      Avg: {autoAdjustResult.avgWeeklyChange >= 0 ? '+' : ''}
                      {autoAdjustResult.avgWeeklyChange.toFixed(1)} lbs/week ·{' '}
                      Target: {autoAdjustResult.targetWeeklyChange >= 0 ? '+' : ''}
                      {autoAdjustResult.targetWeeklyChange.toFixed(1)} lbs/week
                    </p>
                  )}
                  {autoAdjustResult.shouldAdjust && (
                    <button
                      onClick={applyAutoAdjust}
                      className="w-full bg-accent-blue/15 text-accent-blue font-semibold text-sm rounded-xl px-4 py-2.5 border border-accent-blue/30 active:scale-95 transition-transform"
                    >
                      Apply: {profile.macroTargets.calories} → {autoAdjustResult.newCalories} cal/day
                    </button>
                  )}
                  <button
                    onClick={checkAutoAdjust}
                    className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-secondary"
                  >
                    <RefreshCw size={10} /> Re-check
                  </button>
                </div>
              ) : null}
            </div>

            {/* Adjustment history */}
            {profile.calorieAdjustments && profile.calorieAdjustments.length > 0 && (
              <div>
                <label className="label mb-2 block">Adjustment History</label>
                <div className="space-y-1.5">
                  {[...profile.calorieAdjustments].reverse().slice(0, 5).map((adj, i) => (
                    <div key={i} className="bg-surface-raised rounded-lg px-3 py-2 text-xs border border-border-light">
                      <div className="flex justify-between">
                        <span className="text-text-muted">{adj.date}</span>
                        <span className="font-semibold">
                          {adj.previousCalories} → {adj.newCalories} cal
                        </span>
                      </div>
                      <p className="text-text-muted mt-0.5 text-[10px]">{adj.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dashboard Cards */}
      <div className="card">
        <SectionHeader section="dashboard" icon={LayoutDashboard} title="Dashboard Cards" />
        {expanded.has('dashboard') && (
          <div className="space-y-4 pt-2">
            <p className="text-[11px] text-text-muted">
              Choose which snapshot cards appear on your dashboard. Tap any card to expand its detailed view.
            </p>

            {/* Calories toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Calorie Intake</div>
                <div className="text-[11px] text-text-muted">Weekly bar graph of daily calories</div>
              </div>
              <button
                onClick={() => updateDashCards({ calories: !dashCards.calories })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.calories ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.calories ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Weight toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Body Weight</div>
                <div className="text-[11px] text-text-muted">Weight trend line graph</div>
              </div>
              <button
                onClick={() => updateDashCards({ weight: !dashCards.weight })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.weight ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.weight ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Measurements toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">Body Measurement</div>
                  <div className="text-[11px] text-text-muted">Track a specific measurement</div>
                </div>
                <button
                  onClick={() => updateDashCards({ measurements: !dashCards.measurements })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    dashCards.measurements ? 'bg-accent-blue' : 'bg-surface-raised'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      dashCards.measurements ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {dashCards.measurements && (
                <select
                  className="input-field text-sm"
                  value={dashCards.selectedMeasurement}
                  onChange={(e) => updateDashCards({ selectedMeasurement: e.target.value })}
                >
                  <option value="waist">Waist</option>
                  <option value="chest">Chest</option>
                  <option value="shoulders">Shoulders</option>
                  <option value="leftArm">Left Arm</option>
                  <option value="rightArm">Right Arm</option>
                  <option value="leftThigh">Left Thigh</option>
                  <option value="rightThigh">Right Thigh</option>
                  <option value="hips">Hips</option>
                  <option value="neck">Neck</option>
                </select>
              )}
            </div>

            {/* Lifts toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">Lift Progress</div>
                  <div className="text-[11px] text-text-muted">Track a specific exercise</div>
                </div>
                <button
                  onClick={() => updateDashCards({ lifts: !dashCards.lifts })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    dashCards.lifts ? 'bg-accent-blue' : 'bg-surface-raised'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      dashCards.lifts ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {dashCards.lifts && (
                exerciseNames.length > 0 ? (
                  <select
                    className="input-field text-sm"
                    value={dashCards.selectedLift}
                    onChange={(e) => updateDashCards({ selectedLift: e.target.value })}
                  >
                    <option value="">Select an exercise...</option>
                    {exerciseNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-text-muted">No exercises found. Add a program first.</p>
                )
              )}
            </div>

            {/* Workout counter toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Workout Counter</div>
                <div className="text-[11px] text-text-muted">Weekly progress ring (requires active program)</div>
              </div>
              <button
                onClick={() => updateDashCards({ workoutCounter: !dashCards.workoutCounter })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.workoutCounter ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.workoutCounter ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Check-in reminder toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">Check-In Reminder</div>
                  <div className="text-[11px] text-text-muted">Reminder to complete your check-in</div>
                </div>
                <button
                  onClick={() => updateDashCards({ checkInReminder: !dashCards.checkInReminder })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    dashCards.checkInReminder ? 'bg-accent-blue' : 'bg-surface-raised'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      dashCards.checkInReminder ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {dashCards.checkInReminder && (
                <select
                  className="input-field text-sm"
                  value={dashCards.checkInFrequency}
                  onChange={(e) => updateDashCards({ checkInFrequency: e.target.value as 'daily' | 'weekly' | 'biweekly' })}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                </select>
              )}
            </div>

            {/* Calendar toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Activity Calendar</div>
                <div className="text-[11px] text-text-muted">Monthly view of workouts, nutrition, and check-ins</div>
              </div>
              <button
                onClick={() => updateDashCards({ calendar: !dashCards.calendar })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.calendar ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.calendar ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Water toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Water Intake</div>
                <div className="text-[11px] text-text-muted">Daily water tracking with quick-add buttons</div>
              </div>
              <button
                onClick={() => updateDashCards({ water: !dashCards.water })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.water ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.water ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Steps toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Steps</div>
                <div className="text-[11px] text-text-muted">Daily step count with weekly trend</div>
              </div>
              <button
                onClick={() => updateDashCards({ steps: !dashCards.steps })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.steps ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.steps ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* AI Coach toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">AI Coach</div>
                <div className="text-[11px] text-text-muted">Data-driven suggestions using your Claude API key (~$0.02/use)</div>
              </div>
              <button
                onClick={() => updateDashCards({ aiCoach: !dashCards.aiCoach })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.aiCoach ? 'bg-accent-blue' : 'bg-surface-raised'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.aiCoach ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* AI Voice toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">AI Voice Mode <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-semibold ml-1">BETA</span></div>
                <div className="text-[11px] text-text-muted">{claudeEnabled ? 'Hands-free voice commands — accuracy may vary' : 'Requires Claude API key'}</div>
              </div>
              <button
                onClick={() => claudeEnabled && updateDashCards({ aiVoice: !dashCards.aiVoice })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  dashCards.aiVoice && claudeEnabled ? 'bg-accent-blue' : 'bg-surface-raised'
                } ${!claudeEnabled ? 'opacity-40' : ''}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dashCards.aiVoice && claudeEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Settings */}
      <div className="card">
        <SectionHeader section="profile" icon={User} title="Profile & Body Stats" />
        {expanded.has('profile') && (
          <div className="space-y-4 pt-2">
            {/* Profile Photo */}
            <div className="flex items-center gap-4">
              {profile.profilePhoto ? (
                <img src={profile.profilePhoto} alt={profile.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: profile.avatarColor }}>
                  {profile.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="btn-secondary px-4 py-2 text-xs cursor-pointer inline-flex items-center gap-1.5">
                  {profile.profilePhoto ? 'Change Photo' : 'Add Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCropperImage(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {profile.profilePhoto && (
                  <button
                    onClick={() => onUpdateProfile(profile.id, { profilePhoto: undefined })}
                    className="text-[10px] text-danger block"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {cropperImage && (
              <ImageCropper
                imageSrc={cropperImage}
                onCrop={(dataUrl) => {
                  onUpdateProfile(profile.id, { profilePhoto: dataUrl });
                  setCropperImage(null);
                  toast('Profile photo updated', 'success');
                }}
                onCancel={() => setCropperImage(null)}
              />
            )}

            <div>
              <label className="label mb-1.5 block">Name</label>
              <input
                className="input-field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            {/* Body Stats Section */}
            <div className="border-t border-border pt-4">
              <label className="label mb-3 block">Body Stats</label>

              {/* Gender */}
              <div className="mb-3">
                <label className="text-[10px] text-text-muted font-semibold block mb-1">Sex</label>
                <div className="flex gap-2">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setEditGender(g)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        editGender === g
                          ? 'bg-accent-orange text-white'
                          : 'bg-surface-raised text-text-secondary border border-border-light'
                      }`}
                    >
                      {g === 'male' ? 'Male' : 'Female'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Birthday + Weight row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">Birthday{editAge > 0 ? ` (${editAge} yrs)` : ''}</label>
                  <input
                    type="date"
                    className="input-field text-sm py-2.5"
                    value={editBirthday}
                    onChange={(e) => setEditBirthday(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">Weight (lbs)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field text-sm py-2.5"
                    placeholder="180"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                  />
                </div>
              </div>

              {/* Height row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">Height (ft)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input-field text-sm py-2.5"
                    placeholder="5"
                    value={editFeet}
                    onChange={(e) => setEditFeet(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">Height (in)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input-field text-sm py-2.5"
                    placeholder="10"
                    value={editInches}
                    onChange={(e) => setEditInches(e.target.value)}
                  />
                </div>
              </div>

              {/* Body Fat % */}
              <div className="mb-3">
                <label className="text-[10px] text-text-muted font-semibold block mb-1">Body Fat % (optional)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-field text-sm py-2.5"
                  placeholder="Leave blank if unsure"
                  value={editBodyFatPercent}
                  onChange={(e) => setEditBodyFatPercent(e.target.value)}
                />
                <p className="text-[9px] text-text-muted mt-0.5">
                  Used for lean-mass protein targeting. If blank, 1g protein per cm of height.
                </p>
              </div>

              {/* Activity Level */}
              <div className="mb-3">
                <label className="text-[10px] text-text-muted font-semibold block mb-1">Activity Level</label>
                <select
                  value={editActivityLevel}
                  onChange={(e) => setEditActivityLevel(e.target.value as ActivityLevel)}
                  className="input-field text-sm py-2.5"
                >
                  {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {ACTIVITY_LABELS[level]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fitness Goal */}
              <div className="mb-3">
                <label className="text-[10px] text-text-muted font-semibold block mb-1">Fitness Goal</label>
                <div className="flex gap-2">
                  {(['lose', 'maintain', 'build'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setEditFitnessGoal(g)}
                      className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                        editFitnessGoal === g
                          ? 'bg-accent-orange text-white'
                          : 'bg-surface-raised text-text-secondary border border-border-light'
                      }`}
                    >
                      {GOAL_LABELS[g]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  {GOAL_DESCRIPTIONS[editFitnessGoal]}
                </p>
              </div>

              {/* Recalculate button */}
              <button
                onClick={handleRecalculate}
                disabled={!editAge || !editBirthday || !editFeet || !editWeight}
                className="w-full bg-accent-blue/15 text-accent-blue font-semibold text-sm rounded-xl px-4 py-2.5 border border-accent-blue/30 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Calculator size={14} />
                Recalculate Macros from Stats
              </button>
            </div>

            {/* Macro Targets (still manually editable) */}
            <div className="border-t border-border pt-4">
              <label className="label mb-2 block">Macro Targets (editable)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">
                    Calories (kcal)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field text-sm py-2.5"
                    value={editCalories}
                    onChange={(e) => setEditCalories(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field text-sm py-2.5"
                    value={editProtein}
                    onChange={(e) => setEditProtein(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field text-sm py-2.5"
                    value={editCarbs}
                    onChange={(e) => setEditCarbs(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-semibold block mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field text-sm py-2.5"
                    value={editFat}
                    onChange={(e) => setEditFat(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-[10px] text-text-muted font-semibold block mb-1">
                  Fiber Target (g)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-field text-sm py-2.5"
                  value={editFiberTarget}
                  onChange={(e) => setEditFiberTarget(e.target.value)}
                />
              </div>
            </div>

            {/* Other settings */}
            <div className="border-t border-border pt-4">
              <div className="mb-3">
                <label className="label mb-1.5 block">Units</label>
                <div className="flex gap-2">
                  {(['imperial', 'metric'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setEditUnits(u)}
                      className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                        editUnits === u
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-raised text-text-secondary border border-border-light'
                      }`}
                    >
                      {u === 'imperial' ? 'Imperial (lbs)' : 'Metric (kg)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <label className="label mb-1.5 block">Measurement Units</label>
                <div className="flex gap-2">
                  {(['in', 'cm'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setEditMeasurementUnit(u)}
                      className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                        editMeasurementUnit === u
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-raised text-text-secondary border border-border-light'
                      }`}
                    >
                      {u === 'in' ? 'Inches (in)' : 'Centimeters (cm)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <label className="label mb-1.5 block">Rest Timer (seconds)</label>
                <div className="flex gap-2 flex-wrap">
                  {REST_OPTIONS.map((sec) => (
                    <button
                      key={sec}
                      onClick={() => {
                        setEditRestTimer(sec);
                        setShowCustomRest(false);
                      }}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        editRestTimer === sec && !showCustomRest
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-raised text-text-secondary border border-border-light'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCustomRest(true)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      showCustomRest
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-raised text-text-secondary border border-border-light'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {showCustomRest && (
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input-field mt-2"
                    placeholder="Custom seconds"
                    value={customRest}
                    onChange={(e) => setCustomRest(e.target.value)}
                  />
                )}
              </div>
            </div>

            <button onClick={handleSaveProfile} className="btn-primary w-full">
              Save All Settings
            </button>
          </div>
        )}
      </div>

      {/* Coach Reports */}
      <div className="card">
        <SectionHeader section="reports" icon={FileText} title="Reports & Export" />
        {expanded.has('reports') && (
          <div className="space-y-4 pt-2">
            <p className="text-[11px] text-text-muted">
              Generate a full report of your workouts, nutrition, body weight, and measurements. Share with your coach or save for your records.
            </p>

            {/* Period selector */}
            <div>
              <label className="label mb-1.5 block">Report Period</label>
              <div className="flex gap-1.5">
                {([
                  { key: 'week' as const, label: 'Last 7 Days' },
                  { key: 'month' as const, label: 'Last 30 Days' },
                  { key: 'custom' as const, label: 'Custom' },
                ]).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleReportPeriod(p.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      reportPeriod === p.key ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-secondary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date range */}
            {reportPeriod === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label mb-1 block">From</label>
                  <input type="date" className="input-field text-sm" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label mb-1 block">To</label>
                  <input type="date" className="input-field text-sm" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* What's included */}
            <div className="bg-surface-raised rounded-xl p-3">
              <div className="text-[10px] font-medium text-text-secondary mb-1.5">Report includes:</div>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-text-muted">
                <span>✓ Daily nutrition log</span>
                <span>✓ Macro averages</span>
                <span>✓ Workout sessions</span>
                <span>✓ Exercise details & sets</span>
                <span>✓ Volume & duration</span>
                <span>✓ Body weight trend</span>
                <span>✓ Body measurements</span>
                <span>✓ Session notes</span>
              </div>
            </div>

            {/* Export buttons */}
            <div className="space-y-2">
              <button
                onClick={async () => {
                  setReportGenerating(true);
                  try {
                    const data = await generateReport({ profileId: profile.id, profile, startDate: reportStartDate, endDate: reportEndDate, period: reportPeriod });
                    await generatePDFReport(data);
                    toast('PDF downloaded!', 'success');
                  } catch { toast('PDF generation failed', 'error'); }
                  setReportGenerating(false);
                }}
                disabled={reportGenerating}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {reportGenerating ? <Loader2Icon size={16} className="animate-spin" /> : <Download size={16} />}
                Download PDF
              </button>
              <button
                onClick={() => handleExportReport('html')}
                disabled={reportGenerating}
                className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <FileText size={16} />
                Download HTML Report
              </button>
              <button
                onClick={() => handleExportReport('csv')}
                disabled={reportGenerating}
                className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download size={16} />
                Download Spreadsheet (CSV)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Data Management */}
      <div className="card">
        <SectionHeader section="data" icon={Database} title="Data Management" />
        {expanded.has('data') && (
          <div className="space-y-4 pt-2">
            {googleSignedIn && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                <Cloud size={14} className="text-success flex-shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  Your data is automatically syncing to Google Drive. Manual export is still available as an additional backup.
                </p>
              </div>
            )}
            {/* Backup section */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Full Backup</div>
              <p className="text-[11px] text-text-muted">
                Export all your data (workouts, nutrition, measurements, programs) to a file. Save it to OneDrive, Google Drive, or your computer.
              </p>
              {getLastBackupDate() && (
                <p className="text-[10px] text-text-muted">
                  Last backup: {getLastBackupDate()}
                </p>
              )}
              <button
                onClick={handleExport}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Download size={16} />
                Export All Data
              </button>

              <div className="flex gap-2">
                {(['merge', 'replace'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setImportMode(m)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      importMode === m
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-raised text-text-secondary border border-border-light'
                    }`}
                  >
                    {m === 'merge' ? 'Merge' : 'Replace'}
                  </button>
                ))}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload size={16} />
                Import Data
              </label>

              {importStatus === 'success' && (
                <p className="text-xs text-success font-semibold text-center">
                  Data imported successfully!
                </p>
              )}
              {importStatus === 'error' && (
                <p className="text-xs text-danger font-semibold text-center">
                  {importError}
                </p>
              )}
            </div>

            {/* Programs import/export */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Programs</div>
              <p className="text-[11px] text-text-muted">
                Share programs with others or import programs people send you.
              </p>
              <button
                onClick={async () => {
                  try {
                    const data = await exportAllPrograms();
                    const date = new Date().toISOString().split('T')[0];
                    await downloadJSON(data, `ape-programs-${date}.json`);
                    toast('Programs exported!', 'success');
                  } catch (err) {
                    toast('Export failed', 'error');
                  }
                }}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
              >
                <Download size={14} />
                Export My Programs
              </button>
              <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer text-sm">
                <Upload size={14} />
                Import Program
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        const count = await importProgramsBundle(reader.result as string);
                        toast(`Imported ${count} program${count > 1 ? 's' : ''}!`, 'success');
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Import failed', 'error');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* Custom foods export */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Food Library</div>
              <p className="text-[11px] text-text-muted">
                Export your custom foods as a shareable library. Other APE users can import it to get all your foods in their search.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const data = await exportCustomFoods(profile.id);
                      const date = new Date().toISOString().split('T')[0];
                      await downloadJSON(data, `ape-food-library-${date}.json`);
                      toast('Food library exported!', 'success');
                    } catch (err) {
                      toast('Export failed', 'error');
                    }
                  }}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} />
                  Export
                </button>
                <label className="btn-secondary flex-1 flex items-center justify-center gap-2 cursor-pointer text-sm">
                  <Upload size={14} />
                  Import
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        try {
                          const result = importCustomFoods(reader.result as string, profile.id);
                          const parts = [];
                          if (result.foods > 0) parts.push(`${result.foods} food${result.foods !== 1 ? 's' : ''}`);
                          if (result.recipes > 0) parts.push(`${result.recipes} recipe${result.recipes !== 1 ? 's' : ''}`);
                          toast(`Imported ${parts.join(' and ')} to your library!`, 'success');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Import failed', 'error');
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Import from Other Apps */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Import from Other Apps</div>
              <p className="text-[11px] text-text-muted">
                Import workout history, nutrition, measurements, steps, recipes, and more. Supports Strong, Hevy, FitNotes, MyFitnessPal, and MacroFactor (CSV or XLSX).
              </p>
              <label className={`btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer text-sm ${csvImporting ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={14} />
                {csvImporting ? 'Importing...' : 'Import CSV / XLSX'}
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCsvImporting(true);
                    setCsvImportResult(null);
                    setXlsxImportResults(null);

                    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

                    if (isXlsx) {
                      const buffer = await file.arrayBuffer();
                      try {
                        const results = await importMacroFactorXLSX(buffer, profile.id);
                        setXlsxImportResults(results);
                        const totalImported = results.reduce((s, r) => s + r.count, 0);
                        const sheetsWithData = results.filter((r) => r.count > 0).length;
                        if (totalImported > 0) {
                          toast(`Imported data from ${sheetsWithData} sheets (${totalImported} total items)`, 'success');
                        } else {
                          toast('No new data to import (all duplicates or empty)', 'info');
                        }
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'XLSX import failed', 'error');
                      } finally {
                        setCsvImporting(false);
                      }
                      e.target.value = '';
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        const text = reader.result as string;
                        const result = await importCSV(text, profile.id);
                        setCsvImportResult(result);
                        if (result.count > 0) {
                          const typeLabel = { workouts: 'workout sessions', nutrition: 'nutrition entries', measurements: 'measurements', steps: 'step entries', recipes: 'recipes', foods: 'foods', skipped: 'items' }[result.type] || 'items';
                          toast(`Imported ${result.count} ${typeLabel} from ${getSourceLabel(result.source)}`, 'success');
                        } else if (result.errors.length > 0) {
                          toast(result.errors[0], 'error');
                        } else if (result.skipped > 0) {
                          toast(`All ${result.skipped} entries already exist`, 'info');
                        }
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Import failed', 'error');
                      } finally {
                        setCsvImporting(false);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>

              {csvImportResult && (
                <div className={`rounded-xl p-3 text-xs space-y-1 ${
                  csvImportResult.count > 0 ? 'bg-success/10 border border-success/20' :
                  csvImportResult.errors.length > 0 ? 'bg-danger/10 border border-danger/20' :
                  'bg-surface-raised border border-border-light'
                }`}>
                  <div className="font-semibold">
                    {getSourceLabel(csvImportResult.source)} — {
                      { workouts: 'Workouts', nutrition: 'Nutrition', measurements: 'Measurements', steps: 'Steps', recipes: 'Recipes', foods: 'Food Library', skipped: 'Skipped' }[csvImportResult.type]
                    }
                  </div>
                  {csvImportResult.count > 0 && (
                    <div className="text-text-secondary">
                      {csvImportResult.count} {csvImportResult.type === 'workouts' ? 'sessions' : csvImportResult.type === 'measurements' ? 'measurements' : csvImportResult.type === 'steps' ? 'step entries' : csvImportResult.type === 'recipes' ? 'recipes' : csvImportResult.type === 'foods' ? 'foods' : 'entries'} imported
                      {csvImportResult.dateRange && ` (${csvImportResult.dateRange.from} to ${csvImportResult.dateRange.to})`}
                    </div>
                  )}
                  {csvImportResult.details && (
                    <div className="text-text-muted">{csvImportResult.details}</div>
                  )}
                  {csvImportResult.skipped > 0 && (
                    <div className="text-text-muted">{csvImportResult.skipped} duplicates skipped</div>
                  )}
                  {csvImportResult.errors.length > 0 && (
                    <div className="text-danger">{csvImportResult.errors.join('; ')}</div>
                  )}
                </div>
              )}

              {xlsxImportResults && (
                <div className="rounded-xl border border-border-light overflow-hidden">
                  {xlsxImportResults.filter((r) => r.count > 0 || r.type === 'skipped').map((r, i) => (
                    <div key={i} className={`px-3 py-2 text-xs border-b border-border/50 last:border-0 ${r.count > 0 ? 'bg-success/5' : 'bg-surface-raised'}`}>
                      <div className="flex justify-between">
                        <span className="font-medium">{r.details || r.type}</span>
                        <span className={r.count > 0 ? 'text-success font-semibold' : 'text-text-muted'}>{r.count > 0 ? `+${r.count}` : 'skipped'}</span>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2 text-xs bg-surface font-semibold flex justify-between">
                    <span>Total</span>
                    <span className="text-success">{xlsxImportResults.reduce((s, r) => s + r.count, 0)} items imported</span>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-text-muted space-y-1">
                <p><span className="font-semibold">Workouts:</span> Strong, Hevy, FitNotes CSV</p>
                <p><span className="font-semibold">Nutrition:</span> MyFitnessPal, MacroFactor CSV</p>
                <p><span className="font-semibold">MacroFactor XLSX:</span> Import all data at once — weight, body metrics, steps, recipes, foods, micronutrients</p>
                <p>Existing data on matching dates will not be overwritten.</p>
              </div>
            </div>

            {/* Coach Exchange */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Coach Exchange</div>
              <p className="text-[11px] text-text-muted">
                Coaches send program & macro updates to clients. Clients import them without losing their logs.
              </p>

              {/* Export (Coach sends to client) */}
              <div className="space-y-2 bg-surface-raised rounded-xl p-3">
                <div className="text-[10px] font-medium text-text-secondary">Send to Client</div>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="Your name (coach)"
                  value={coachName}
                  onChange={(e) => setCoachName(e.target.value)}
                />
                <textarea
                  className="input-field text-sm resize-none"
                  rows={2}
                  placeholder="Notes for client (optional)"
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                />
                {profiles.length > 1 && (
                  <select
                    className="input-field text-sm"
                    value={coachExportProfile}
                    onChange={(e) => setCoachExportProfile(e.target.value)}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}

                {/* Cloud storage tip */}
                <div className="bg-surface-raised rounded-xl p-3 text-[11px] text-text-muted space-y-1">
                  <div className="font-medium text-text-secondary">📤 Share with your coach</div>
                  <div>Upload the exported file to a shared cloud folder:</div>
                  <div className="space-y-0.5 pt-0.5">
                    <div>• Google Drive · iCloud Drive · OneDrive · Dropbox</div>
                  </div>
                  <div className="pt-1 text-[10px]">
                    The full package (.zip) includes progress photos. The quick update (.json) is data only.
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const targetProfile = profiles.find((p) => p.id === coachExportProfile) || profile;
                    try {
                      toast('Building package with photos…', 'info');
                      await exportCoachPackage(targetProfile, coachName || 'Coach', coachNotes);
                      toast('Coach package exported!', 'success');
                    } catch { toast('Export failed', 'error'); }
                  }}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <Upload size={14} />
                  Export Full Package (with Photos)
                </button>
                <button
                  onClick={async () => {
                    const targetProfile = profiles.find((p) => p.id === coachExportProfile) || profile;
                    try {
                      const data = await exportCoachUpdate(targetProfile, coachName || 'Coach', coachNotes);
                      const date = new Date().toISOString().split('T')[0];
                      await downloadJSON(data, `ape-coach-${targetProfile.name.toLowerCase().replace(/\s+/g, '-')}-${date}.json`);
                      toast('Coach update exported!', 'success');
                    } catch { toast('Export failed', 'error'); }
                  }}
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <Upload size={14} />
                  Export Quick Update (data only)
                </button>
              </div>

              {/* Import (Client receives from coach) */}
              <div className="space-y-2 bg-surface-raised rounded-xl p-3">
                <div className="text-[10px] font-medium text-text-secondary">Receive from Coach</div>
                <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer text-sm">
                  <Download size={14} />
                  Import Coach Update
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        try {
                          const result = await importCoachUpdate(
                            reader.result as string,
                            onUpdateProfile,
                            profile
                          );
                          const notePreview = result.notes ? result.notes.slice(0, 100) : '';
                          toast(`Coach update from ${result.coachName} applied. New macros: ${profile.macroTargets.calories}kcal.${notePreview ? ` Notes: ${notePreview}` : ''}`, 'success');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Import failed', 'error');
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-danger uppercase tracking-wider">Danger Zone</div>
              <button
                onClick={() => { setShowDeleteAccount(true); setDeleteConfirmChecked(false); }}
                className="w-full font-semibold rounded-xl px-6 py-3 active:scale-95 transition-transform bg-danger text-white flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 size={14} />
                Delete Account & All Data
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Management */}
      <div className="card">
        <SectionHeader section="profiles" icon={Users} title="Profile Management" />
        {expanded.has('profiles') && (
          <div className="space-y-2 pt-2">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  p.id === profile.id
                    ? 'border-accent-blue/30 bg-accent-blue/5'
                    : 'border-border-light bg-surface-raised'
                }`}
              >
                <div className="flex items-center gap-3">
                  {p.profilePhoto ? (
                    <img src={p.profilePhoto} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.avatarColor }}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-semibold">{p.name}</span>
                    {p.id === profile.id && (
                      <span className="text-[10px] text-accent-blue font-semibold ml-2">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={onLogout}
              className="btn-secondary w-full flex items-center justify-center gap-2 mt-3"
            >
              <LogOut size={16} />
              Switch Profile
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card">
        <SectionHeader section="about" icon={Info} title="About" />
        {expanded.has('about') && (
          <div className="pt-4 pb-2 text-center space-y-3">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="APE" className="h-14 mx-auto invert brightness-200" />
            <p className="text-[11px] text-text-muted tracking-[0.15em] uppercase">
              Aesthetic Physique Enthusiast
            </p>
            <p className="text-[10px] text-text-muted">
              Aesthetic Physique Enthusiast &mdash; NARBE LLC
            </p>
            <a href="#/privacy" className="text-[10px] text-accent-blue underline">Privacy Policy</a>
          </div>
        )}
      </div>

      {/* Confirm Dialogs */}
      <Modal open={showImportConfirm} onClose={() => { setShowImportConfirm(false); setImportFile(null); }} title="Import Data">
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            {importMode === 'merge'
              ? 'This will merge the imported data with your existing data. Duplicate entries will be updated.'
              : 'This will replace ALL existing data with the imported data. This cannot be undone.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowImportConfirm(false); setImportFile(null); }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleImportConfirm}
              className={`flex-1 font-semibold rounded-xl px-6 py-3 active:scale-95 transition-transform ${
                importMode === 'replace' ? 'bg-danger text-white' : 'btn-primary'
              }`}
            >
              {importMode === 'merge' ? 'Merge Data' : 'Replace All Data'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} title="Delete Account & All Data">
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 space-y-2">
            <p className="text-sm text-text-primary font-medium">This will permanently delete:</p>
            <ul className="text-xs text-text-secondary space-y-1 pl-4 list-disc">
              <li>Your profile and all settings</li>
              <li>All workout sessions and exercise history</li>
              <li>All food entries and nutrition logs</li>
              <li>All body measurements and check-ins</li>
              <li>All progress photos</li>
              <li>All programs (custom and enrolled)</li>
              <li>All coach/client connections and history</li>
              {googleSignedIn && <li className="font-medium text-danger">All data from your Google Drive (APE App folder, sync data, shared files)</li>}
            </ul>
            <p className="text-xs text-danger font-semibold">This action cannot be undone. All data on all devices will be erased.</p>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl bg-surface-raised border border-border cursor-pointer">
            <input
              type="checkbox"
              checked={deleteConfirmChecked}
              onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
              className="mt-0.5 accent-danger"
            />
            <span className="text-xs text-text-secondary">
              I understand that all my data will be permanently deleted from this device{googleSignedIn ? ' and Google Drive' : ''}, including all workouts, nutrition, progress photos, and coach connections. This cannot be recovered.
            </span>
          </label>

          <div className="flex gap-3">
            <button onClick={() => setShowDeleteAccount(false)} className="btn-secondary flex-1 text-sm">
              Cancel
            </button>
            <button
              onClick={handleDeleteEverything}
              disabled={!deleteConfirmChecked}
              className="flex-1 font-semibold rounded-xl px-6 py-3 active:scale-95 transition-transform bg-danger text-white text-sm disabled:opacity-30"
            >
              Delete Everything
            </button>
          </div>
        </div>
      </Modal>

      {/* Full-page coach client view */}
      {viewingClient && (
        <div className="fixed inset-0 z-[200] bg-bg overflow-y-auto">
          <ClientView
            data={viewingClient.data as never}
            fileId={viewingClient.fileId}
            onPushChanges={pushChangesToClient}
            onCheckClientResponse={checkForClientResponse}
            onAcknowledgeResponse={acknowledgeClientResponse}
            onRefresh={getClientData}
            onClose={() => setViewingClient(null)}
            coachEmail={googleUser?.email}
            log={getLog()}
          />
        </div>
      )}
    </div>
  );
}
