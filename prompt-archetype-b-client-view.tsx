/**
 * @stele-manifest
 * name: Build with Claude — Archetype B (Client-View)
 * version: 1.0.0
 * author: stele.au
 * description: A copy-pasteable Claude prompt for building a client-view Stele artifact — a token-authenticated portal that talks to your business's server. Examples include client portals, booking views, medical records, NDIS plans, tax docs.
 * archetype: client-view
 * server: https://api.example.com
 * requires:
 *   - clipboard-write
 *   - network: https://api.example.com
 */

import { useState } from 'react';
import { Copy, Check, Building2, Users, FileText, Stethoscope, Briefcase, ShieldCheck } from 'lucide-react';

const PROMPT_TEXT = `Build a Stele artifact in the CLIENT-VIEW archetype — a single-file React component that's a token-authenticated view of data living on YOUR server. The token comes from the URL fragment (#token=...) and the Stele runtime injects it as a Bearer header automatically.

FORMAT — JSX/TSX file with a manifest block at the top:

  /**
   * @stele-manifest
   * name: <Display name>
   * version: 1.0.0
   * description: <One line summary>
   * archetype: client-view
   * server: https://api.your-business.com
   * requires:
   *   - network: https://api.your-business.com
   *   - <other capabilities>
   */

  import { useEffect, useState } from 'react';

  export default function ClientView() {
    const [data, setData] = useState(null);
    useEffect(() => {
      window.stele.server.fetch('/jobs/123')
        .then((r) => r.json())
        .then(setData);
    }, []);
    return <div>...</div>;
  }

CRITICAL RULES FOR ARCHETYPE B

- 'archetype: client-view' is REQUIRED.
- 'server: https://...' is REQUIRED — the HTTPS origin of your authoritative API.
- 'requires:' MUST include 'network: <same-origin-as-server>' or fetches are blocked.
- DO NOT use plain fetch() to your server — use window.stele.server.fetch(path, options).
  The host injects 'Authorization: Bearer <token>' automatically. Plain fetch won't.
- The token comes from the URL fragment (#token=...). Fragments are NEVER sent to
  servers in access logs or referer headers — that's why we use them.
- The artifact NEVER stores or handles the raw token itself. Just call the proxy.

THE SERVER.FETCH API

  // GET (default)
  const r = await window.stele.server.fetch('/jobs/123');
  const data = await r.json();

  // POST with JSON body
  await window.stele.server.fetch('/jobs/123', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });

Path is relative to the manifest's 'server:'. Returns a fetch-style Response.

DISTRIBUTION PATTERN

You publish the artifact at a URL (GitHub raw, your CDN, R2, anywhere with CORS).
Each user gets a personalised share link with their token in the fragment:

  https://stele.au/view?src=<your-artifact-url>#token=<user-specific-token>

Email/text/Slack the link. The user clicks, Stele renders the artifact, and every
window.stele.server.fetch call is signed with their token. Your server enforces:

  - token validity (issuance, expiry, revocation)
  - per-user authorisation (this token may read job 123 but not 456)
  - rate limiting

If the token is revoked server-side, the artifact stops working — even though the
file is still on the user's device.

THE REST IS THE SAME AS A SELF-CONTAINED ARTIFACT

- React 19, default-export, auto-mounted, no ReactDOM.render
- No 'import React' (auto JSX runtime)
- Tailwind CDN preloaded — use Tailwind classes
- Vendor libs: react · react-dom · lucide-react · recharts · three · mathjs ·
  d3 · chart.js · plotly.js · papaparse · lodash · mammoth · xlsx · tone
- Persistence: window.storage (async, JSON-serialisable, isolated per artifact)
- No <form action="">, no localStorage, no iframes, no inline CDN <script> tags

CLIENT-VIEW MEANING

The file is a portable VIEW of data your business owns. Customers see their job,
patient sees their record, family sees their NDIS plan. Server stays the source
of truth — revocable, auditable, multi-device. The artifact is the UI; your
server is the substance.

EXAMPLES

  client portal · job tracker · medical record · NDIS plan ·
  tax statement · super balance · order detail · invoice ·
  insurance policy view · subscription dashboard · booking confirmation

NOW BUILD

[Describe what the user sees: the data shape your API returns, the routes the
artifact will call, the actions (read-only? approve/decline? upload?), and any
visual / branding notes.]
`;

const EXAMPLE_USES = [
  { icon: Building2,    label: 'Trade & services',  note: 'Job tracker, kitchen quote, booking detail' },
  { icon: Stethoscope,  label: 'Health',            note: 'Medical record, allergy plan, after-visit summary' },
  { icon: FileText,     label: 'Government',        note: 'NDIS plan, tax statement, rates notice' },
  { icon: Briefcase,    label: 'Business / SaaS',   note: 'Client portal, invoice, subscription view' },
  { icon: Users,        label: 'Education',         note: 'Student record, results, course progress' },
  { icon: ShieldCheck,  label: 'Insurance & legal', note: 'Policy view, claim status, contract' },
];

export default function PromptArchetypeB() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* swallow */
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-6 py-10">
      <div className="max-w-3xl mx-auto">

        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Archetype B · client-view · api.example.com
        </div>

        <h1 className="text-3xl font-semibold tracking-tight mb-2">Build with Claude — client-view artifact</h1>
        <p className="text-slate-600 leading-relaxed mb-6">
          A client-view artifact is a portable, token-authenticated view of data on YOUR server.
          Send a customer a link with their token in the URL fragment — Stele injects it as a
          Bearer header on every call. Server stays source of truth; revocable any time.
        </p>

        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 mb-8">
          <strong>You'll need a server.</strong> Stele provides the runtime, auth handshake, and the
          <code className="bg-amber-100 px-1 rounded mx-1">window.stele.server.fetch</code> proxy.
          You provide the API endpoints, token issuance, and revocation. Any HTTPS server works —
          Cloudflare Workers, Express, Django, anything.
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {EXAMPLE_USES.map(({ icon: Icon, label, note }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <Icon className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy prompt</>}
            </button>
          </div>
          <pre className="px-4 py-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">{PROMPT_TEXT}</pre>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          <div className="font-semibold mb-1">How to use this</div>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Replace <code className="bg-blue-100 px-1 rounded">https://api.example.com</code> in the prompt with your real API origin (both in <code className="bg-blue-100 px-1 rounded">server:</code> and the matching <code className="bg-blue-100 px-1 rounded">network:</code> entry).</li>
            <li>Hit <strong>Copy prompt</strong>, paste into Claude, describe your data shape and the actions the user can take.</li>
            <li>Host the resulting artifact (GitHub raw, R2, your CDN — anywhere with CORS).</li>
            <li>Send each user a link: <code className="bg-blue-100 px-1 rounded text-[11px]">stele.au/view?src=&lt;url&gt;#token=&lt;theirs&gt;</code></li>
          </ol>
        </div>

      </div>
    </div>
  );
}
