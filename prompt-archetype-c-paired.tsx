/**
 * @stele-manifest
 * name: Build with Claude — Archetype C (Paired)
 * version: 1.0.0
 * author: stele.au
 * description: A copy-pasteable Claude prompt for building paired Stele artifacts — two cryptographically linked files that talk to each other directly via WebRTC. Examples include two-player games, end-to-end-encrypted chat, gift cards, dual-signature contracts. (This artifact declares the paired archetype for the visual badge demo, but never connects — the keys below are placeholders.)
 * archetype: paired
 * pairing_id: stele-prompt-template-archetype-c
 * partner_pubkey: PLACEHOLDER-NOT-A-REAL-PUBKEY-PROMPT-TEMPLATE-ONLY
 * requires:
 *   - clipboard-write
 */

import { useState } from 'react';
import { Copy, Check, Gamepad2, MessageCircle, Gift, FileSignature, Heart, KeyRound } from 'lucide-react';

const PROMPT_TEXT = `Build a Stele artifact in the PAIRED archetype — a single component that's one half of a two-file pair. The two files share cryptographic key material so they can find each other via Stele's signaling server, establish a WebRTC peer connection, and exchange messages end-to-end without any central server seeing the content.

YOU WRITE THE COMPONENT. THE GENERATOR EMITS THE PAIR.

Don't hand-craft 'pairing_id' / 'partner_pubkey' / 'private_key' values — those need
matched ECDH keys. Write the React component(s) for one or both halves, then run them
through the Pair Generator in Stele Desktop (or use the runtime CLI). It emits two
'.stele' files with matched key material and identical components.

For asymmetric pairs (different UI per side, e.g. Alice vs Bob), build BOTH components
in your prompt response and call out which is which.

FORMAT — the generator wraps your component with this manifest. You don't write it,
but here's what ships in the generated file:

  /**
   * @stele-manifest
   * name: <Display name> — Alice
   * archetype: paired
   * pairing_id: <generated>
   * partner_pubkey: <generated, points to Bob>
   * private_key: <generated, Alice's half>
   * requires:
   *   - <capabilities your component needs>
   */

  import { useEffect, useRef, useState } from 'react';

  export default function PairedHalf() {
    // Use window.stele.pair.connect() — see API below.
  }

THE LIVE-CONNECTION API — window.stele.pair.connect()

  const conn = await window.stele.pair.connect();
  // conn = { send, close, onMessage, onStatusChange, initialStatus }

  conn.onStatusChange((s) => {
    // s is one of: 'waiting for partner' | 'connecting' | 'connected' |
    //              'disconnected' | 'error'
  });

  conn.onMessage((data) => {
    // data is whatever the partner sent via conn.send(...)
    // — always a string. JSON.parse it if you sent an object.
  });

  await conn.send('hello partner');
  await conn.send(JSON.stringify({ move: 'e4' }));
  await conn.close();   // when unmounting

Subscriptions return an unsubscribe function:
  const off = conn.onMessage(handler);
  off();

THE AT-REST CRYPTO API — for Tier 1 Simple (no live connection)

If you only need to encrypt content that EITHER half can decrypt (e.g. a gift card
where the recipient's file holds the redeemable secret):

  const { ciphertext, iv } = await window.stele.pair.encrypt('redeem code');
  const plaintext = await window.stele.pair.decrypt(ciphertext, iv);

You normally won't need this if you're using connect() — the WebRTC channel is
already E2E encrypted by DTLS.

PATTERNS

- Symmetric (both halves identical UI): chat, brainstorm, two-player Othello,
  collaborative drawing. Build ONE component; generator emits two copies with
  matched keys.

- Asymmetric (different UI per side): Alice has the gift, Bob redeems; sender
  signs first, recipient countersigns; doctor writes, patient acknowledges.
  Build TWO components in your response — label them clearly.

- Out-of-band exchange: pairs are typically distributed via group chat, email,
  AirDrop. Each person opens THEIR file. Both halves call connect() and they
  meet via the signaling server (default: signal.stele.au).

THE REST IS THE SAME AS A SELF-CONTAINED ARTIFACT

- React 19, default-export, auto-mounted, no ReactDOM.render
- No 'import React' (auto JSX runtime)
- Tailwind CDN preloaded — use Tailwind classes
- Vendor libs: react · react-dom · lucide-react · recharts · three · mathjs ·
  d3 · chart.js · plotly.js · papaparse · lodash · mammoth · xlsx · tone
- Persistence: window.storage (per-artifact, async, JSON-serialisable)
- No <form action="">, no localStorage, no iframes, no inline CDN <script> tags

PAIRED MEANING

Two files, one connection. Each file is useless alone — the partner has to be
present (and online, for live pairs) for the artifact to do its job. Stele's
signaling server only sees encrypted handshake metadata; the message channel
is direct peer-to-peer (WebRTC + TURN fallback).

EXAMPLES

  two-player games (Othello, chess, Connect 4, Battleship) ·
  paired chat (E2E encrypted, no account) ·
  gift cards (sender + recipient halves) ·
  dual-signature contracts ·
  couple's shared journal · co-parenting log ·
  family-only photo viewer · auction (bidder + auctioneer)

NOW BUILD

[Describe the paired interaction. What does each half do? Are the UIs symmetric
or different? What gets exchanged over the channel? Any state to persist locally?]
`;

const EXAMPLE_USES = [
  { icon: Gamepad2,      label: 'Two-player games',     note: 'Othello, chess, Connect 4, Battleship' },
  { icon: MessageCircle, label: 'Paired chat',          note: 'E2E encrypted, no account, no logs' },
  { icon: Gift,          label: 'Gift cards & vouchers', note: 'Sender + recipient halves' },
  { icon: FileSignature, label: 'Dual-signature docs',  note: 'Bilateral contracts, NDAs' },
  { icon: Heart,         label: 'Family / couple',      note: 'Shared journal, co-parent log' },
  { icon: KeyRound,      label: 'Auctions & escrow',    note: 'Bidder + auctioneer, buyer + seller' },
];

export default function PromptArchetypeC() {
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

        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200 mb-4">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          Archetype C · paired
        </div>

        <h1 className="text-3xl font-semibold tracking-tight mb-2">Build with Claude — paired artifact</h1>
        <p className="text-slate-600 leading-relaxed mb-6">
          Two files, cryptographically linked. Each holds half the key material; they meet via the
          signaling server, then talk directly peer-to-peer. End-to-end encrypted, no account, no
          central record. Distribute the pair out-of-band (email, AirDrop, group chat).
        </p>

        <div className="p-4 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-900 mb-8">
          <strong>You write the component, the Pair Generator emits the pair.</strong> Open Stele
          Desktop → <em>New paired artifact</em> → paste your component(s). It generates the matched
          ECDH keys and outputs two ready-to-distribute <code className="bg-purple-100 px-1 rounded">.stele</code> files.
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {EXAMPLE_USES.map(({ icon: Icon, label, note }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <Icon className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy prompt</>}
            </button>
          </div>
          <pre className="px-4 py-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">{PROMPT_TEXT}</pre>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-900">
          <div className="font-semibold mb-1">How to use this</div>
          <ol className="list-decimal list-inside space-y-1 text-purple-800">
            <li>Hit <strong>Copy prompt</strong> and paste into Claude.</li>
            <li>Describe the paired interaction — symmetric or asymmetric? What's exchanged?</li>
            <li>Take Claude's component code into Stele Desktop's <em>Pair Generator</em>.</li>
            <li>It emits two <code className="bg-purple-100 px-1 rounded">.stele</code> files with matched keys. Send one to each person.</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
