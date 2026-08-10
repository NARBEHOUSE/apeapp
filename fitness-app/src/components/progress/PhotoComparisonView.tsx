import { useMemo, useState } from 'react';
import { Columns2, SlidersHorizontal, X } from 'lucide-react';
import type { Measurement, Profile, ProgressPhoto } from '../../types';
import { POSE_LABELS, buildPhotoProgressSnapshot } from '../../utils/photoAnalysis';
import { formatDate } from '../../utils/dateHelpers';
import { photoImageSrc } from '../../utils/photoImage';
import { PhotoAnalysisPanel } from './PhotoAnalysisPanel';

interface Props {
  /** The two selected photos, in any order. */
  pair: [ProgressPhoto, ProgressPhoto];
  profile: Profile;
  photos: ProgressPhoto[];
  measurements: Measurement[];
  onClose: () => void;
}

type ViewMode = 'side' | 'slider';

function signed(n: number, unit: string): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded} ${unit}`;
}

export function PhotoComparisonView({ pair, profile, photos, measurements, onClose }: Props) {
  const [from, to] = pair[0].date <= pair[1].date ? pair : [pair[1], pair[0]];
  const [mode, setMode] = useState<ViewMode>('side');
  const [wipe, setWipe] = useState(50);

  // Same numbers the AI is given, so what's on screen and what it reasons about can't diverge.
  const snapshot = useMemo(
    () => buildPhotoProgressSnapshot(profile, from, to, photos, measurements),
    [profile, from, to, photos, measurements],
  );

  const samePose = from.pose === to.pose;
  const measurementChanges = Object.entries(snapshot.bodyMeasurements?.changes ?? {}).filter(
    ([, delta]) => delta !== 0,
  );

  return (
    <>
      <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-sm flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">
              {samePose ? POSE_LABELS[from.pose] ?? from.pose : 'Mixed poses'}
            </p>
            <p className="text-xs text-white/60">
              {snapshot.comparison.daysApart} day{snapshot.comparison.daysApart === 1 ? '' : 's'} apart
              {snapshot.comparison.daysApart >= 14 && ` · ${snapshot.comparison.weeksApart} weeks`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close comparison"
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* View mode */}
          <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setMode('side')}
              className={`flex-1 py-1.5 rounded-md text-[0.6875rem] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'side' ? 'bg-white text-black' : 'text-white/70'
              }`}
            >
              <Columns2 size={13} />
              Side by side
            </button>
            <button
              onClick={() => setMode('slider')}
              className={`flex-1 py-1.5 rounded-md text-[0.6875rem] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'slider' ? 'bg-white text-black' : 'text-white/70'
              }`}
            >
              <SlidersHorizontal size={13} />
              Slider
            </button>
          </div>

          {/* Images */}
          {mode === 'side' ? (
            <div className="grid grid-cols-2 gap-2">
              {[from, to].map((photo, i) => (
                <div key={photo.id} className="space-y-1.5">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black/40">
                    <img
                      src={photoImageSrc(photo.imageData)}
                      alt={`${photo.pose} — ${photo.date}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 text-[0.5625rem] font-bold uppercase tracking-wider text-white bg-black/60 rounded px-1.5 py-0.5">
                      {i === 0 ? 'Before' : 'After'}
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="text-[0.6875rem] font-semibold text-white">{formatDate(photo.date)}</div>
                    <div className="text-[0.625rem] text-white/50">
                      {(i === 0 ? snapshot.weight.baseline : snapshot.weight.latest) != null
                        ? `${i === 0 ? snapshot.weight.baseline : snapshot.weight.latest} ${snapshot.weight.unit}`
                        : POSE_LABELS[photo.pose] ?? photo.pose}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* A range input drives the wipe, so this works with touch, mouse, and keyboard
                  without any custom drag handling. */}
              <div className="relative aspect-[3/4] max-h-[55vh] mx-auto rounded-xl overflow-hidden bg-black/40">
                <img
                  src={photoImageSrc(from.imageData)}
                  alt={`Before — ${from.date}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Clipped rather than width-constrained, so the top image never squashes. */}
                <img
                  src={photoImageSrc(to.imageData)}
                  alt={`After — ${to.date}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-white/80 pointer-events-none" style={{ left: `${wipe}%` }} />
                <span className="absolute top-1.5 left-1.5 text-[0.5625rem] font-bold uppercase tracking-wider text-white bg-black/60 rounded px-1.5 py-0.5">
                  {formatDate(to.date)}
                </span>
                <span className="absolute top-1.5 right-1.5 text-[0.5625rem] font-bold uppercase tracking-wider text-white bg-black/60 rounded px-1.5 py-0.5">
                  {formatDate(from.date)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wipe}
                onChange={(e) => setWipe(Number(e.target.value))}
                aria-label="Wipe between the two photos"
                className="w-full"
                style={{ accentColor: '#5b6ef5' }}
              />
            </div>
          )}

          {/* Tracked deltas */}
          {(snapshot.weight.change != null || measurementChanges.length > 0) && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
              <div className="text-[0.5625rem] font-semibold uppercase tracking-wider text-white/40">
                Tracked change
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {snapshot.weight.change != null && (
                  <div>
                    <div className="text-[0.5625rem] text-white/40 uppercase">Weight</div>
                    <div className="text-xs font-semibold text-white">
                      {signed(snapshot.weight.change, snapshot.weight.unit)}
                      {snapshot.weight.changePerWeek != null && (
                        <span className="text-white/50 font-normal">
                          {' '}
                          ({signed(snapshot.weight.changePerWeek, snapshot.weight.unit)}/wk)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {measurementChanges.map(([site, delta]) => (
                  <div key={site}>
                    <div className="text-[0.5625rem] text-white/40 uppercase">{site}</div>
                    <div className="text-xs font-semibold text-white">
                      {signed(delta, snapshot.bodyMeasurements?.unit ?? '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Same AI panel the gallery's compare bar uses, acting on this same pair */}
          <PhotoAnalysisPanel
            pair={pair}
            profile={profile}
            photos={photos}
            measurements={measurements}
            dark
          />
        </div>
      </div>
    </>
  );
}
