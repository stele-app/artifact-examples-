/**
 * @stele-manifest
 * name: The Signer
 * version: 1.0.0
 * description: Drop in a PDF, draw your signature on the pad, place it where you want, download the signed file. Runs entirely in your browser — the PDF never leaves your device. Companion piece to The Rotator.
 * archetype: self-contained
 * requires:
 *   - network: https://cdnjs.cloudflare.com
 */

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window { PDFLib: any }
}

// pdf-lib UMD — fetched at runtime and eval'd. Direct <script src=cdn> is blocked
// by the sandbox CSP, but fetch is allowed once the network: capability is granted
// and 'unsafe-eval' lets us run the source. The library mounts itself on window.PDFLib.
const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

async function loadPdfLib(): Promise<any> {
  if (window.PDFLib) return window.PDFLib;
  const res = await fetch(PDF_LIB_URL);
  if (!res.ok) throw new Error(`PDF library fetch failed (${res.status})`);
  const src = await res.text();
  // eslint-disable-next-line no-new-func
  new Function(src)();
  if (!window.PDFLib) throw new Error('PDF library did not register on window');
  return window.PDFLib;
}

// ─── Signature pad ──────────────────────────────────────────────────────────

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
}

function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Match the canvas backing store to its CSS size for crisp lines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a1714';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!hasInk) setHasInk(true);
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current!;
    canvas.releasePointerCapture(e.pointerId);
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
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
        <div className="xs-label">{hasInk ? 'looks good' : 'draw above'}</div>
        <button className="btn btn-ghost" onClick={clear} disabled={!hasInk}>Clear</button>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

type Position = 'tl' | 'tr' | 'bl' | 'br' | 'center';
type PageMode = 'last' | 'first' | 'all';
type SizeOpt = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<SizeOpt, number> = { sm: 100, md: 150, lg: 220 };
const SIZE_LABEL: Record<SizeOpt, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

