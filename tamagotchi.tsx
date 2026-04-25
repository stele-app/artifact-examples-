import { useState, useEffect } from 'react';

const STORAGE_KEY = 'stele-tamagotchi-v1';
const TICK_MS = 500;

const HATCH_AT_MS = 12_000;
const STAGE_AT = {
  baby: 0,
  child: 25_000,
  teen: 75_000,
  adult: 180_000,
};

// Per-second drain/gain rates on a 0-100 scale
const RATE = {
  hungerDecay: 100 / 200,    // ~3.3 min to empty
  happyDecay: 100 / 240,     // 4 min
  energyDecay: 100 / 300,    // 5 min awake
  energyRegen: 100 / 50,     // 50s asleep
  healthDrain: 100 / 90,     // when neglected
  healthRegen: 100 / 180,    // when cared for
};
const POOP_INTERVAL_MS = 40_000;

type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';
type Form = 'cute' | 'cool' | 'grumpy' | 'zombie';
type Mood = 'happy' | 'content' | 'sad' | 'sick' | 'sleep';

interface Pet {
  name: string;
  createdAt: number;
  hatchedAt: number | null;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
  asleep: boolean;
  poops: number;
  lastPoopAt: number;
  careScore: number;        // running 0-1
  form: Form | null;
  dead: boolean;
  lastTickAt: number;
}

function newPet(name: string): Pet {
  const now = Date.now();
  return {
    name,
    createdAt: now,
    hatchedAt: null,
    hunger: 100,
    happiness: 100,
    energy: 100,
    health: 100,
    asleep: false,
    poops: 0,
    lastPoopAt: now,
    careScore: 1,
    form: null,
    dead: false,
    lastTickAt: now,
  };
}

function load(): Pet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(p: Pet) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

function clearPet() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function ageMs(p: Pet): number {
  if (!p.hatchedAt) return 0;
  return Date.now() - p.hatchedAt;
}

function stageOf(p: Pet): Stage {
  if (!p.hatchedAt) return 'egg';
  const a = ageMs(p);
  if (a >= STAGE_AT.adult) return 'adult';
  if (a >= STAGE_AT.teen) return 'teen';
  if (a >= STAGE_AT.child) return 'child';
  return 'baby';
}

function moodOf(p: Pet): Mood {
  if (p.asleep) return 'sleep';
  if (p.health < 30) return 'sick';
  const avg = (p.hunger + p.happiness + p.energy) / 3;
  if (avg > 70) return 'happy';
  if (avg > 40) return 'content';
  return 'sad';
}

function pickForm(score: number): Form {
  if (score > 0.78) return 'cute';
  if (score > 0.5) return 'cool';
  if (score > 0.22) return 'grumpy';
  return 'zombie';
}

function tick(p: Pet, now: number): Pet {
  if (p.dead) return p;
  const dt = Math.max(0, (now - p.lastTickAt) / 1000);
  const next: Pet = { ...p, lastTickAt: now };

  if (!next.hatchedAt && now - next.createdAt >= HATCH_AT_MS) {
    next.hatchedAt = now;
  }
  if (!next.hatchedAt) return next;

  next.hunger = Math.max(0, next.hunger - RATE.hungerDecay * dt);
  next.happiness = Math.max(0, next.happiness - RATE.happyDecay * dt);

  if (next.asleep) {
    next.energy = Math.min(100, next.energy + RATE.energyRegen * dt);
    if (next.energy >= 100) next.asleep = false;
  } else {
    next.energy = Math.max(0, next.energy - RATE.energyDecay * dt);
  }

  const neglected =
    next.hunger < 20 ||
    next.happiness < 10 ||
    next.energy < 5 ||
    next.poops >= 3;
  if (neglected) {
    next.health = Math.max(0, next.health - RATE.healthDrain * dt);
  } else {
    next.health = Math.min(100, next.health + RATE.healthRegen * dt);
  }
  if (next.health <= 0) {
    next.dead = true;
    return next;
  }

  while (now - next.lastPoopAt >= POOP_INTERVAL_MS) {
    next.lastPoopAt += POOP_INTERVAL_MS;
    if (!next.asleep) next.poops = Math.min(5, next.poops + 1);
  }

  // Care EMA — combines all stats and poop count
  const sample = Math.min(
    next.hunger / 100,
    next.happiness / 100,
    next.energy / 100,
    next.health / 100,
    Math.max(0, 1 - next.poops * 0.2),
  );
  const alpha = Math.min(1, dt / 30); // 30s smoothing
  next.careScore = next.careScore + alpha * (sample - next.careScore);

  if (!next.form && stageOf(next) === 'adult') {
    next.form = pickForm(next.careScore);
  }
  return next;
}

