import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Check, X, RotateCw } from 'lucide-react';

interface Props {
  imageSrc: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
  outputSize?: number;
}

export function ImageCropper({ imageSrc, onCrop, onCancel, outputSize = 256 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [initialScale, setInitialScale] = useState(1);

  const VIEWPORT = 280;
  const CIRCLE_R = VIEWPORT / 2 - 10;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const fitScale = Math.max((CIRCLE_R * 2) / img.width, (CIRCLE_R * 2) / img.height);
      setInitialScale(fitScale);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const cx = VIEWPORT / 2;
    const cy = VIEWPORT / 2;

    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);

    ctx.save();
    ctx.translate(cx + offset.x, cy + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Dark overlay outside circle (ring shape via even-odd fill)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.rect(0, 0, VIEWPORT, VIEWPORT);
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [scale, offset, rotation]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [imgLoaded, draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setScale((s) => Math.max(initialScale * 0.3, Math.min(initialScale * 5, s + delta)));
  };

  const zoom = (dir: number) => {
    setScale((s) => Math.max(initialScale * 0.3, Math.min(initialScale * 5, s + dir * initialScale * 0.15)));
  };

  const rotate = () => setRotation((r) => (r + 90) % 360);

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext('2d')!;
    const outScale = outputSize / (CIRCLE_R * 2);

    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(outputSize / 2, outputSize / 2);
    ctx.scale(outScale, outScale);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    onCrop(out.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
      <p className="text-white/70 text-xs mb-3">Drag to reposition, pinch or scroll to zoom</p>

      <div
        ref={containerRef}
        className="relative touch-none select-none"
        style={{ width: VIEWPORT, height: VIEWPORT }}
      >
        <canvas
          ref={canvasRef}
          width={VIEWPORT}
          height={VIEWPORT}
          className="rounded-2xl cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => zoom(-1)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <ZoomOut size={18} />
        </button>
        <input
          type="range"
          min={initialScale * 30}
          max={initialScale * 500}
          value={scale * 100}
          onChange={(e) => setScale(parseFloat(e.target.value) / 100)}
          className="w-32 accent-white"
        />
        <button onClick={() => zoom(1)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <ZoomIn size={18} />
        </button>
        <button onClick={rotate} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <RotateCw size={18} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm active:scale-95 transition-transform"
        >
          <X size={16} />
          Cancel
        </button>
        <button
          onClick={handleCrop}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-orange text-white font-semibold text-sm active:scale-95 transition-transform"
        >
          <Check size={16} />
          Use Photo
        </button>
      </div>
    </div>
  );
}