export default function Signer() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState<string>('');
  const [pdfPages, setPdfPages] = useState<number>(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>('br');
  const [pageMode, setPageMode] = useState<PageMode>('last');
  const [sizeOpt, setSizeOpt] = useState<SizeOpt>('md');
  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fetch pdf-lib so the user sees zero delay on click
  useEffect(() => {
    loadPdfLib()
      .then(() => setLibReady(true))
      .catch((err: any) => setLibError(err.message ?? String(err)));
  }, []);

  const ingestFile = useCallback(async (file: File) => {
    setSignError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setSignError('That file does not look like a PDF.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // peek at page count via pdf-lib (only after load)
      const PDFLib = await loadPdfLib();
      const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
      setPdfBytes(bytes);
      setPdfName(file.name);
      setPdfPages(doc.getPageCount());
    } catch (err: any) {
      setSignError(`Couldn't read that PDF: ${err.message ?? String(err)}`);
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
    setPdfBytes(null); setPdfName(''); setPdfPages(0);
    setSignature(null); setSignError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const signAndDownload = async () => {
    if (!pdfBytes || !signature) return;
    setSigning(true);
    setSignError(null);
    try {
      const PDFLib = await loadPdfLib();
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      const sigBytes = await fetch(signature).then((r) => r.arrayBuffer());
      const sigImage = await doc.embedPng(sigBytes);

      const pages = doc.getPages();
      const targetIdx =
        pageMode === 'all' ? pages.map((_: unknown, i: number) => i)
        : pageMode === 'first' ? [0]
        : [pages.length - 1];

      const sigW = SIZE_PX[sizeOpt];
      const aspect = sigImage.height / sigImage.width;
      const sigH = sigW * aspect;
      const margin = 36;

      for (const i of targetIdx) {
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();
        let x = margin, y = margin;
        switch (position) {
          case 'tl': x = margin; y = ph - sigH - margin; break;
          case 'tr': x = pw - sigW - margin; y = ph - sigH - margin; break;
          case 'bl': x = margin; y = margin; break;
          case 'br': x = pw - sigW - margin; y = margin; break;
          case 'center': x = (pw - sigW) / 2; y = (ph - sigH) / 2; break;
        }
        page.drawImage(sigImage, { x, y, width: sigW, height: sigH });
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
      setSignError(`Signing failed: ${err.message ?? String(err)}`);
    } finally {
      setSigning(false);
    }
  };

  const canSign = !!pdfBytes && !!signature && libReady && !signing;

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

          {/* Header */}
          <header className="head">
            <div className="xs-label">Stele &middot; 02</div>
            <h1 className="title font-display">The Signer</h1>
            <p className="sub">
              Drop a PDF. Draw your signature. Pick a corner. Save it back. The
              file never leaves your device — it's signed in your browser, by
              you.
            </p>
            <div className="ink-line" />
          </header>

          {/* Step 1 — drop */}
          {!pdfBytes && (
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
            </section>
          )}

          {/* Step 2 + 3 — once a PDF is in */}
          {pdfBytes && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="step-tag">Step 02 &nbsp;·&nbsp; Loaded</div>
                    <div className="filename font-display">{pdfName}</div>
                    <div className="src">
                      {pdfPages} page{pdfPages === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button className="btn btn-ghost" onClick={reset}>Reset</button>
                </div>
              </section>

              <section className="panel">
                <div className="step-tag">Step 03 &nbsp;·&nbsp; Draw your signature</div>
                <SignaturePad onChange={setSignature} />
              </section>

              <section className="panel">
                <div className="step-tag">Step 04 &nbsp;·&nbsp; Place it</div>

                <div className="control-grid">
                  <div className="control">
                    <div className="xs-label">Pages</div>
                    <div className="seg">
                      {(['last', 'first', 'all'] as PageMode[]).map((m) => (
                        <button
                          key={m}
                          className={`seg-btn ${pageMode === m ? 'on' : ''}`}
                          onClick={() => setPageMode(m)}
                        >
                          {m === 'last' ? 'Last only' : m === 'first' ? 'First only' : 'All pages'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control">
                    <div className="xs-label">Position</div>
                    <div className="pos-grid">
                      {(['tl', 'tr', 'bl', 'br', 'center'] as Position[]).map((p) => (
                        <button
                          key={p}
                          className={`pos-cell ${p === 'center' ? 'is-center' : ''} pos-${p} ${position === p ? 'on' : ''}`}
                          onClick={() => setPosition(p)}
                          aria-label={`Position ${p}`}
                        >
                          <span className="dot" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control">
                    <div className="xs-label">Size</div>
                    <div className="seg">
                      {(['sm', 'md', 'lg'] as SizeOpt[]).map((s) => (
                        <button
                          key={s}
                          className={`seg-btn ${sizeOpt === s ? 'on' : ''}`}
                          onClick={() => setSizeOpt(s)}
                        >
                          {SIZE_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="cta-row">
                  <button
                    className="btn primary"
                    onClick={signAndDownload}
                    disabled={!canSign}
                  >
                    {signing ? 'Signing…' : 'Sign & download'}
                  </button>
                  {!libReady && !libError && (
                    <span className="hint">Loading PDF engine…</span>
                  )}
                </div>

                {(signError || libError) && (
                  <div className="error">{signError || libError}</div>
                )}
              </section>
            </>
          )}

          <footer className="foot">
            <span className="xs-label">Stele · self-contained · runs offline once loaded</span>
            <span className="xs-label">pdf-lib · MIT</span>
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
.wrap { position: relative; max-width: 880px; margin: 0 auto; padding: 40px 24px; z-index: 2; }
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

.step-tag { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filename { font-size: clamp(22px, 3.2vw, 30px); line-height: 1.1; word-break: break-all; max-width: 100%; }
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
.drop .hint { font-size: 12px; color: var(--muted); margin: 4px 0 0; }
.hint { font-size: 12px; color: var(--muted); }

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

.sigpad-wrap { background: var(--paper-3); border: 1px solid var(--line); border-radius: 2px; padding: 12px; }
.sigpad {
  display: block; width: 100%; height: 200px; background: #fbf7ea;
  border: 1px dashed var(--rule); border-radius: 2px;
  touch-action: none; cursor: crosshair;
}
.sigpad-row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }

.control-grid {
  display: grid; gap: 24px; margin-top: 4px;
  grid-template-columns: 1fr;
}
@media (min-width: 720px) { .control-grid { grid-template-columns: 1fr 1fr 1fr; gap: 32px; } }
.control .xs-label { margin-bottom: 10px; }

.seg { display: flex; flex-wrap: wrap; gap: 6px; }
.seg-btn {
  font-family: inherit; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 8px 12px; background: transparent; border: 1px solid var(--rule); color: var(--ink-soft);
  border-radius: 2px; cursor: pointer;
}
.seg-btn:hover { border-color: var(--ink); color: var(--ink); }
.seg-btn.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }

.pos-grid {
  display: grid; grid-template-columns: repeat(3, 36px); grid-template-rows: repeat(3, 36px);
  gap: 6px; padding: 6px; background: var(--paper-3); border: 1px solid var(--line); border-radius: 2px;
  width: max-content;
}
.pos-cell {
  border: 1px solid var(--rule); background: var(--paper-2); border-radius: 2px;
  cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;
}
.pos-cell:hover { border-color: var(--ink); }
.pos-cell .dot {
  width: 6px; height: 6px; background: var(--muted); border-radius: 50%; opacity: 0.4;
}
.pos-cell.on { background: var(--ink); border-color: var(--ink); }
.pos-cell.on .dot { background: var(--accent); opacity: 1; }
.pos-tl { grid-column: 1; grid-row: 1; }
.pos-tr { grid-column: 3; grid-row: 1; }
.pos-bl { grid-column: 1; grid-row: 3; }
.pos-br { grid-column: 3; grid-row: 3; }
.pos-center { grid-column: 2; grid-row: 2; }

.cta-row { margin-top: 26px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.error {
  margin-top: 16px; padding: 10px 14px; background: #fbe6df; border: 1px solid var(--accent);
  color: #6f2412; font-size: 12px; border-radius: 2px;
}

.foot {
  margin-top: 32px; padding-top: 18px; border-top: 1px dashed var(--rule);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
}
`;