const feed = (p: Pet): Pet =>
  p.asleep || p.dead ? p : { ...p, hunger: Math.min(100, p.hunger + 35) };

const playWith = (p: Pet): Pet =>
  p.asleep || p.dead
    ? p
    : {
        ...p,
        happiness: Math.min(100, p.happiness + 30),
        energy: Math.max(0, p.energy - 12),
      };

const toggleSleep = (p: Pet): Pet =>
  p.dead ? p : { ...p, asleep: !p.asleep };

const clean = (p: Pet): Pet =>
  p.dead ? p : { ...p, poops: 0 };

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---------------- Creature visuals ----------------

interface Palette {
  body: string;
  belly: string;
  outline: string;
  eye: string;
  blush: string;
}

function paletteFor(stage: Stage, form: Form | null): Palette {
  if (stage === 'baby')
    return { body: '#fde68a', belly: '#fef3c7', outline: '#92400e', eye: '#1f2937', blush: '#fb7185' };
  if (stage === 'child')
    return { body: '#86efac', belly: '#dcfce7', outline: '#166534', eye: '#1f2937', blush: '#fb7185' };
  if (stage === 'teen')
    return { body: '#7dd3fc', belly: '#e0f2fe', outline: '#075985', eye: '#1f2937', blush: '#fb7185' };
  // adult by form
  switch (form) {
    case 'cool':
      return { body: '#a78bfa', belly: '#ede9fe', outline: '#5b21b6', eye: '#0f172a', blush: '#a78bfa' };
    case 'grumpy':
      return { body: '#a8a29e', belly: '#e7e5e4', outline: '#44403c', eye: '#1f2937', blush: '#78716c' };
    case 'zombie':
      return { body: '#84cc16', belly: '#d9f99d', outline: '#365314', eye: '#1c1917', blush: '#65a30d' };
    case 'cute':
    default:
      return { body: '#f9a8d4', belly: '#fce7f3', outline: '#9d174d', eye: '#1f2937', blush: '#f43f5e' };
  }
}

interface Proportions {
  bodyCy: number;
  bodyRx: number;
  bodyRy: number;
  eyeCy: number;
  eyeSpread: number;
  eyeSize: number;
  mouthCy: number;
}

function proportionsFor(stage: Stage): Proportions {
  switch (stage) {
    case 'baby':
      return { bodyCy: 120, bodyRx: 42, bodyRy: 38, eyeCy: 110, eyeSpread: 14, eyeSize: 7, mouthCy: 132 };
    case 'child':
      return { bodyCy: 115, bodyRx: 52, bodyRy: 50, eyeCy: 100, eyeSpread: 16, eyeSize: 7, mouthCy: 128 };
    case 'teen':
      return { bodyCy: 110, bodyRx: 56, bodyRy: 60, eyeCy: 90, eyeSpread: 18, eyeSize: 6, mouthCy: 122 };
    case 'adult':
      return { bodyCy: 110, bodyRx: 64, bodyRy: 64, eyeCy: 90, eyeSpread: 22, eyeSize: 7, mouthCy: 124 };
    default:
      return { bodyCy: 120, bodyRx: 40, bodyRy: 50, eyeCy: 110, eyeSpread: 14, eyeSize: 7, mouthCy: 130 };
  }
}

