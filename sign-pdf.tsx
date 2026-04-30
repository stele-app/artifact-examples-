/**
 * @stele-manifest
 * name: The Signer
 * version: 2.0.0
 * description: Drop a PDF, draw your signature, click anywhere on any page to drop a signature + date stamp. Place as many as you want, then download the signed PDF. Runs entirely in your browser — the file never leaves your device. Companion piece to The Rotator.
 * archetype: self-contained
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// ─── Types ──────────────────────────────────────────────────────────────────

type SizeOpt = 'sm' | 'md' | 'lg';

interface Placement {
  id: string;
  pageIndex: number;          // 0-based
  xRatio: number;             // 0..1, fraction of page width (top-left origin)
  yRatio: number;
  size: SizeOpt;
  withDate: boolean;
  date: string;               // YYYY-MM-DD
}

interface RenderedPage {
  pageNum: number;            // 1-based for display
  pdfWidth: number;           // raw PDF coord units
  pdfHeight: number;
  imageDataUrl: string;
  width: number;              // rendered px
  height: number;
}

// Signature width in PDF points for each size option.
// Aspect ratio comes from the signature canvas (3:1 — see SIG_W/H below).
const SIG_W_PT: Record<SizeOpt, number> = { sm: 90, md: 130, lg: 180 };
const SIZE_LABEL: Record<SizeOpt, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

// Signature canvas dimensions
const SIG_W = 600;
const SIG_H = 200;

// PDF render scale — 2x for crisp display on hidpi
const RENDER_SCALE = 2;

// Decode a data:image/png;base64,... URL to raw bytes WITHOUT fetch().
// fetch(dataUrl) goes through CSP connect-src, which is 'none' for
// no-network artifacts — so the fetch fails. atob keeps everything in-process.
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Signature pad ──────────────────────────────────────────────────────────

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  hasSignature: boolean;
}

function SignaturePad({ onChange, hasSignature }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Set fixed backing-store size for consistent stroke width across DPRs
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = SIG_W;
    c.height = SIG_H;
  }, []);

  const getPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIG_W,
      y: ((e.clientY - rect.top) / rect.height) * SIG_H,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a1714';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current!.releasePointerCapture(e.pointerId);
    onChange(canvasRef.current!.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  return (
    <div className="sigpad-wrap">
      <canvas
        ref={canvasRef}
        className="sigpad"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="sigpad-row">
        <div className="xs-label">{hasSignature ? 'looks good — click on a page to place' : 'draw your signature above'}</div>
        <button className="btn btn-ghost" onClick={clear} disabled={!hasSignature}>Clear</button>
      </div>
    </div>
  );
}

// ─── Page view ──────────────────────────────────────────────────────────────

interface PageViewProps {
  page: RenderedPage;
  pageIndex: number;
  placements: Placement[];
  onClick: (pageIndex: number, xRatio: number, yRatio: number) => void;
  onRemove: (id: string) => void;
  signature: string | null;
  canPlace: boolean;
}

function PageView({ page, pageIndex, placements, onClick, onRemove, signature, canPlace }: PageViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!canPlace) return;
    if (e.target instanceof HTMLElement && e.target.closest('.stamp-remove')) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    onClick(pageIndex, xRatio, yRatio);
  };

  return (
    <div className="page-frame">
      <div className="page-num xs-label">Page {page.pageNum}</div>
      <div
        ref={wrapRef}
        className={`page-canvas ${canPlace ? 'placeable' : ''}`}
        onClick={handleClick}
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.imageDataUrl} alt={`Page ${page.pageNum}`} draggable={false} />
        {placements.map((p) => {
          // Width as a fraction of page width (height comes from the signature's
          // intrinsic 3:1 aspect ratio — see SIG_W / SIG_H constants).
          const widthRatio = SIG_W_PT[p.size] / page.pdfWidth;
          return (
            <div
              key={p.id}
              className="stamp"
              style={{
                left: `${p.xRatio * 100}%`,
                top: `${p.yRatio * 100}%`,
                width: `${widthRatio * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {signature && (
                <img
                  src={signature}
                  alt="signature"
                  draggable={false}
                  style={{ width: '100%', display: 'block' }}
                />
              )}
              {p.withDate && (
                <div className="stamp-date">{p.date}</div>
              )}
              <button
                className="stamp-remove"
                onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
                aria-label="Remove signature"
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function Signer() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState<string>('');
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [withDate, setWithDate] = useState(true);
  const [size, setSize] = useState<SizeOpt>('md');
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canPlace = !!signature && pages.length > 0;

  const ingestFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('That file does not look like a PDF.');
      return;
    }
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      // pdfjs mutates the input array — keep a clean copy for pdf-lib later.
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const out: RenderedPage[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const pdfPage = await pdf.getPage(i);
        const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d')!;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        const view = pdfPage.view;          // [x1, y1, x2, y2] in PDF points
        out.push({
          pageNum: i,
          pdfWidth: view[2] - view[0],
          pdfHeight: view[3] - view[1],
          imageDataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      }
      setPdfBytes(bytes);
      setPdfName(file.name);
      setPages(out);
      setPlacements([]);
    } catch (err: any) {
      setError(`Couldn't read that PDF: ${err.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void ingestFile(f);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void ingestFile(f);
  };

  const reset = () => {
    setPdfBytes(null); setPdfName(''); setPages([]); setPlacements([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const placeStamp = (pageIndex: number, xRatio: number, yRatio: number) => {
    setPlacements((ps) => [
      ...ps,
      {
        id: uid(),
        pageIndex,
        xRatio,
        yRatio,
        size,
        withDate,
        date: todayISO(),
      },
    ]);
  };

  const removeStamp = (id: string) => {
    setPlacements((ps) => ps.filter((p) => p.id !== id));
  };

  const clearAllStamps = () => setPlacements([]);

  const signAndDownload = async () => {
    if (!pdfBytes || !signature || placements.length === 0) return;
    setSigning(true);
    setError(null);
    try {
      const doc = await PDFDocument.load(pdfBytes);
      const sigBytes = dataUrlToBytes(signature);
      const sigImage = await doc.embedPng(sigBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const docPages = doc.getPages();

      for (const p of placements) {
        const page = docPages[p.pageIndex];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        const sigW = SIG_W_PT[p.size];
        // Maintain canvas aspect (3:1).
        const sigH = sigW * (SIG_H / SIG_W);
        // ratio is top-left origin → flip Y for PDF (bottom-left origin).
        const cx = p.xRatio * pw;
        const cy = ph - p.yRatio * ph;
        const x = cx - sigW / 2;
        const y = cy - sigH / 2;
        page.drawImage(sigImage, { x, y, width: sigW, height: sigH });
        if (p.withDate) {
          const fontSize = Math.max(8, Math.round(sigW / 14));
          const textWidth = font.widthOfTextAtSize(p.date, fontSize);
          page.drawText(p.date, {
            x: cx - textWidth / 2,
            y: y - fontSize - 4,
            size: fontSize,
            font,
            color: rgb(0.10, 0.09, 0.08),
          });
        }
      }

      const out = await doc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfName.replace(/\.pdf$/i, '') + '-signed.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(`Signing failed: ${err.message ?? String(err)}`);
    } finally {
      setSigning(false);
    }
  };

  const stampsByPage = useMemo(() => {
    const m: Record<number, Placement[]> = {};
    for (const p of placements) {
      (m[p.pageIndex] ||= []).push(p);
    }
    return m;
  }, [placements]);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=JetBrains+Mono:wght@400;500;700&display=swap"
      />
      <style>{CSS}</style>

      <div className="page">
        <div className="grain" aria-hidden="true" />
        <div className="wrap">

          <header className="head">
            <div className="xs-label">Stele &middot; 02</div>
            <h1 className="title font-display">The Signer</h1>
            <p className="sub">
              Drop a PDF. Draw your signature. Click anywhere on any page to
              drop a signature + date stamp. Place as many as you like. Download
              the signed file. Nothing leaves your device.
            </p>
            <div className="ink-line" />
          </header>

          {!pdfBytes && !loading && (
            <section className="panel">
              <div className="step-tag">Step 01</div>
              <div
                className={`drop ${dragging ? 'dragging' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
              >
                <div style={{ textAlign: 'center' }}>
                  <div className={`disc ${dragging ? 'dragging' : ''}`}>↓</div>
                  <p className="big font-display">Drop a PDF here</p>
                  <p className="hint">or click to choose a file</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                onChange={onFilePick}
              />
              {error && <div className="error">{error}</div>}
            </section>
          )}

          {loading && (
            <section className="panel">
              <div className="step-tag">Loading</div>
              <p className="font-display" style={{ fontSize: 24, margin: 0 }}>Reading the PDF…</p>
              <p className="hint" style={{ marginTop: 4 }}>Each page is rendered locally.</p>
            </section>
          )}

          {pdfBytes && pages.length > 0 && (
            <>
              <section className="panel sticky-top">
                <div className="panel-head">
                  <div className="meta-col">
                    <div className="step-tag">Loaded</div>
                    <div className="filename font-display">{pdfName}</div>
                    <div className="src">
                      {pages.length} page{pages.length === 1 ? '' : 's'}
                      {' · '}
                      {placements.length} stamp{placements.length === 1 ? '' : 's'} placed
                    </div>
                  </div>
                  <div className="head-actions">
                    {placements.length > 0 && (
                      <button className="btn btn-ghost" onClick={clearAllStamps}>Clear stamps</button>
                    )}
                    <button className="btn btn-ghost" onClick={reset}>New PDF</button>
                  </div>
                </div>

                <SignaturePad onChange={setSignature} hasSignature={!!signature} />

                <div className="control-grid">
                  <div className="control">
                    <div className="xs-label">Size</div>
                    <div className="seg">
                      {(['sm', 'md', 'lg'] as SizeOpt[]).map((s) => (
                        <button
                          key={s}
                          className={`seg-btn ${size === s ? 'on' : ''}`}
                          onClick={() => setSize(s)}
                        >
                          {SIZE_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control">
                    <div className="xs-label">With date</div>
                    <div className="seg">
                      <button
                        className={`seg-btn ${withDate ? 'on' : ''}`}
                        onClick={() => setWithDate(true)}
                      >On — {todayISO()}</button>
                      <button
                        className={`seg-btn ${!withDate ? 'on' : ''}`}
                        onClick={() => setWithDate(false)}
                      >Off</button>
                    </div>
                  </div>
                </div>

                <div className="cta-row">
                  <button
                    className="btn primary"
                    onClick={signAndDownload}
                    disabled={!signature || placements.length === 0 || signing}
                  >
                    {signing ? 'Signing…' : `Sign & download${placements.length ? ` (${placements.length})` : ''}`}
                  </button>
                  {!signature && <span className="hint">draw a signature first</span>}
                  {signature && placements.length === 0 && <span className="hint">click on the PDF to place</span>}
                </div>

                {error && <div className="error">{error}</div>}
              </section>

              <section>
                {pages.map((p, i) => (
                  <PageView
                    key={i}
                    page={p}
                    pageIndex={i}
                    placements={stampsByPage[i] || []}
                    onClick={placeStamp}
                    onRemove={removeStamp}
                    signature={signature}
                    canPlace={canPlace}
                  />
                ))}
              </section>
            </>
          )}

          <footer className="foot">
            <span className="xs-label">Stele · self-contained · runs offline</span>
            <span className="xs-label">pdf-lib + pdf.js · MIT</span>
          </footer>
        </div>
      </div>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --paper: #f1ebdc;
  --paper-2: #fbf7ea;
  --paper-3: #ede4cf;
  --ink: #1a1714;
  --ink-soft: #3d342a;
  --muted: #7a6a52;
  --rule: #d1c4a4;
  --line: #e2d8bf;
  --accent: #b24a2e;
}
* { box-sizing: border-box; }
.page {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--paper);
  color: var(--ink);
  background-image:
    radial-gradient(#d9cfb8 0.7px, transparent 0.7px),
    radial-gradient(#d9cfb8 0.7px, var(--paper) 0.7px);
  background-size: 22px 22px, 22px 22px;
  background-position: 0 0, 11px 11px;
  min-height: 100vh;
  position: relative;
}
.grain {
  position: fixed; inset: 0; pointer-events: none; opacity: 0.04; z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
.wrap { position: relative; max-width: 980px; margin: 0 auto; padding: 40px 24px; z-index: 2; }
@media (min-width: 768px) { .wrap { padding: 56px 40px; } }

.font-display { font-family: "Fraunces", Georgia, serif; font-variation-settings: "opsz" 144, "SOFT" 50; }
.xs-label { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); }
.ink-line { background: repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px); height: 1px; margin: 24px 0 32px; }

.head .title { font-size: clamp(44px, 7vw, 88px); line-height: 0.95; letter-spacing: -0.02em; margin: 8px 0 0; }
.head .sub { margin: 12px 0 0; max-width: 540px; font-size: 14px; color: var(--ink-soft); line-height: 1.6; }

.panel {
  background: var(--paper-2); border: 1px solid var(--line); border-radius: 2px;
  padding: 22px; margin-bottom: 22px;
}
@media (min-width: 768px) { .panel { padding: 28px; } }

.sticky-top {
  position: sticky; top: 0; z-index: 10;
  box-shadow: 0 8px 24px -16px rgba(60,40,20,0.25);
}

.step-tag { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.meta-col { flex: 1 1 240px; min-width: 0; }
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.filename { font-size: clamp(20px, 2.6vw, 26px); line-height: 1.1; word-break: break-all; }
.src { font-size: 11px; color: var(--muted); margin-top: 6px; }

.drop {
  background: var(--paper-2); border: 2px dashed var(--ink); border-radius: 2px;
  padding: 56px 24px; min-height: 280px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 200ms ease;
}
.drop.dragging { border-color: var(--accent); transform: scale(1.005); }
.disc {
  width: 64px; height: 64px; border-radius: 50%; background: var(--ink); color: var(--paper);
  display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 18px;
  font-size: 26px; transition: all 200ms;
}
.disc.dragging { background: var(--accent); }
.drop .big { font-size: clamp(28px, 4vw, 40px); line-height: 1; margin: 0 0 6px; }
.drop .hint, .hint { font-size: 12px; color: var(--muted); margin: 4px 0 0; }

.btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; font-size: 11px;
  letter-spacing: 0.2em; text-transform: uppercase;
  background: transparent; border: 1px solid var(--ink); border-radius: 2px;
  cursor: pointer; color: var(--ink); font-family: inherit;
}
.btn:hover { background: var(--ink); color: var(--paper); }
.btn:active { transform: translateY(1px); }
.btn[disabled] { opacity: 0.4; cursor: not-allowed; }
.btn.btn-ghost { padding: 8px 14px; font-size: 10px; }
.btn.primary {
  background: var(--accent); color: var(--paper); border-color: var(--accent);
  padding: 14px 26px; font-size: 12px;
}
.btn.primary:hover { background: #8f3a23; border-color: #8f3a23; }
.btn.primary[disabled] { background: var(--accent); border-color: var(--accent); }

.sigpad-wrap { background: var(--paper-3); border: 1px solid var(--line); border-radius: 2px; padding: 12px; margin-bottom: 16px; }
.sigpad {
  display: block; width: 100%; height: 160px; background: #fbf7ea;
  border: 1px dashed var(--rule); border-radius: 2px;
  touch-action: none; cursor: crosshair;
}
.sigpad-row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; gap: 12px; flex-wrap: wrap; }

.control-grid {
  display: grid; gap: 16px; margin: 8px 0 0;
  grid-template-columns: 1fr;
}
@media (min-width: 720px) { .control-grid { grid-template-columns: 1fr 1fr; gap: 28px; } }
.control .xs-label { margin-bottom: 8px; display: block; }

.seg { display: flex; flex-wrap: wrap; gap: 6px; }
.seg-btn {
  font-family: inherit; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 8px 12px; background: transparent; border: 1px solid var(--rule); color: var(--ink-soft);
  border-radius: 2px; cursor: pointer;
}
.seg-btn:hover { border-color: var(--ink); color: var(--ink); }
.seg-btn.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }

.cta-row { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--rule); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.error {
  margin-top: 16px; padding: 10px 14px; background: #fbe6df; border: 1px solid var(--accent);
  color: #6f2412; font-size: 12px; border-radius: 2px;
}

/* PDF page view */
.page-frame { margin-bottom: 28px; }
.page-num { margin-bottom: 8px; }
.page-canvas {
  position: relative;
  background: #fff;
  box-shadow: 0 1px 0 rgba(0,0,0,0.05), 0 14px 32px -18px rgba(60,40,20,0.35);
  border: 1px solid var(--line);
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}
.page-canvas.placeable { cursor: copy; }
.page-canvas img { width: 100%; height: 100%; display: block; pointer-events: none; }

.stamp {
  position: absolute;
  pointer-events: none;
  display: flex; flex-direction: column; align-items: center;
}
.stamp img { pointer-events: none; }
.stamp-date {
  margin-top: 2px;
  font-size: clamp(8px, 0.9vw, 11px);
  color: var(--ink);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  background: rgba(255,255,255,0.7);
  padding: 1px 4px;
  border-radius: 1px;
}
.stamp-remove {
  position: absolute; top: -10px; right: -10px;
  width: 22px; height: 22px;
  background: var(--accent); color: var(--paper);
  border: none; border-radius: 50%;
  font-size: 14px; line-height: 1; cursor: pointer;
  pointer-events: auto;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  font-family: inherit;
}
.stamp-remove:hover { background: #8f3a23; }

.foot {
  margin-top: 32px; padding-top: 18px; border-top: 1px dashed var(--rule);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
}
`;
