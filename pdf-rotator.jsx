/**
 * @stele-manifest
 * name: PDF Rotator
 * description: Drop a PDF, rotate any page 90 degrees at a time, download the rewritten file. Pages are previewed as thumbnails. Everything runs locally on your device.
 * archetype: self-contained
 * requires:
 *   - network: https://esm.sh
 *   - network: https://cdnjs.cloudflare.com
 *   - downloads
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const PDFLIB_URL = 'https://esm.sh/pdf-lib@1.17.1';

const PURPLE = '#5B2A86';
const BLUE = '#1FA2FF';

export default function PdfRotator() {
  const [libsReady, setLibsReady] = useState(false);
  const [libsError, setLibsError] = useState('');
  const libsRef = useRef({});

  const [thumbnails, setThumbnails] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [filename, setFilename] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const pdfBytesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pdfjs, pdfLib] = await Promise.all([
          import(/* @vite-ignore */ PDFJS_URL),
          import(/* @vite-ignore */ PDFLIB_URL),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        if (!cancelled) {
          libsRef.current = { pdfjs, pdfLib };
          setLibsReady(true);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLibsError('Could not load PDF libraries.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadPdf = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('That file is not a PDF.');
      return;
    }
    if (!libsReady) {
      setError('Libraries still loading, try again in a second.');
      return;
    }

    setError('');
    setLoading(true);
    setThumbnails([]);
    setRotations([]);
    setFilename(file.name.replace(/\.pdf$/i, ''));

    try {
      const { pdfjs } = libsRef.current;
      const arrayBuffer = await file.arrayBuffer();
      pdfBytesRef.current = arrayBuffer.slice(0);

      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const thumbs = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        thumbs.push(canvas.toDataURL('image/png'));
      }

      setThumbnails(thumbs);
      setRotations(new Array(thumbs.length).fill(0));
    } catch (err) {
      console.error(err);
      setError('Could not read that PDF. Try another file.');
    } finally {
      setLoading(false);
    }
  }, [libsReady]);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    loadPdf(e.dataTransfer.files?.[0]);
  };

  const onPick = (e) => loadPdf(e.target.files?.[0]);

  const rotatePage = (idx) => {
    setRotations((prev) => {
      const next = [...prev];
      next[idx] = (next[idx] + 90) % 360;
      return next;
    });
  };

  const resetAll = () => {
    setThumbnails([]);
    setRotations([]);
    setFilename('');
    setError('');
    pdfBytesRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadPdf = async () => {
    if (!pdfBytesRef.current || !libsReady) return;
    try {
      const { pdfLib } = libsRef.current;
      const pdfDoc = await pdfLib.PDFDocument.load(pdfBytesRef.current);
      const pages = pdfDoc.getPages();
      pages.forEach((page, i) => {
        const delta = rotations[i] || 0;
        if (delta) {
          const current = page.getRotation().angle;
          page.setRotation(pdfLib.degrees((current + delta) % 360));
        }
      });
      const out = await pdfDoc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(filename || 'document').trim() || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      setError('Could not save the PDF.');
    }
  };

  const hasFile = thumbnails.length > 0;
  const dirtyCount = rotations.filter((r) => r !== 0).length;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.title}>PDF Rotator</div>
          <div style={styles.subtitle}>
            {libsReady
              ? 'Drop a PDF, click any page to rotate, then download.'
              : libsError || 'Loading PDF libraries…'}
          </div>
        </header>

        {!hasFile && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...styles.dropzone,
              borderColor: isDragging ? BLUE : '#cbd5e1',
              background: isDragging ? '#eff6ff' : '#f8fafc',
              opacity: libsReady ? 1 : 0.6,
              cursor: libsReady ? 'pointer' : 'wait',
            }}
          >
            <div style={styles.dropIcon}>⬆</div>
            <div style={styles.dropTitle}>
              {loading ? 'Loading…' : isDragging ? 'Drop it here' : 'Drag a PDF here'}
            </div>
            <div style={styles.dropHint}>or click to choose a file</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={onPick}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {hasFile && (
          <>
            <div style={styles.toolbar}>
              <div style={styles.field}>
                <label style={styles.label}>File name</label>
                <div style={styles.nameRow}>
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    style={styles.input}
                    placeholder="document"
                  />
                  <span style={styles.ext}>.pdf</span>
                </div>
              </div>

              <div style={styles.actions}>
                <button onClick={resetAll} style={styles.secondaryBtn}>
                  Load another
                </button>
                <button onClick={downloadPdf} style={styles.primaryBtn}>
                  Download {dirtyCount > 0 ? `(${dirtyCount} rotated)` : ''}
                </button>
              </div>
            </div>

            <div style={styles.grid}>
              {thumbnails.map((src, i) => (
                <button
                  key={i}
                  onClick={() => rotatePage(i)}
                  style={{
                    ...styles.thumbCard,
                    borderColor: rotations[i] ? BLUE : '#e2e8f0',
                    boxShadow: rotations[i]
                      ? `0 0 0 2px ${BLUE}33`
                      : '0 1px 2px rgba(15,23,42,0.06)',
                  }}
                  title={`Page ${i + 1} — click to rotate`}
                >
                  <div style={styles.thumbInner}>
                    <img
                      src={src}
                      alt={`Page ${i + 1}`}
                      style={{
                        ...styles.thumbImg,
                        transform: `rotate(${rotations[i]}deg)`,
                      }}
                    />
                  </div>
                  <div style={styles.thumbFoot}>
                    <span>Page {i + 1}</span>
                    <span style={styles.rotBadge}>{rotations[i]}°</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)',
    padding: '32px 16px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: '#0f172a',
  },
  shell: {
    maxWidth: 1100,
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
  },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 700, color: PURPLE },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 4 },
  dropzone: {
    border: '2px dashed #cbd5e1',
    borderRadius: 14,
    padding: '60px 20px',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  dropIcon: { fontSize: 36, color: BLUE, marginBottom: 8 },
  dropTitle: { fontSize: 18, fontWeight: 600 },
  dropHint: { fontSize: 13, color: '#64748b', marginTop: 4 },
  error: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#fef2f2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: 14,
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '14px 0 18px',
    borderBottom: '1px solid #e2e8f0',
    marginBottom: 18,
  },
  field: { flex: '1 1 260px', minWidth: 220 },
  label: { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 },
  nameRow: { display: 'flex', alignItems: 'stretch' },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRight: 'none',
    borderRadius: '8px 0 0 8px',
    fontSize: 14,
    outline: 'none',
  },
  ext: {
    padding: '10px 12px',
    background: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '0 8px 8px 0',
    fontSize: 14,
    color: '#475569',
  },
  actions: { display: 'flex', gap: 10 },
  primaryBtn: {
    background: PURPLE,
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: '#fff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
    gap: 14,
  },
  thumbCard: {
    background: '#fff',
    border: '2px solid #e2e8f0',
    borderRadius: 10,
    padding: 8,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  thumbInner: {
    width: '100%',
    aspectRatio: '1 / 1',
    background: '#f8fafc',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    maxWidth: '90%',
    maxHeight: '90%',
    transition: 'transform 0.25s ease',
    boxShadow: '0 1px 3px rgba(15,23,42,0.15)',
  },
  thumbFoot: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#475569',
    padding: '0 2px',
  },
  rotBadge: {
    background: '#eef2ff',
    color: PURPLE,
    padding: '1px 6px',
    borderRadius: 999,
    fontWeight: 600,
  },
};