function Eye({ cx, cy, size, mood, palette }: { cx: number; cy: number; size: number; mood: Mood; palette: Palette }) {
  if (mood === 'sleep' || mood === 'happy') {
    // closed crescent (smile shape)
    const d = `M ${cx - size},${cy} Q ${cx},${cy - size * 0.9} ${cx + size},${cy}`;
    return <path d={d} fill="none" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />;
  }
  if (mood === 'sick') {
    return (
      <g stroke={palette.eye} strokeWidth="2" strokeLinecap="round">
        <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} />
        <line x1={cx - size} y1={cy + size} x2={cx + size} y2={cy - size} />
      </g>
    );
  }
  // open eye: white + pupil
  const pupilOffsetY = mood === 'sad' ? size * 0.4 : 0;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={size} ry={size * 1.05} fill="#ffffff" stroke={palette.outline} strokeWidth="1.5" />
      <circle cx={cx} cy={cy + pupilOffsetY} r={size * 0.45} fill={palette.eye} />
      <circle cx={cx + size * 0.2} cy={cy - size * 0.25 + pupilOffsetY} r={size * 0.18} fill="#ffffff" />
    </g>
  );
}

function Mouth({ cx, cy, mood, palette }: { cx: number; cy: number; mood: Mood; palette: Palette }) {
  const stroke = palette.outline;
  if (mood === 'happy') {
    return <path d={`M ${cx - 10},${cy} Q ${cx},${cy + 12} ${cx + 10},${cy}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />;
  }
  if (mood === 'content') {
    return <path d={`M ${cx - 6},${cy} Q ${cx},${cy + 5} ${cx + 6},${cy}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />;
  }
  if (mood === 'sad') {
    return <path d={`M ${cx - 8},${cy + 4} Q ${cx},${cy - 4} ${cx + 8},${cy + 4}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />;
  }
  if (mood === 'sick') {
    return <polyline points={`${cx - 10},${cy} ${cx - 5},${cy + 4} ${cx},${cy} ${cx + 5},${cy + 4} ${cx + 10},${cy}`} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />;
  }
  // sleep
  return <ellipse cx={cx} cy={cy + 2} rx="4" ry="3" fill={stroke} />;
}

function Egg({ progress }: { progress: number }) {
  const wobble = progress > 0.6;
  return (
    <svg viewBox="0 0 200 200" width="220" height="220">
      <ellipse cx="100" cy="190" rx="40" ry="6" fill="rgba(0,0,0,0.25)" />
      <g style={{
        transformOrigin: '100px 110px',
        animation: wobble ? 'tama-wobble 0.4s ease-in-out infinite' : 'tama-float 3s ease-in-out infinite',
      }}>
        <path
          d="M 100,38 Q 60,58 60,120 Q 60,170 100,170 Q 140,170 140,120 Q 140,58 100,38 Z"
          fill="#fef3c7"
          stroke="#92400e"
          strokeWidth="2.5"
        />
        <ellipse cx="82" cy="100" rx="6" ry="5" fill="#fbbf24" opacity="0.55" />
        <ellipse cx="118" cy="135" rx="5" ry="4" fill="#fbbf24" opacity="0.55" />
        <ellipse cx="92" cy="142" rx="4" ry="3" fill="#fbbf24" opacity="0.55" />
        {progress > 0.5 && (
          <polyline
            points="80,80 90,90 84,100 100,108 95,118"
            fill="none"
            stroke="#451a03"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}

function Creature({ stage, form, mood }: { stage: Stage; form: Form | null; mood: Mood }) {
  const pal = paletteFor(stage, form);
  const pr = proportionsFor(stage);

  const animation =
    mood === 'sleep'
      ? 'tama-breathe 3.5s ease-in-out infinite'
      : mood === 'sick'
      ? 'tama-stagger 1.6s ease-in-out infinite'
      : mood === 'happy'
      ? 'tama-bounce 1.2s ease-in-out infinite'
      : 'tama-float 3s ease-in-out infinite';

  const showCheeks = stage === 'adult' && form === 'cute';
  const showShades = stage === 'adult' && form === 'cool';
  const showStitches = stage === 'adult' && form === 'zombie';
  const showBrows = stage === 'adult' && form === 'grumpy';

  const showAntennae = stage === 'baby';
  const showHair = stage === 'teen' || (stage === 'adult' && form === 'cute');
  const showSparkles = stage === 'adult' && form === 'cute';

  return (
    <svg viewBox="0 0 200 200" width="240" height="240" style={{ overflow: 'visible' }}>
      {/* shadow */}
      <ellipse cx="100" cy="186" rx={pr.bodyRx * 0.85} ry="6" fill="rgba(0,0,0,0.28)" />

      <g style={{ transformOrigin: '100px 110px', animation }}>
        {/* feet */}
        <ellipse cx={100 - pr.bodyRx * 0.5} cy={pr.bodyCy + pr.bodyRy - 4} rx="10" ry="6" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />
        <ellipse cx={100 + pr.bodyRx * 0.5} cy={pr.bodyCy + pr.bodyRy - 4} rx="10" ry="6" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />

        {/* body */}
        <ellipse cx={100} cy={pr.bodyCy} rx={pr.bodyRx} ry={pr.bodyRy} fill={pal.body} stroke={pal.outline} strokeWidth="2.2" />
        {/* belly */}
        <ellipse cx={100} cy={pr.bodyCy + pr.bodyRy * 0.18} rx={pr.bodyRx * 0.55} ry={pr.bodyRy * 0.6} fill={pal.belly} />

        {/* arms (small nubs) */}
        <ellipse cx={100 - pr.bodyRx} cy={pr.bodyCy + 2} rx="6" ry="9" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />
        <ellipse cx={100 + pr.bodyRx} cy={pr.bodyCy + 2} rx="6" ry="9" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />

        {/* antennae for baby */}
        {showAntennae && (
          <g stroke={pal.outline} strokeWidth="2" strokeLinecap="round" fill="none">
            <path d={`M ${100 - 10},${pr.bodyCy - pr.bodyRy + 2} Q ${100 - 14},${pr.bodyCy - pr.bodyRy - 14} ${100 - 18},${pr.bodyCy - pr.bodyRy - 18}`} />
            <path d={`M ${100 + 10},${pr.bodyCy - pr.bodyRy + 2} Q ${100 + 14},${pr.bodyCy - pr.bodyRy - 14} ${100 + 18},${pr.bodyCy - pr.bodyRy - 18}`} />
            <circle cx={100 - 18} cy={pr.bodyCy - pr.bodyRy - 18} r="3" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />
            <circle cx={100 + 18} cy={pr.bodyCy - pr.bodyRy - 18} r="3" fill={pal.body} stroke={pal.outline} strokeWidth="1.5" />
          </g>
        )}

        {/* hair tuft for teen / cute adult */}
        {showHair && (
          <path
            d={`M ${100 - 10},${pr.bodyCy - pr.bodyRy + 4} Q ${100 - 4},${pr.bodyCy - pr.bodyRy - 14} ${100 + 2},${pr.bodyCy - pr.bodyRy - 6} Q ${100 + 10},${pr.bodyCy - pr.bodyRy - 18} ${100 + 12},${pr.bodyCy - pr.bodyRy + 4} Z`}
            fill={form === 'cute' ? '#f43f5e' : '#fb923c'}
            stroke={pal.outline}
            strokeWidth="1.5"
          />
        )}

        {/* zombie stitches */}
        {showStitches && (
          <g stroke={pal.outline} strokeWidth="1.5" strokeLinecap="round">
            <line x1={100 - 25} y1={pr.bodyCy + 8} x2={100 + 25} y2={pr.bodyCy + 8} />
            <line x1={100 - 22} y1={pr.bodyCy + 4} x2={100 - 22} y2={pr.bodyCy + 12} />
            <line x1={100 - 14} y1={pr.bodyCy + 4} x2={100 - 14} y2={pr.bodyCy + 12} />
            <line x1={100 - 6} y1={pr.bodyCy + 4} x2={100 - 6} y2={pr.bodyCy + 12} />
            <line x1={100 + 2} y1={pr.bodyCy + 4} x2={100 + 2} y2={pr.bodyCy + 12} />
            <line x1={100 + 10} y1={pr.bodyCy + 4} x2={100 + 10} y2={pr.bodyCy + 12} />
            <line x1={100 + 18} y1={pr.bodyCy + 4} x2={100 + 18} y2={pr.bodyCy + 12} />
          </g>
        )}

        {/* eyes */}
        <Eye cx={100 - pr.eyeSpread} cy={pr.eyeCy} size={pr.eyeSize} mood={mood} palette={pal} />
        <Eye cx={100 + pr.eyeSpread} cy={pr.eyeCy} size={pr.eyeSize} mood={mood} palette={pal} />

        {/* grumpy brows */}
        {showBrows && mood !== 'sleep' && (
          <g stroke={pal.outline} strokeWidth="3" strokeLinecap="round">
            <line x1={100 - pr.eyeSpread - 6} y1={pr.eyeCy - 12} x2={100 - pr.eyeSpread + 6} y2={pr.eyeCy - 8} />
            <line x1={100 + pr.eyeSpread + 6} y1={pr.eyeCy - 12} x2={100 + pr.eyeSpread - 6} y2={pr.eyeCy - 8} />
          </g>
        )}

        {/* sunglasses */}
        {showShades && (
          <g>
            <rect x={100 - pr.eyeSpread - 14} y={pr.eyeCy - 8} width="28" height="14" rx="3" fill="#0f172a" />
            <rect x={100 + pr.eyeSpread - 14} y={pr.eyeCy - 8} width="28" height="14" rx="3" fill="#0f172a" />
            <line x1={100 - pr.eyeSpread + 14} y1={pr.eyeCy} x2={100 + pr.eyeSpread - 14} y2={pr.eyeCy} stroke="#0f172a" strokeWidth="2" />
            <rect x={100 - pr.eyeSpread - 8} y={pr.eyeCy - 5} width="6" height="3" rx="1" fill="rgba(255,255,255,0.4)" />
          </g>
        )}

        {/* cheeks for cute adult */}
        {showCheeks && (
          <g>
            <circle cx={100 - pr.eyeSpread - 4} cy={pr.eyeCy + 14} r="5" fill={pal.blush} opacity="0.55" />
            <circle cx={100 + pr.eyeSpread + 4} cy={pr.eyeCy + 14} r="5" fill={pal.blush} opacity="0.55" />
          </g>
        )}

        {/* mouth */}
        <Mouth cx={100} cy={pr.mouthCy} mood={mood} palette={pal} />

        {/* zombie drool */}
        {form === 'zombie' && stage === 'adult' && mood !== 'sleep' && (
          <path d={`M ${100 + 6},${pr.mouthCy + 2} Q ${100 + 8},${pr.mouthCy + 12} ${100 + 6},${pr.mouthCy + 18}`} stroke="#65a30d" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* sparkles for cute adult */}
      {showSparkles && (
        <g style={{ animation: 'tama-twinkle 2s ease-in-out infinite' }}>
          <text x="30" y="50" fontSize="18" fill="#f9a8d4">✦</text>
          <text x="160" y="40" fontSize="14" fill="#fbbf24">✦</text>
          <text x="170" y="150" fontSize="16" fill="#f9a8d4">✦</text>
        </g>
      )}
    </svg>
  );
}

// ---------------- App ----------------

interface ActionBtnProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionBtn({ icon, label, onClick, disabled }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700 rounded-xl py-3 px-4 transition-colors flex items-center justify-center gap-2"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

interface StatBarProps {
  label: string;
  value: number;
  color: string;
  icon: string;
}

function StatBar({ label, value, color, icon }: StatBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-slate-300">
          <span className="mr-1.5">{icon}</span>{label}
        </span>
        <span className="font-mono text-slate-400">{Math.round(pct)}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function NewPetScreen({ onHatch }: { onHatch: (name: string) => void }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-slate-100 font-sans flex items-center">
      <div className="max-w-md mx-auto px-4 py-8 w-full">
        <div className="text-center mb-8">
          <div style={{ animation: 'tama-float 3s ease-in-out infinite', display: 'inline-block' }}>
            <Egg progress={0.2} />
          </div>
          <h1 className="text-3xl font-bold mb-2 mt-2">A new egg!</h1>
          <p className="text-slate-400 text-sm px-4">
            Name your creature. They'll hatch in about 12 seconds — and how they grow is up to you.
          </p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) onHatch(trimmed); }}
            placeholder="Bubbles, Mochi, Pixel..."
            maxLength={20}
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-lg mb-4 outline-none focus:border-pink-400 placeholder:text-slate-600"
          />
          <button
            onClick={() => trimmed && onHatch(trimmed)}
            disabled={!trimmed}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-all"
          >
            Lay the egg
          </button>
        </div>
      </div>
    </div>
  );
}

function DeathScreen({ pet, onRestart }: { pet: Pet; onRestart: () => void }) {
  const lifespan = (pet.lastTickAt - (pet.hatchedAt ?? pet.createdAt));
  const stage = stageOf({ ...pet, dead: false }); // last reached stage
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans flex items-center">
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <div className="text-7xl mb-4" style={{ animation: 'tama-float 3s ease-in-out infinite' }}>👻</div>
        <h1 className="text-2xl font-bold mb-1">{pet.name} has passed.</h1>
        <p className="text-slate-400 text-sm mb-1">
          They lived for {fmtAge(lifespan)} as a {stage}.
        </p>
        <p className="text-slate-500 italic text-xs mb-8">
          Final care score: {Math.round(pet.careScore * 100)}%
        </p>
        <button
          onClick={onRestart}
          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white font-medium px-6 py-3 rounded-lg transition-all"
        >
          Start a new egg
        </button>
      </div>
    </div>
  );
}

const ANIMATIONS = `
  @keyframes tama-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes tama-bounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-10px) scale(1.03); } }
  @keyframes tama-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
  @keyframes tama-stagger { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
  @keyframes tama-wobble { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  @keyframes tama-twinkle { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
  @keyframes tama-zzz { 0% { opacity: 0; transform: translateY(0) scale(0.8); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-20px) scale(1.2); } }
`;

export default function Tamagotchi() {
  const [pet, setPet] = useState<Pet | null>(() => load());

  useEffect(() => {
    if (!pet) return;
    setPet((p) => (p ? tick(p, Date.now()) : p));
    const id = setInterval(() => {
      setPet((p) => {
        if (!p) return p;
        const next = tick(p, Date.now());
        save(next);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [pet?.createdAt]);

  if (!pet) {
    return (
      <>
        <style>{ANIMATIONS}</style>
        <NewPetScreen onHatch={(n) => setPet(newPet(n))} />
      </>
    );
  }

  if (pet.dead) {
    return (
      <>
        <style>{ANIMATIONS}</style>
        <DeathScreen pet={pet} onRestart={() => { clearPet(); setPet(null); }} />
      </>
    );
  }

  const stage = stageOf(pet);
  const mood = moodOf(pet);
  const totalAge = Date.now() - pet.createdAt;
  const hatchProgress = Math.min(1, (Date.now() - pet.createdAt) / HATCH_AT_MS);

  return (
    <>
      <style>{ANIMATIONS}</style>
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-slate-100 font-sans">
        <div className="max-w-md mx-auto px-4 py-6">
          {/* header */}
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold leading-tight">{pet.name}</h1>
              <div className="text-xs text-slate-400 mt-0.5">
                <span className="capitalize">{stage}</span>
                {pet.form && <> · <span className="capitalize">{pet.form}</span></>}
                {' · '}{fmtAge(totalAge)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Care</div>
              <div className="text-sm font-mono text-slate-300">{Math.round(pet.careScore * 100)}%</div>
            </div>
          </header>

          {/* creature stage */}
          <div className="relative bg-gradient-to-b from-slate-900/70 to-slate-900/30 backdrop-blur border border-slate-800 rounded-3xl mb-4 overflow-hidden" style={{ height: 280 }}>
            {/* stars/dots decoration */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
              <div className="absolute top-6 left-8 w-1 h-1 bg-white rounded-full" />
              <div className="absolute top-12 right-12 w-0.5 h-0.5 bg-white rounded-full" />
              <div className="absolute bottom-12 left-14 w-0.5 h-0.5 bg-white rounded-full" />
              <div className="absolute top-20 right-20 w-1 h-1 bg-purple-300 rounded-full" />
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              {stage === 'egg' ? (
                <Egg progress={hatchProgress} />
              ) : (
                <Creature stage={stage} form={pet.form} mood={mood} />
              )}
            </div>

            {/* poop indicators */}
            {pet.poops > 0 && (
              <div className="absolute bottom-3 left-4 text-2xl select-none">
                {Array.from({ length: pet.poops }, (_, i) => (
                  <span key={i} style={{ animation: `tama-float 2s ease-in-out infinite ${i * 0.3}s` }} className="inline-block mr-1">💩</span>
                ))}
              </div>
            )}

            {/* sleep zzz */}
            {pet.asleep && (
              <div className="absolute top-3 right-3 text-2xl" style={{ animation: 'tama-zzz 2s ease-in-out infinite' }}>💤</div>
            )}

            {/* sick indicator */}
            {mood === 'sick' && (
              <div className="absolute top-3 left-3 text-xl" style={{ animation: 'tama-stagger 1.6s ease-in-out infinite' }}>🤒</div>
            )}

            {/* hatching label */}
            {stage === 'egg' && (
              <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400">
                Hatching… {Math.round(hatchProgress * 100)}%
              </div>
            )}
          </div>

          {/* stats */}
          {stage !== 'egg' && (
            <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-4 mb-4">
              <StatBar label="Hunger" value={pet.hunger} color="bg-orange-400" icon="🍔" />
              <StatBar label="Happiness" value={pet.happiness} color="bg-pink-400" icon="😊" />
              <StatBar label="Energy" value={pet.energy} color="bg-cyan-400" icon="⚡" />
              <StatBar label="Health" value={pet.health} color="bg-emerald-400" icon="❤️" />
            </div>
          )}

          {/* actions */}
          {stage !== 'egg' && (
            <div className="grid grid-cols-2 gap-2.5">
              <ActionBtn
                icon="🍔"
                label="Feed"
                disabled={pet.asleep}
                onClick={() => setPet((p) => { if (!p) return p; const n = feed(p); save(n); return n; })}
              />
              <ActionBtn
                icon="🎮"
                label="Play"
                disabled={pet.asleep || pet.energy < 12}
                onClick={() => setPet((p) => { if (!p) return p; const n = playWith(p); save(n); return n; })}
              />
              <ActionBtn
                icon={pet.asleep ? '☀️' : '🌙'}
                label={pet.asleep ? 'Wake' : 'Sleep'}
                onClick={() => setPet((p) => { if (!p) return p; const n = toggleSleep(p); save(n); return n; })}
              />
              <ActionBtn
                icon="🧼"
                label="Clean"
                disabled={pet.poops === 0}
                onClick={() => setPet((p) => { if (!p) return p; const n = clean(p); save(n); return n; })}
              />
            </div>
          )}

          {/* footer hint */}
          <div className="mt-5 text-center text-[11px] text-slate-500 leading-relaxed">
            {stage === 'egg' && 'Sit tight — your egg is forming.'}
            {stage === 'baby' && 'Newborn! Feed often and keep them happy.'}
            {stage === 'child' && 'Growing fast. Watch their energy.'}
            {stage === 'teen' && 'Almost grown — care quality decides their final form.'}
            {stage === 'adult' && pet.form === 'cute' && 'A cherished companion. ✦'}
            {stage === 'adult' && pet.form === 'cool' && 'Too cool. Earned the shades.'}
            {stage === 'adult' && pet.form === 'grumpy' && 'A bit grumpy. Could use more love.'}
            {stage === 'adult' && pet.form === 'zombie' && 'Yikes. They survived… mostly.'}
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => { if (confirm(`Abandon ${pet.name} and start a new egg?`)) { clearPet(); setPet(null); } }}
              className="text-[10px] text-slate-600 hover:text-slate-400 underline"
            >
              start over
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
