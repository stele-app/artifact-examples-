/**
 * @stele-manifest
 * name: Build with Claude — Archetype A (Self-Contained)
 * version: 1.0.0
 * author: stele.au
 * description: A copy-pasteable Claude prompt that briefs the model on how to build a self-contained Stele artifact — no server, no login, runs offline. Examples include calculators, games, checklists, learning tools.
 * archetype: self-contained
 * requires:
 *   - clipboard-write
 */

import { useState } from 'react';
import { Copy, Check, FileCode, Sparkles, Lock, Globe } from 'lucide-react';

const PROMPT_TEXT = `Build a Stele artifact — a single-file, sandboxed, self-contained interactive React component that runs in the Stele runtime (https://stele.au).

FORMAT — JSX/TSX file with a manifest block at the top:

  /**
   * @stele-manifest
   * name: <Display name>
   * version: 1.0.0
   * description: <One line summary>
   * archetype: self-contained
   * requires:
   *   - <capability>
   */

  import { useState } from 'react';
  // ...other vendor imports

  export default function MyArtifact() {
    return <div>...</div>;
  }

RULES

- Single file. No relative imports.
- Default-export a React component (Stele auto-mounts it — do NOT call ReactDOM.render).
- React 19 with auto JSX runtime — do NOT 'import React'.
- Tailwind CDN is preloaded with JIT — use Tailwind classes freely.
- Layout for ~800–1200px viewer iframe; make it responsive.
- Use lucide-react for icons.

VENDOR LIBS YOU CAN IMPORT (these are the ONLY ones — anything else fails silently)

react · react-dom · lucide-react · recharts · three · mathjs · d3 ·
chart.js · plotly.js · papaparse · lodash · mammoth · xlsx · tone

CAPABILITIES — must be declared in 'requires:' or they fail by default

- geolocation, camera, microphone — browser hardware APIs
- clipboard-read, clipboard-write — Clipboard API
- network: https://host  — fetch / WebSocket allowlist for that origin only.
  Wildcards: network: https://*.example.com  (add one entry per origin)

PERSISTENCE — use window.storage, NOT localStorage

The sandbox iframe is null-origin, so localStorage is wiped on every reload.
For state that survives reopens use the async window.storage API:

  await window.storage.set('key', value);    // JSON-serialisable
  const v = await window.storage.get('key');
  await window.storage.delete('key');
  const keys = await window.storage.list('prefix');  // string[]

Storage is keyed to the artifact's content hash — your artifact can't read
other artifacts' data.

WHAT NOT TO DO

- No CDN script tags or imports from URLs. Vendor list only.
- No <form action="..."> — CSP blocks it. Use onSubmit + JS.
- No localStorage / sessionStorage / IndexedDB — use window.storage.
- No iframes (frame-src 'none').
- No ReactDOM.render — default export is mounted automatically.

SELF-CONTAINED MEANING

Everything to make it work is inside this one file. No backend, no login,
no account. Copying the file copies the app. Good for:

  games · calculators · checklists · learning tools · recipes ·
  PDF utilities · timers · planners · single-task tools · offline reference

NOW BUILD

[Describe the artifact: what it does, the user flow, data model, and any
persistence needs. Be specific about the desired interactions.]
`;

const EXAMPLE_USES = [
  { icon: Sparkles, label: 'Games & toys',         note: 'Battleship, Tamagotchi, Space Invaders' },
  { icon: FileCode, label: 'Calculators',          note: 'GST, BMI, mortgage, unit converters' },
  { icon: Lock,     label: 'Offline reference',    note: 'Flashcards, allergy cards, manuals' },
  { icon: Globe,    label: 'Single-task utilities', note: 'PDF rotator, JSON viewer, QR generator' },
];

export default function PromptArchetypeA() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* swallow — capability may not be granted */
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-6 py-10">
      <div className="max-w-3xl mx-auto">

        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Archetype A · self-contained
        </div>

        <h1 className="text-3xl font-semibold tracking-tight mb-2">Build with Claude — self-contained artifact</h1>
        <p className="text-slate-600 leading-relaxed mb-8">
          Paste the prompt below into Claude (claude.ai or Claude Code), then describe
          what you want at the bottom. Claude will produce a single <code className="text-emerald-700">.stele</code> file
          you can drop into Stele Desktop or paste at <a href="https://stele.au" className="text-emerald-700 underline">stele.au</a>.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {EXAMPLE_USES.map(({ icon: Icon, label, note }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <Icon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-slate-500">{note}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-slate-900 text-slate-100 overflow-hidden border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
            <div className="text-xs font-medium text-slate-400">Claude prompt</div>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy prompt</>}
            </button>
          </div>
          <pre className="px-4 py-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">{PROMPT_TEXT}</pre>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <div className="font-semibold mb-1">How to use this</div>
          <ol className="list-decimal list-inside space-y-1 text-emerald-800">
            <li>Hit <strong>Copy prompt</strong> above.</li>
            <li>Open <a href="https://claude.ai" className="underline">claude.ai</a> (or any Claude chat).</li>
            <li>Paste, then replace the <code className="bg-emerald-100 px-1 rounded">[Describe the artifact...]</code> block with your idea.</li>
            <li>Save Claude's reply as <code className="bg-emerald-100 px-1 rounded">myartifact.stele</code> and open it in Stele.</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
