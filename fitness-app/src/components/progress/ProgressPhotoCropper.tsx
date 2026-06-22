import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Check, X, RotateCw } from 'lucide-react';

interface Props {
  imageSrc: string;
  onCrop: (base64: string) => void;
  onCancel: () => void;
}

const OUTPUT_W = 600;
const OUTPUT_H = 800;
const ASPECT = OUTPUT_W / OUTPUT_H;

export function ProgressPhotoCropper({ imageSrc, onCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [initialScale, setInitialScale] = useState(1);

  const viewW = Math.min(320, window.innerWidth - 40);
  const viewH = viewW / ASPECT;
  const cropW = viewW - 20;
  const cropH = viewH - 20;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const fitScale = Math.max(cropW / img.width, cropH / img.height);
      setInitialScale(fitScale);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc, cropW, cropH]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const cx = viewW / 2;
    const cy = viewH / 2;

    ctx.clearRect(0, 0, viewW, viewH);

    // Draw image
    ctx.save();
    ctx.translate(cx + offset.x, cy + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Dark overlay outside crop area
    const cropX = (viewW - cropW) / 2;
    const cropY = (viewH - cropH) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, viewW, viewH);
    ctx.roundRect(cropX, cropY, cropW, cropH, 12);
    ctx.fill('evenodd');
    ctx.restore();

    // Crop border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cropX, cropY, cropW, cropH, 12);
    ctx.stroke();
    ctx.restore();

    // Rule of thirds grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cropX + (cropW / 3) * i, cropY);
      ctx.lineTo(cropX + (cropW / 3) * i, cropY + cropH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cropX, cropY + (cropH / 3) * i);
      ctx.lineTo(cropX + cropW, cropY + (cropH / 3) * i);
      ctx.stroke();
    }
    ctx.restore();

    // Body alignment guides
    ctx.save();
    ctx.setLineDash([6, 4]);

    // Head guide — ~8% from top
    const headY = cropY + cropH * 0.08;
    ctx.strokeStyle = 'rgba(91, 110, 245, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cropX + 20, headY);
    ctx.lineTo(cropX + cropW - 20, headY);
    ctx.stroke();

    // Feet guide — ~95% from top
    const feetY = cropY + cropH * 0.95;
    ctx.strokeStyle = 'rgba(91, 110, 245, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cropX + 20, feetY);
    ctx.lineTo(cropX + cropW - 20, feetY);
    ctx.stroke();

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(cx, cropY + cropH * 0.1);
    ctx.lineTo(cx, cropY + cropH * 0.9);
    ctx.stroke();

    ctx.restore();

    // Guide labels
    ctx.save();
    ctx.fillStyle = 'rgba(91, 110, 245, 0.7)';
    ctx.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('HEAD', cropX + 24, headY - 4);
    ctx.fillText('FEET', cropX + 24, feetY - 4);
    ctx.restore();
  }, [scale, offset, rotation, viewW, viewH, cropW, cropH]);

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
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    setScale((s) => Math.max(initialScale * 0.3, Math.min(initialScale * 5, s + delta)));
  };

  const zoom = (dir: number) => {
    setScale((s) => Math.max(initialScale * 0.3, Math.min(initialScale * 5, s + dir * initialScale * 0.12)));
  };

  const rotate = () => setRotation((r) => (r + 90) % 360);

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    const out = document.createElement('canvas');
    out.width = OUTPUT_W;
    out.height = OUTPUT_H;
    const ctx = out.getContext('2d')!;

    const outScaleX = OUTPUT_W / cropW;
    const outScaleY = OUTPUT_H / cropH;

    ctx.translate(OUTPUT_W / 2, OUTPUT_H / 2);
    ctx.scale(outScaleX, outScaleY);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    const dataUrl = out.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    onCrop(base64);
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/95">
      <p className="text-white/60 text-[11px] mb-2">Align your body with the guides</p>

      <div
        className="relative touch-none select-none"
        style={{ width: viewW, height: viewH }}
      >
        <canvas
          ref={canvasRef}
          width={viewW}
          height={viewH}
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
        <button onClick={() => zoom(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <ZoomOut size={16} />
        </button>
        <input
          type="range"
          min={initialScale * 30}
          max={initialScale * 500}
          value={scale * 100}
          onChange={(e) => setScale(parseFloat(e.target.value) / 100)}
          className="w-28 accent-white"
        />
        <button onClick={() => zoom(1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <ZoomIn size={16} />
        </button>
        <button onClick={rotate} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <RotateCw size={16} />
        </button>
      </div>

      <p className="text-white/30 text-[9px] mt-2">Drag to position · Pinch or scroll to zoom · Rotate if needed</p>

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white font-semibold text-sm active:scale-95 transition-transform"
        >
          <X size={16} />
          Cancel
        </button>
        <button
          onClick={handleCrop}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm active:scale-95 transition-transform"
        >
          <Check size={16} />
          Crop & Save
        </button>
      </div>
    </div>
  );
}
