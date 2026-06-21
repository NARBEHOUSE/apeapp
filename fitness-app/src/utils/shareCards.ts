import type { WorkoutSession, Exercise, SetLog, WorkoutDay } from '../types';

interface WorkoutCardData {
  dayTag: string;
  dayTitle: string;
  date: string;
  duration: string;
  exercises: { name: string; bestSet: string; sets: number; prs: boolean }[];
  totalVolume: number;
  totalSets: number;
  prsHit: number;
}

interface PRCardData {
  exerciseName: string;
  weight: number;
  reps: number;
  unit: string;
  date: string;
  previousPR?: number;
}

interface ProgressCardData {
  beforeImage: string;
  afterImage: string;
  beforeDate: string;
  afterDate: string;
  beforeWeight?: string;
  afterWeight?: string;
  pose: string;
}

const CARD_W = 1080;
const CARD_H = 1350;
const BG = '#111114';
const SURFACE = '#1a1a20';
const ACCENT = '#e8572a';
const TEXT = '#f0f0f5';
const TEXT_MUTED = '#aaaab5';
const BORDER = '#2c2c35';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBranding(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '500 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('APE APP', CARD_W / 2, CARD_H - 40);
}

export function buildWorkoutCardData(
  session: WorkoutSession,
  dayExercises: Exercise[],
  prs: Record<string, { weight: number; reps: number; date: string }>,
  previousPrs: Record<string, { weight: number }>,
  day?: WorkoutDay,
): WorkoutCardData {
  const durationMs = (session.endTime || Date.now()) - session.startTime;
  const mins = Math.floor(durationMs / 60000);
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

  let totalVolume = 0;
  let totalSets = 0;
  let prsHit = 0;

  const exercises = dayExercises
    .filter((ex) => session.sets[ex.id]?.some((s) => s.completed))
    .map((ex) => {
      const sets = session.sets[ex.id]?.filter((s) => s.completed) || [];
      const best = sets.reduce<SetLog | null>((top, s) => (!top || s.weight > top.weight) ? s : top, null);
      const vol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      totalVolume += vol;
      totalSets += sets.length;

      const isPR = prs[ex.id]?.date === session.date &&
        (!previousPrs[ex.id] || prs[ex.id].weight > previousPrs[ex.id].weight);
      if (isPR) prsHit++;

      return {
        name: ex.name,
        bestSet: best ? `${best.weight} × ${best.reps}` : '-',
        sets: sets.length,
        prs: isPR,
      };
    });

  return {
    dayTag: day?.tag || 'Workout',
    dayTitle: day?.title || '',
    date: formatCardDate(session.date),
    duration,
    exercises,
    totalVolume,
    totalSets,
    prsHit,
  };
}

function formatCardDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function renderWorkoutCard(data: WorkoutCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Header accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, CARD_W, 8);

  let y = 80;

  // "WORKOUT COMPLETE" header
  ctx.fillStyle = ACCENT;
  ctx.font = `800 24px ${font}`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '4px';
  ctx.fillText('WORKOUT COMPLETE', 60, y);
  ctx.letterSpacing = '0px';

  y += 50;

  // Day tag
  ctx.fillStyle = TEXT;
  ctx.font = `700 48px ${font}`;
  ctx.fillText(data.dayTag, 60, y);
  y += 36;

  // Date
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `400 28px ${font}`;
  ctx.fillText(data.date, 60, y);
  y += 60;

  // Stats row
  const stats = [
    { label: 'Duration', value: data.duration },
    { label: 'Sets', value: `${data.totalSets}` },
    { label: 'Volume', value: `${Math.round(data.totalVolume).toLocaleString()} lbs` },
  ];
  if (data.prsHit > 0) stats.push({ label: 'PRs', value: `${data.prsHit}` });

  const statW = (CARD_W - 120 - (stats.length - 1) * 16) / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const sx = 60 + i * (statW + 16);
    roundRect(ctx, sx, y, statW, 100, 16);
    ctx.fillStyle = SURFACE;
    ctx.fill();

    ctx.fillStyle = TEXT;
    ctx.font = `700 36px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(stats[i].value, sx + statW / 2, y + 45);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `500 20px ${font}`;
    ctx.fillText(stats[i].label, sx + statW / 2, y + 78);
  }
  ctx.textAlign = 'left';
  y += 130;

  // Divider
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(CARD_W - 60, y);
  ctx.stroke();
  y += 30;

  // Exercises header
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `600 20px ${font}`;
  ctx.fillText('EXERCISE', 60, y);
  ctx.textAlign = 'right';
  ctx.fillText('BEST SET', CARD_W - 60, y);
  ctx.textAlign = 'left';
  y += 20;

  // Exercise rows
  const maxExercises = Math.min(data.exercises.length, 10);
  for (let i = 0; i < maxExercises; i++) {
    const ex = data.exercises[i];
    y += 52;

    // PR indicator
    if (ex.prs) {
      ctx.fillStyle = ACCENT;
      ctx.font = `700 24px ${font}`;
      ctx.fillText('★', 60, y);
      ctx.fillStyle = TEXT;
      ctx.font = `500 30px ${font}`;
      ctx.fillText(ex.name, 100, y);
    } else {
      ctx.fillStyle = TEXT;
      ctx.font = `500 30px ${font}`;
      ctx.fillText(ex.name, 60, y);
    }

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `400 26px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${ex.sets} sets`, 60, y + 32);

    ctx.fillStyle = ex.prs ? ACCENT : TEXT;
    ctx.font = `600 30px ${font}`;
    ctx.textAlign = 'right';
    ctx.fillText(ex.bestSet, CARD_W - 60, y + 8);
    ctx.textAlign = 'left';

    y += 36;
  }

  if (data.exercises.length > maxExercises) {
    y += 30;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `400 24px ${font}`;
    ctx.fillText(`+ ${data.exercises.length - maxExercises} more exercises`, 60, y);
  }

  drawBranding(ctx);
  return canvas;
}

export function renderPRCard(data: PRCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = 1080;
  const h = 1080;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, w, 8);

  // "NEW PERSONAL RECORD" label
  ctx.fillStyle = ACCENT;
  ctx.font = `800 28px ${font}`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '6px';
  ctx.fillText('NEW PERSONAL RECORD', w / 2, 120);
  ctx.letterSpacing = '0px';

  // Star decoration
  ctx.font = `400 60px ${font}`;
  ctx.fillText('★', w / 2 - 200, 120);
  ctx.fillText('★', w / 2 + 200, 120);

  // Exercise name
  ctx.fillStyle = TEXT;
  ctx.font = `700 52px ${font}`;
  ctx.fillText(data.exerciseName, w / 2, 240);

  // Big weight number
  ctx.fillStyle = TEXT;
  ctx.font = `800 160px ${font}`;
  ctx.fillText(`${data.weight}`, w / 2, 440);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `500 40px ${font}`;
  ctx.fillText(data.unit, w / 2, 500);

  // Reps
  ctx.fillStyle = TEXT;
  ctx.font = `500 36px ${font}`;
  ctx.fillText(`× ${data.reps} reps`, w / 2, 570);

  // Previous PR comparison
  if (data.previousPR && data.previousPR > 0) {
    const increase = data.weight - data.previousPR;
    ctx.fillStyle = '#2e9e6b';
    ctx.font = `600 32px ${font}`;
    ctx.fillText(`+${increase} ${data.unit} from previous PR`, w / 2, 650);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `400 26px ${font}`;
    ctx.fillText(`Previous: ${data.previousPR} ${data.unit}`, w / 2, 700);
  }

  // Date
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `400 28px ${font}`;
  ctx.fillText(formatCardDate(data.date), w / 2, h - 120);

  // Branding
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `500 28px ${font}`;
  ctx.fillText('APE APP', w / 2, h - 50);

  return canvas;
}

export async function renderProgressCard(data: ProgressCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, CARD_W, 8);

  // Header
  ctx.fillStyle = ACCENT;
  ctx.font = `800 24px ${font}`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '4px';
  ctx.fillText('PROGRESS', CARD_W / 2, 70);
  ctx.letterSpacing = '0px';

  // Pose label
  ctx.fillStyle = TEXT;
  ctx.font = `700 40px ${font}`;
  ctx.fillText(data.pose, CARD_W / 2, 120);

  // Load images
  const [beforeImg, afterImg] = await Promise.all([
    loadImage(data.beforeImage),
    loadImage(data.afterImage),
  ]);

  const imgW = (CARD_W - 120 - 20) / 2;
  const imgH = 800;
  const imgY = 160;

  // Before photo
  ctx.save();
  roundRect(ctx, 60, imgY, imgW, imgH, 20);
  ctx.clip();
  drawCover(ctx, beforeImg, 60, imgY, imgW, imgH);
  ctx.restore();

  // After photo
  ctx.save();
  roundRect(ctx, 60 + imgW + 20, imgY, imgW, imgH, 20);
  ctx.clip();
  drawCover(ctx, afterImg, 60 + imgW + 20, imgY, imgW, imgH);
  ctx.restore();

  // Labels under photos
  const labelY = imgY + imgH + 40;

  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `500 20px ${font}`;
  ctx.fillText('BEFORE', 60 + imgW / 2, labelY);
  ctx.fillText('AFTER', 60 + imgW + 20 + imgW / 2, labelY);

  ctx.fillStyle = TEXT;
  ctx.font = `600 28px ${font}`;
  ctx.fillText(formatCardDate(data.beforeDate), 60 + imgW / 2, labelY + 38);
  ctx.fillText(formatCardDate(data.afterDate), 60 + imgW + 20 + imgW / 2, labelY + 38);

  if (data.beforeWeight) {
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `400 24px ${font}`;
    ctx.fillText(data.beforeWeight, 60 + imgW / 2, labelY + 70);
  }
  if (data.afterWeight) {
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `400 24px ${font}`;
    ctx.fillText(data.afterWeight, 60 + imgW + 20 + imgW / 2, labelY + 70);
  }

  drawBranding(ctx);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function shareOrDownload(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        // User cancelled or share failed — fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
