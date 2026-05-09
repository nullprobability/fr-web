import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import uprightFontUrl from '../../fonts/Upright.otf';
import { downloadCanvas } from '../utils/canvasExport';
import { wrapText } from '../utils/textWrap';

type ExportSize = 1080 | 1440 | 2048;
type FitMode = 'cover' | 'contain' | 'stretch';
type TextAlign = 'left' | 'center' | 'right';
type CaseMode = 'keep' | 'uppercase' | 'lowercase';
type PositionPreset =
  | 'top'
  | 'middle'
  | 'bottom'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

interface TextBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FONT_STACK = ['Upright', 'Arial', '"Times New Roman"'];

function getFontStack(primary: string): string {
  const formatted = primary.includes(' ') && !primary.startsWith('"')
    ? `"${primary}"`
    : primary;
  return [formatted, ...FONT_STACK.filter(f => f.replace(/"/g, '') !== primary)].join(', ');
}

const PRESETS: PositionPreset[] = [
  'top-left', 'top', 'top-right', 'center',
  'bottom-left', 'bottom', 'bottom-right', 'middle',
];

const EXPORT_SIZES: ExportSize[] = [1080, 1440, 2048];
const FIT_MODES: FitMode[] = ['cover', 'contain', 'stretch'];
const CASE_MODES: CaseMode[] = ['keep', 'uppercase', 'lowercase'];
const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right'];

const DEFAULT_FONT = 'Upright';

/* ── Small reusable UI primitives ── */

function Slider({
  label, value, display, min, max, onChange, step = 1,
}: {
  label: string; value: number; display: string;
  min: number; max: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <div className="group">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[11px] text-zinc-500 font-medium tracking-wide uppercase">{label}</span>
        <span className="text-[11px] text-zinc-400 tabular-nums font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider"
      />
    </div>
  );
}

function ButtonGroup<T extends string>({
  options, selected, onChange, labels,
}: {
  options: readonly T[]; selected: T; onChange: (v: T) => void; labels?: Record<T, string>;
}) {
  return (
    <div className="flex gap-px rounded-lg overflow-hidden bg-zinc-800/50">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 py-2 text-[11px] font-medium tracking-wide transition-all duration-150 ${
            selected === opt
              ? 'bg-white text-zinc-950'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, compact }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className={compact ? 'space-y-3' : 'space-y-4'}>
      <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.15em] flex items-center gap-2">
        <span>{title}</span>
        <span className="flex-1 h-px bg-zinc-800/80" />
      </h2>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

const PRESET_LABELS: Record<PositionPreset, string> = {
  'top-left': '\u2196',
  top: '\u2191',
  'top-right': '\u2197',
  center: '\u2022',
  'bottom-left': '\u2199',
  bottom: '\u2193',
  'bottom-right': '\u2198',
  middle: '\u2195',
};

const CASE_LABELS: Record<CaseMode, string> = {
  keep: 'Aa',
  uppercase: 'AA',
  lowercase: 'aa',
};

const ALIGN_LABELS: Record<TextAlign, string> = {
  left: '\u2261 L',
  center: '\u2261 C',
  right: '\u2261 R',
};

/* ── Main component ── */

export default function WhisperTool() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState('');
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT);
  const [fontWeight, setFontWeight] = useState(900);
  const [fontSize, setFontSize] = useState(80);
  const [lineHeight, setLineHeight] = useState(1.2);
  const [outlineSize, setOutlineSize] = useState(12);
  const [textColor, setTextColor] = useState('#ffffff');
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [textAlign, setTextAlign] = useState<TextAlign>('center');
  const [caseMode, setCaseMode] = useState<CaseMode>('uppercase');
  const [textX, setTextX] = useState(540);
  const [textY, setTextY] = useState(540);
  const [exportSize, setExportSize] = useState<ExportSize>(1080);
  const [fitMode, setFitMode] = useState<FitMode>('cover');
  const [darken, setDarken] = useState(30);
  const [blur, setBlur] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [activePanel, setActivePanel] = useState<'image' | 'text' | 'export'>('image');

  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const bboxRef = useRef<TextBBox | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);

  /* ── Image upload ── */
  const handleImageUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [],
  );

  /* ── Load built-in Upright font ── */
  useEffect(() => {
    if (fontReady) return;
    const font = new FontFace('Upright', `url(${uprightFontUrl})`);
    font.load().then(() => {
      document.fonts.add(font);
      setFontReady(true);
    }).catch(() => {
      console.warn('Failed to load Upright font');
    });
  }, [fontReady]);

  /* ── Position presets ── */
  const applyPositionPreset = useCallback(
    (preset: PositionPreset) => {
      const pad = fontSize * 2;
      const size = exportSize;
      switch (preset) {
        case 'top':
          setTextX(size / 2); setTextY(pad); break;
        case 'middle':
          setTextY(size / 2); break;
        case 'bottom':
          setTextX(size / 2); setTextY(size - pad); break;
        case 'center':
          setTextX(size / 2); setTextY(size / 2); break;
        case 'top-left':
          setTextX(pad); setTextY(pad); break;
        case 'top-right':
          setTextX(size - pad); setTextY(pad); break;
        case 'bottom-left':
          setTextX(pad); setTextY(size - pad); break;
        case 'bottom-right':
          setTextX(size - pad); setTextY(size - pad); break;
      }
    },
    [fontSize, exportSize],
  );

  /* ── Canvas renderer ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = exportSize;

    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    if (image) {
      ctx.save();
      if (blur > 0) ctx.filter = `blur(${blur}px)`;

      const ox = imageOffsetX;
      const oy = imageOffsetY;
      const z = imageZoom;

      if (fitMode === 'stretch') {
        const zw = size * z;
        const zh = size * z;
        ctx.drawImage(image, ox + (size - zw) / 2, oy + (size - zh) / 2, zw, zh);
      } else if (fitMode === 'contain') {
        const scale = Math.min(size / image.width, size / image.height);
        const w = image.width * scale * z;
        const h = image.height * scale * z;
        ctx.drawImage(image, (size - w) / 2 + ox, (size - h) / 2 + oy, w, h);
      } else {
        const imgAspect = image.width / image.height;
        if (imgAspect > 1) {
          const sh = image.height;
          const sw = image.height;
          const zw = size * z;
          const zh = size * z;
          ctx.drawImage(image, (image.width - sw) / 2, 0, sw, sh, ox + (size - zw) / 2, oy + (size - zh) / 2, zw, zh);
        } else {
          const sw = image.width;
          const sh = image.width;
          const zw = size * z;
          const zh = size * z;
          ctx.drawImage(image, 0, (image.height - sh) / 2, sw, sh, ox + (size - zw) / 2, oy + (size - zh) / 2, zw, zh);
        }
      }

      ctx.restore();

      if (darken > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${darken / 100})`;
        ctx.fillRect(0, 0, size, size);
      }
    }

    const displayText =
      caseMode === 'uppercase'
        ? caption.toUpperCase()
        : caseMode === 'lowercase'
          ? caption.toLowerCase()
          : caption;

    const trimmedText = displayText.trim();

    if (!trimmedText) {
      bboxRef.current = null;
      return;
    }

    ctx.font = `${fontWeight} ${fontSize}px ${getFontStack(fontFamily)}`;
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const maxTextWidth = size * 0.86;
    const lines = wrapText(ctx, trimmedText, maxTextWidth);

    const lineH = fontSize * lineHeight;
    const totalH = lines.length * lineH;
    const startY = textY - totalH / 2 + lineH / 2;

    let minX: number = size;
    let maxX: number = 0;

    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineH;

      ctx.font = `${fontWeight} ${fontSize}px ${getFontStack(fontFamily)}`;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineSize;
      ctx.strokeText(lines[i], textX, ly);
      ctx.fillStyle = textColor;
      ctx.fillText(lines[i], textX, ly);

      const m = ctx.measureText(lines[i]);
      let left: number;
      if (textAlign === 'center') left = textX - m.width / 2;
      else if (textAlign === 'right') left = textX - m.width;
      else left = textX;

      minX = Math.min(minX, left);
      maxX = Math.max(maxX, left + m.width);
    }

    bboxRef.current = {
      x: minX,
      y: startY,
      width: maxX - minX,
      height: totalH,
    };
  }, [
    image, caption, fontFamily, fontWeight, fontSize, lineHeight, outlineSize,
    textColor, outlineColor, textAlign, caseMode, textX, textY,
    exportSize, fitMode, darken, blur, imageOffsetX, imageOffsetY, imageZoom,
  ]);

  useEffect(() => { draw(); }, [draw]);

  /* ── Zoom: wheel (PC) and pinch (mobile) ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      setImageZoom((z) => Math.min(5, Math.max(0.1, z + delta)));
    };

    const getTouchDist = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDistRef.current = getTouchDist(e.touches);
        pinchStartZoomRef.current = imageZoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const ratio = dist / pinchStartDistRef.current;
        setImageZoom(Math.min(5, Math.max(0.1, pinchStartZoomRef.current * ratio)));
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [imageZoom]);

  /* ── Pointer drag handlers ── */
  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scale = exportSize / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;

      if (bboxRef.current) {
        const b = bboxRef.current;
        const padding = (outlineSize + fontSize * 0.1) * 2;

        if (
          px >= b.x - padding &&
          px <= b.x + b.width + padding &&
          py >= b.y - padding &&
          py <= b.y + b.height + padding
        ) {
          setIsDragging(true);
          setIsDraggingImage(false);
          dragOffsetRef.current = { x: px - textX, y: py - textY };
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }

      if (image) {
        setIsDraggingImage(true);
        setIsDragging(false);
        dragOffsetRef.current = { x: px - imageOffsetX, y: py - imageOffsetY };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    [exportSize, outlineSize, fontSize, textX, textY, image, imageOffsetX, imageOffsetY],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (!isDragging && !isDraggingImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scale = exportSize / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;

      if (isDragging) {
        setTextX(Math.round(px - dragOffsetRef.current.x));
        setTextY(Math.round(py - dragOffsetRef.current.y));
      } else if (isDraggingImage) {
        setImageOffsetX(Math.round(px - dragOffsetRef.current.x));
        setImageOffsetY(Math.round(py - dragOffsetRef.current.y));
      }
    },
    [isDragging, isDraggingImage, exportSize],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsDraggingImage(false);
  }, []);

  /* ── Export / Reset ── */
  const handleExport = useCallback(() => {
    draw();
    const canvas = canvasRef.current;
    if (canvas) downloadCanvas(canvas);
  }, [draw]);

  const handleReset = useCallback(() => {
    setImage(null);
    setCaption('');
    setFontFamily(DEFAULT_FONT);
    setFontWeight(900);
    setFontSize(80);
    setLineHeight(1.2);
    setOutlineSize(12);
    setTextColor('#ffffff');
    setOutlineColor('#000000');
    setTextAlign('center');
    setCaseMode('uppercase');
    setExportSize(1080);
    setTextX(540);
    setTextY(540);
    setFitMode('cover');
    setDarken(30);
    setBlur(0);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setImageZoom(1);
  }, []);

  /* ── Tab content renderers ── */
  const renderImagePanel = () => (
    <div className="space-y-5">
      <Section title="Source" compact>
        <label className="block cursor-pointer group">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center transition-all duration-200 group-hover:border-zinc-600 group-hover:bg-zinc-900/30">
            {image ? (
              <div className="flex items-center gap-4 justify-center">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-xs text-zinc-300 font-medium">{image.naturalWidth} &times; {image.naturalHeight}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Click to replace</p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </div>
                <p className="text-xs text-zinc-400 font-medium">Drop image or click</p>
                <p className="text-[10px] text-zinc-600 mt-1">PNG, JPG, WebP</p>
              </>
            )}
          </div>
        </label>
      </Section>

      <Section title="Fit">
        <ButtonGroup<FitMode> options={FIT_MODES} selected={fitMode} onChange={setFitMode} />
      </Section>

      {image && (
        <Section title="Transform">
          <Slider label="Zoom" value={imageZoom} display={`${Math.round(imageZoom * 100)}%`} min={0.1} max={5} onChange={setImageZoom} step={0.05} />
          <Slider label="Pan X" value={imageOffsetX} display={String(imageOffsetX)} min={-exportSize} max={exportSize} onChange={setImageOffsetX} />
          <Slider label="Pan Y" value={imageOffsetY} display={String(imageOffsetY)} min={-exportSize} max={exportSize} onChange={setImageOffsetY} />
        </Section>
      )}

      <Section title="Effects">
        <Slider label="Darken" value={darken} display={`${darken}%`} min={0} max={100} onChange={setDarken} />
        <Slider label="Blur" value={blur} display={`${blur}px`} min={0} max={20} onChange={setBlur} step={0.5} />
      </Section>
    </div>
  );

  const renderTextPanel = () => (
    <div className="space-y-5">
      <Section title="Caption">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Type your caption..."
          rows={3}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600
            resize-none focus:outline-none focus:border-zinc-600 transition-colors font-medium"
        />
        <ButtonGroup<CaseMode> options={CASE_MODES} selected={caseMode} onChange={setCaseMode} labels={CASE_LABELS} />
      </Section>

      <Section title="Typeface">
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200
            focus:outline-none focus:border-zinc-600 transition-colors appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
        >
          <option value="Upright">Upright</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
        </select>

        <Slider label="Weight" value={fontWeight} display={String(fontWeight)} min={100} max={900} onChange={setFontWeight} />
        <Slider label="Size" value={fontSize} display={`${fontSize}px`} min={20} max={300} onChange={setFontSize} />
        <Slider label="Leading" value={lineHeight} display={lineHeight.toFixed(1)} min={0.8} max={2.0} onChange={setLineHeight} step={0.1} />
        <Slider label="Stroke" value={outlineSize} display={`${outlineSize}px`} min={0} max={50} onChange={setOutlineSize} />
      </Section>

      <Section title="Color">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Fill</span>
            <div className="relative">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="color-input"
              />
              <div className="absolute inset-0 rounded-lg border border-zinc-800 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Outline</span>
            <div className="relative">
              <input
                type="color"
                value={outlineColor}
                onChange={(e) => setOutlineColor(e.target.value)}
                className="color-input"
              />
              <div className="absolute inset-0 rounded-lg border border-zinc-800 pointer-events-none" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Align">
        <ButtonGroup<TextAlign> options={TEXT_ALIGNS} selected={textAlign} onChange={setTextAlign} labels={ALIGN_LABELS} />
      </Section>

      <Section title="Position">
        <div className="grid grid-cols-4 gap-px rounded-lg overflow-hidden bg-zinc-800/50">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => applyPositionPreset(preset)}
              className="py-2.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors text-xs"
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <Slider label="X" value={textX} display={String(textX)} min={0} max={exportSize} onChange={setTextX} />
        <Slider label="Y" value={textY} display={String(textY)} min={0} max={exportSize} onChange={setTextY} />
      </Section>
    </div>
  );

  const renderExportPanel = () => (
    <div className="space-y-5">
      <Section title="Resolution">
        <div className="flex gap-px rounded-lg overflow-hidden bg-zinc-800/50">
          {EXPORT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setExportSize(size)}
              className={`flex-1 py-2.5 text-[11px] font-medium tracking-wide transition-all duration-150 ${
                exportSize === size
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600">
          {exportSize}&times;{exportSize}px square canvas
        </p>
      </Section>

      <div className="pt-2 space-y-2">
        <button
          onClick={handleExport}
          className="w-full py-3.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold tracking-tight
            hover:bg-zinc-100 active:scale-[0.98] transition-all duration-150"
        >
          Export PNG
        </button>
        <button
          onClick={handleReset}
          className="w-full py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium
            hover:text-zinc-200 hover:border-zinc-700 active:scale-[0.98] transition-all duration-150"
        >
          Reset everything
        </button>
      </div>
    </div>
  );

  const TABS = [
    { key: 'image' as const, label: 'Image', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'text' as const, label: 'Text', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { key: 'export' as const, label: 'Export', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
  ];

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-zinc-200 antialiased selection:bg-white/10">
      {/* Subtle grain overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")` }} />

      <div className="relative h-full">
        {/* ─── Canvas: full screen on mobile, right panel on desktop ─── */}
        <div className="h-full lg:ml-[340px] xl:ml-[360px] flex items-center justify-center p-3 lg:p-8 relative overflow-hidden">
          {/* Checkerboard background */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }} />

          <div className="relative w-full max-w-[640px]">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-zinc-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <canvas
                ref={canvasRef}
                className="w-full aspect-square rounded-2xl shadow-2xl shadow-black/60 relative z-10"
                style={{ touchAction: 'none', cursor: (isDragging || isDraggingImage) ? 'grabbing' : 'grab' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />

              {/* Empty state */}
              {!image && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl z-20">
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center backdrop-blur-sm">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-600">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-500 font-medium">Upload an image</p>
                    <p className="text-[10px] text-zinc-700 mt-1">to get started</p>
                  </div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-[10px] text-zinc-700 font-mono">
                {exportSize}&times;{exportSize}
              </span>
              {image && (
                <span className="text-[10px] text-zinc-700">
                  Drag to move &middot; Scroll / pinch to zoom
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Sidebar: fixed left on mobile as floating pane, static on desktop ─── */}
        <aside className="fixed inset-x-0 bottom-0 lg:inset-y-0 lg:left-0 lg:right-auto lg:bottom-auto w-full lg:w-[340px] xl:w-[360px] flex flex-col bg-zinc-950/95 lg:bg-zinc-950 backdrop-blur-xl lg:backdrop-blur-none border-t lg:border-t-0 lg:border-r border-zinc-800/60 lg:border-zinc-900 rounded-t-2xl lg:rounded-none max-h-[70vh] lg:max-h-none z-30 floating-pane-safe">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 lg:pt-5 lg:pb-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-bold tracking-tight text-white">tf</h1>
              <span className="text-[10px] text-zinc-600 tracking-wide">image macro maker</span>
            </div>
            {/* Drag handle on mobile */}
            <div className="lg:hidden w-8 h-1 rounded-full bg-zinc-800 absolute top-2 left-1/2 -translate-x-1/2" />
          </div>

          {/* Tab bar */}
          <div className="px-4 shrink-0">
            <div className="flex gap-px bg-zinc-900 rounded-lg p-px">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActivePanel(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[7px] text-[11px] font-medium transition-all duration-150 ${
                    activePanel === tab.key
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
            {activePanel === 'image' && renderImagePanel()}
            {activePanel === 'text' && renderTextPanel()}
            {activePanel === 'export' && renderExportPanel()}
          </div>
        </aside>
      </div>
    </main>
  );
}
