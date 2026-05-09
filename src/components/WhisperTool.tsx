import { useCallback, useEffect, useRef, useState } from 'react';
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

  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const bboxRef = useRef<TextBBox | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ── Image upload ── */
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    if (image) {
      ctx.save();
      if (blur > 0) ctx.filter = `blur(${blur}px)`;

      if (fitMode === 'stretch') {
        ctx.drawImage(image, 0, 0, size, size);
      } else if (fitMode === 'contain') {
        const scale = Math.min(size / image.width, size / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
      } else {
        const imgAspect = image.width / image.height;
        if (imgAspect > 1) {
          const sh = image.height;
          const sw = image.height;
          ctx.drawImage(image, (image.width - sw) / 2, 0, sw, sh, 0, 0, size, size);
        } else {
          const sw = image.width;
          const sh = image.width;
          ctx.drawImage(image, 0, (image.height - sh) / 2, sw, sh, 0, 0, size, size);
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
    exportSize, fitMode, darken, blur,
  ]);

  useEffect(() => { draw(); }, [draw]);

  /* ── Pointer drag handlers ── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !bboxRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const scale = exportSize / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;
      const b = bboxRef.current;
      const padding = (outlineSize + fontSize * 0.1) * 2;

      if (
        px >= b.x - padding &&
        px <= b.x + b.width + padding &&
        py >= b.y - padding &&
        py <= b.y + b.height + padding
      ) {
        setIsDragging(true);
        dragOffsetRef.current = { x: px - textX, y: py - textY };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    [exportSize, outlineSize, fontSize, textX, textY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDragging) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scale = exportSize / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;

      setTextX(Math.round(px - dragOffsetRef.current.x));
      setTextY(Math.round(py - dragOffsetRef.current.y));
    },
    [isDragging, exportSize],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
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
  }, []);

  /* ── Slider helper ── */
  const Slider = (
    label: string,
    value: number,
    display: string,
    min: number,
    max: number,
    onChange: (v: number) => void,
    step?: number,
  ) => (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-[#86868b] font-medium">{label}</span>
        <span className="text-xs text-white/60 tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none bg-white/10 rounded-full accent-[#2997ff] cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );

  /* ── Button group helper ── */
  const ButtonGroup = <T extends string>(
    options: readonly T[],
    selected: T,
    onChange: (v: T) => void,
    labels?: Record<T, string>,
  ) => (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            selected === opt
              ? 'bg-white text-black shadow-sm'
              : 'bg-white/5 text-[#86868b] hover:bg-white/10 hover:text-white'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  );

  /* ── Section wrapper ── */
  const Section = (title: string, children: React.ReactNode) => (
    <section className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 space-y-4">
      <h2 className="text-[11px] font-semibold text-[#86868b] uppercase tracking-[0.08em]">
        {title}
      </h2>
      {children}
    </section>
  );

  /* ── Preset labels ── */
  const presetLabels: Record<PositionPreset, string> = {
    'top-left': '\u2196 T-L',
    top: '\u2191 Top',
    'top-right': '\u2197 T-R',
    center: '\u2299 Ctr',
    'bottom-left': '\u2199 B-L',
    bottom: '\u2193 Bot',
    'bottom-right': '\u2198 B-R',
    middle: '\u2195 Mid',
  };

  const CASE_LABELS: Record<CaseMode, string> = {
    keep: 'Aa',
    uppercase: 'ABC',
    lowercase: 'abc',
  };

  const ALIGN_LABELS: Record<TextAlign, string> = {
    left: '\u2261 Left',
    center: '\u2261 Ctr',
    right: '\u2261 Right',
  };

  return (
    <main
      className="min-h-screen bg-black text-[#F5F5F7] antialiased selection:bg-white/20"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto">
        {/* ─── Controls ─── */}
        <aside className="w-full lg:w-[340px] xl:w-[380px] shrink-0 space-y-5 overflow-y-auto lg:max-h-[calc(100vh-4rem)] lg:sticky lg:top-8">
          <header className="pb-1">
            <h1 className="text-2xl font-bold tracking-tight">tf</h1>
            <p className="text-sm text-[#86868b] mt-0.5">
              image macro maker
            </p>
          </header>

          {/* Image */}
          {Section('Image',
            <>
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-white/[0.08] rounded-xl p-5 text-center transition-colors hover:border-white/25">
                  {image ? (
                    <div className="flex items-center gap-3 justify-center">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-[#86868b]">
                        {Math.round(image.width / image.height * 100)}%
                      </div>
                      <p className="text-xs text-[#86868b]">
                        {image.naturalWidth}&times;{image.naturalHeight}
                      </p>
                      <span className="text-xs text-[#2997ff] hover:underline">
                        Change
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Upload Image</p>
                      <p className="text-xs text-[#86868b] mt-1">
                        PNG, JPG, WebP
                      </p>
                    </>
                  )}
                </div>
              </label>

              <div>
                <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                  Fit
                </span>
                {ButtonGroup<FitMode>(FIT_MODES, fitMode, setFitMode)}
              </div>
            </>,
          )}

          {/* Effects */}
          {Section('Effects',
            <>
              {Slider('Darken', darken, `${darken}%`, 0, 100, setDarken)}
              {Slider('Blur', blur, `${blur}px`, 0, 20, setBlur, 0.5)}
            </>,
          )}

          {/* Caption */}
          {Section('Caption',
            <>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Enter your caption\u2026"
                rows={3}
                className="w-full bg-black/50 border border-white/[0.08] rounded-xl p-3 text-sm text-white placeholder-[#86868b]
                  resize-none focus:outline-none focus:border-white/25 transition-colors"
              />
              <div>
                <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                  Case
                </span>
                {ButtonGroup<CaseMode>(CASE_MODES, caseMode, setCaseMode, CASE_LABELS)}
              </div>
            </>,
          )}

          {/* Typography */}
          {Section('Typography',
            <>
              <div>
                <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                  Font
                </span>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-black/50 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white
                    focus:outline-none focus:border-white/25 transition-colors"
                >
                  <option value="Upright">Upright</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                </select>
              </div>

              {Slider('Weight', fontWeight, String(fontWeight), 100, 900, setFontWeight)}
              {Slider('Size', fontSize, `${fontSize}px`, 20, 300, setFontSize)}
              {Slider('Line Height', lineHeight, lineHeight.toFixed(1), 0.8, 2.0, setLineHeight, 0.1)}
              {Slider('Outline', outlineSize, `${outlineSize}px`, 0, 50, setOutlineSize)}

              <div className="flex gap-4">
                <div className="flex-1">
                  <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                    Text
                  </span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="block w-full h-8 rounded-lg cursor-pointer border-0 bg-transparent
                      [&::-webkit-color-swatch-wrapper]:p-0
                      [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                    Outline
                  </span>
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) => setOutlineColor(e.target.value)}
                    className="block w-full h-8 rounded-lg cursor-pointer border-0 bg-transparent
                      [&::-webkit-color-swatch-wrapper]:p-0
                      [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                  />
                </div>
              </div>

              <div>
                <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                  Alignment
                </span>
                {ButtonGroup<TextAlign>(TEXT_ALIGNS, textAlign, setTextAlign, ALIGN_LABELS)}
              </div>
            </>,
          )}

          {/* Position */}
          {Section('Position',
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPositionPreset(preset)}
                    className="px-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/5 text-[#86868b]
                      hover:bg-white/10 hover:text-white transition-colors leading-none"
                  >
                    {presetLabels[preset]}
                  </button>
                ))}
              </div>

              {Slider('X', textX, String(textX), 0, exportSize, setTextX)}
              {Slider('Y', textY, String(textY), 0, exportSize, setTextY)}
            </>,
          )}

          {/* Export */}
          {Section('Export',
            <>
              <div>
                <span className="text-xs text-[#86868b] font-medium block mb-1.5">
                  Size
                </span>
                <div className="flex gap-1.5">
                  {EXPORT_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setExportSize(size)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        exportSize === size
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-white/5 text-[#86868b] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleExport}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#2997ff] text-white text-sm font-semibold
                    hover:bg-[#47a3ff] active:scale-[0.97] transition-all shadow-lg shadow-[#2997ff]/20"
                >
                  Export PNG
                </button>
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium
                    hover:bg-white/20 active:scale-[0.97] transition-all"
                >
                  Reset
                </button>
              </div>
            </>,
          )}
        </aside>

        {/* ─── Canvas Preview ─── */}
        <div className="flex-1 flex items-start justify-center pt-0 lg:pt-12">
          <div className="w-full max-w-[600px]">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="w-full aspect-square rounded-2xl shadow-2xl shadow-black/50"
                style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
              {!image && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#86868b"
                        strokeWidth="1.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#86868b] font-medium">
                      Upload an image to begin
                    </p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-center text-xs text-[#86868b] mt-3">
              {image
                ? `${exportSize}\u00D7${exportSize} \u00B7 Drag text to reposition`
                : `${exportSize}\u00D7${exportSize}`}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
