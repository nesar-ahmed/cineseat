import { memo, useId, type ReactNode } from 'react';
import { assetUrl } from '../../lib/api';
import type { CatalogMovie, PosterMotif } from './art';

/**
 * Generated key art. Real posters are not on disk yet, so each title gets an
 * illustration composed from its motif and palette — seeded by the movie id, so
 * it is identical on every render (server and client) and costs no request.
 * When `posterPath` arrives from the API, `<img>` takes over and this becomes
 * the loading / missing-image fallback.
 */
type Variant = 'poster' | 'backdrop';

type Props = {
  movie: Pick<CatalogMovie, 'id' | 'title' | 'director' | 'art' | 'posterPath'>;
  variant?: Variant;
  /** Poster-style title treatment on the art itself. */
  showTitle?: boolean;
  /** "A film by …" above the title — for large posters only, it crowds small cards. */
  credit?: boolean;
  className?: string;
};

const SIZE: Record<Variant, { w: number; h: number }> = {
  poster: { w: 200, h: 300 },
  backdrop: { w: 480, h: 270 },
};

function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  // mulberry32
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Scene = {
  w: number;
  h: number;
  rnd: () => number;
  deep: string;
  mid: string;
  glow: string;
  accent: string;
  uid: string;
};

const r2 = (value: number) => Math.round(value * 100) / 100;

function Blaze({ w, h, rnd, deep, glow, accent, uid }: Scene) {
  const streaks = Array.from({ length: 9 }, (_, i) => {
    const x = rnd() * w * 1.2 - w * 0.1;
    const width = 0.6 + rnd() * 2.4;
    return (
      <polygon
        key={i}
        points={`${r2(x)},${h} ${r2(x + width)},${h} ${r2(x + w * 0.7 + width)},0 ${r2(x + w * 0.7)},0`}
        fill={i % 3 === 0 ? accent : glow}
        opacity={r2(0.08 + rnd() * 0.22)}
      />
    );
  });
  let x = 0;
  const skyline: ReactNode[] = [];
  while (x < w) {
    const bw = w * (0.05 + rnd() * 0.08);
    const bh = h * (0.12 + rnd() * 0.22);
    skyline.push(
      <rect key={x} x={r2(x)} y={r2(h - bh)} width={r2(bw + 0.5)} height={r2(bh)} fill={deep} />,
    );
    x += bw;
  }
  return (
    <>
      <circle cx={w * 0.62} cy={h * 0.58} r={Math.min(w, h) * 0.55} fill={`url(#${uid}-glow)`} />
      <circle cx={w * 0.62} cy={h * 0.58} r={Math.min(w, h) * 0.12} fill={accent} opacity={0.9} />
      {streaks}
      {skyline}
    </>
  );
}

function Rain({ w, h, rnd, deep, glow, accent }: Scene) {
  const drops = Array.from({ length: 70 }, (_, i) => {
    const x = rnd() * w;
    const y = rnd() * h * 0.85;
    const len = 6 + rnd() * 16;
    return (
      <line
        key={i}
        x1={r2(x)}
        y1={r2(y)}
        x2={r2(x - len * 0.18)}
        y2={r2(y + len)}
        stroke={glow}
        strokeWidth={0.6}
        opacity={r2(0.15 + rnd() * 0.35)}
      />
    );
  });
  const horizon = h * 0.78;
  const ux = w * (0.32 + rnd() * 0.2);
  const ur = Math.min(w, h) * 0.11;
  return (
    <>
      <circle cx={w * 0.74} cy={h * 0.2} r={Math.min(w, h) * 0.1} fill={accent} opacity={0.85} />
      <circle cx={w * 0.74} cy={h * 0.2} r={Math.min(w, h) * 0.22} fill={accent} opacity={0.08} />
      {drops}
      <rect x={0} y={horizon} width={w} height={h - horizon} fill={deep} opacity={0.75} />
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          x1={r2(w * (0.15 + rnd() * 0.3))}
          x2={r2(w * (0.55 + rnd() * 0.35))}
          y1={r2(horizon + 6 + i * 6)}
          y2={r2(horizon + 6 + i * 6)}
          stroke={glow}
          strokeWidth={0.7}
          opacity={0.25 - i * 0.03}
        />
      ))}
      {/* A lone figure under an umbrella. */}
      <path
        d={`M${r2(ux - ur)},${r2(horizon - ur * 2.2)} a${r2(ur)},${r2(ur * 0.8)} 0 0 1 ${r2(ur * 2)},0 z`}
        fill={deep}
      />
      <rect
        x={r2(ux - 0.6)}
        y={r2(horizon - ur * 2.2)}
        width={1.2}
        height={r2(ur * 2.2)}
        fill={deep}
      />
      <rect
        x={r2(ux - ur * 0.28)}
        y={r2(horizon - ur * 1.8)}
        width={r2(ur * 0.56)}
        height={r2(ur * 1.8)}
        rx={r2(ur * 0.2)}
        fill={deep}
      />
    </>
  );
}

function Grid({ w, h, rnd, glow, accent, uid }: Scene) {
  const horizon = h * 0.6;
  const vx = w / 2;
  const verticals = Array.from({ length: 15 }, (_, i) => {
    const bx = ((i - 7) / 7) * w * 1.6 + vx;
    return (
      <line
        key={`v${i}`}
        x1={vx}
        y1={horizon}
        x2={r2(bx)}
        y2={h}
        stroke={glow}
        strokeWidth={0.6}
        opacity={0.55}
      />
    );
  });
  const horizontals = Array.from({ length: 9 }, (_, i) => {
    const y = horizon + (h - horizon) * Math.pow(i / 8, 1.9);
    return (
      <line
        key={`h${i}`}
        x1={0}
        x2={w}
        y1={r2(y)}
        y2={r2(y)}
        stroke={glow}
        strokeWidth={0.6}
        opacity={0.5}
      />
    );
  });
  const sunR = Math.min(w, h) * 0.2;
  const stars = Array.from({ length: 40 }, (_, i) => (
    <circle
      key={i}
      cx={r2(rnd() * w)}
      cy={r2(rnd() * horizon * 0.8)}
      r={r2(0.3 + rnd() * 0.7)}
      fill="#fff"
      opacity={r2(0.2 + rnd() * 0.6)}
    />
  ));
  return (
    <>
      {stars}
      <circle cx={vx} cy={horizon} r={sunR * 2.4} fill={`url(#${uid}-glow)`} />
      <g clipPath={`url(#${uid}-sun)`}>
        <circle cx={vx} cy={horizon - sunR * 0.15} r={sunR} fill={`url(#${uid}-sunfill)`} />
      </g>
      <clipPath id={`${uid}-sun`}>
        {Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={0}
            width={w}
            y={r2(horizon - sunR * 1.2 + i * sunR * 0.24)}
            height={r2(sunR * (0.24 - i * 0.018))}
          />
        ))}
      </clipPath>
      <linearGradient id={`${uid}-sunfill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={accent} />
        <stop offset="1" stopColor={glow} />
      </linearGradient>
      <rect x={0} y={horizon} width={w} height={h - horizon} fill="#000" opacity={0.35} />
      {verticals}
      {horizontals}
    </>
  );
}

function Fog({ w, h, rnd, deep, glow, accent, uid }: Scene) {
  const lx = w * 0.72;
  const base = h * 0.74;
  const towerH = h * 0.34;
  return (
    <>
      <polygon
        points={`${r2(lx)},${r2(base - towerH)} ${r2(-w * 0.2)},${r2(base - towerH - h * 0.2)} ${r2(-w * 0.2)},${r2(base - towerH + h * 0.12)}`}
        fill={`url(#${uid}-beam)`}
      />
      <linearGradient id={`${uid}-beam`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor={accent} stopOpacity="0.55" />
        <stop offset="1" stopColor={accent} stopOpacity="0" />
      </linearGradient>
      <circle cx={lx} cy={base - towerH} r={Math.min(w, h) * 0.05} fill={accent} />
      <circle cx={lx} cy={base - towerH} r={Math.min(w, h) * 0.16} fill={accent} opacity={0.12} />
      <polygon
        points={`${r2(lx - w * 0.025)},${r2(base - towerH + 6)} ${r2(lx + w * 0.025)},${r2(base - towerH + 6)} ${r2(lx + w * 0.045)},${r2(base)} ${r2(lx - w * 0.045)},${r2(base)}`}
        fill={deep}
      />
      <rect
        x={r2(lx - w * 0.035)}
        y={r2(base - towerH - 2)}
        width={r2(w * 0.07)}
        height={4}
        fill={deep}
      />
      <path
        d={`M0,${r2(base)} Q${r2(w * 0.5)},${r2(base - 10)} ${w},${r2(base + 4)} L${w},${h} L0,${h} Z`}
        fill={deep}
      />
      <g filter={`url(#${uid}-blur)`}>
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse
            key={i}
            cx={r2(rnd() * w)}
            cy={r2(base - 10 + rnd() * (h - base))}
            rx={r2(w * (0.3 + rnd() * 0.3))}
            ry={r2(6 + rnd() * 10)}
            fill={glow}
            opacity={r2(0.15 + rnd() * 0.15)}
          />
        ))}
      </g>
    </>
  );
}

function Paper({ w, h, rnd, deep, mid, glow, accent }: Scene) {
  const layers = [0.58, 0.66, 0.75, 0.85].map((level, i) => {
    const y = h * level;
    const amp = 6 + rnd() * 10;
    const phase = rnd() * Math.PI * 2;
    let d = `M0,${r2(y)}`;
    for (let x = 0; x <= w; x += w / 12)
      d += ` L${r2(x)},${r2(y + Math.sin(x / (w / 3) + phase) * amp)}`;
    d += ` L${w},${h} L0,${h} Z`;
    const fills = [mid, glow, mid, deep];
    return <path key={i} d={d} fill={fills[i]} opacity={[0.5, 0.35, 0.8, 1][i]} />;
  });
  const bx = w * 0.5;
  const by = h * 0.8;
  const s = Math.min(w, h) * 0.09;
  return (
    <>
      {Array.from({ length: 28 }, (_, i) => (
        <circle
          key={i}
          cx={r2(rnd() * w)}
          cy={r2(rnd() * h * 0.5)}
          r={r2(0.4 + rnd() * 0.9)}
          fill={accent}
          opacity={r2(0.3 + rnd() * 0.6)}
        />
      ))}
      <circle cx={w * 0.25} cy={h * 0.22} r={Math.min(w, h) * 0.08} fill={accent} opacity={0.9} />
      {layers}
      {/* The paper boat. */}
      <polygon
        points={`${r2(bx - s * 1.6)},${r2(by)} ${r2(bx + s * 1.6)},${r2(by)} ${r2(bx + s)},${r2(by + s * 0.7)} ${r2(bx - s)},${r2(by + s * 0.7)}`}
        fill={accent}
      />
      <polygon
        points={`${r2(bx - s * 0.9)},${r2(by)} ${r2(bx)},${r2(by - s * 1.4)} ${r2(bx + s * 0.9)},${r2(by)}`}
        fill={accent}
        opacity={0.85}
      />
    </>
  );
}

function Bokeh({ w, h, rnd, glow, accent, uid }: Scene) {
  return (
    <g filter={`url(#${uid}-soft)`}>
      {Array.from({ length: 26 }, (_, i) => {
        const r = Math.min(w, h) * (0.03 + rnd() * 0.12);
        return (
          <circle
            key={i}
            cx={r2(rnd() * w)}
            cy={r2(rnd() * h)}
            r={r2(r)}
            fill={i % 3 === 0 ? accent : glow}
            opacity={r2(0.12 + rnd() * 0.35)}
          />
        );
      })}
    </g>
  );
}

function Ridge({ w, h, rnd, deep, mid, glow, accent }: Scene) {
  const ridges = [0.5, 0.6, 0.7, 0.82].map((level, i) => {
    let d = `M0,${r2(h * level)}`;
    let x = 0;
    while (x < w) {
      x += w * (0.05 + rnd() * 0.1);
      d += ` L${r2(Math.min(x, w))},${r2(h * level - rnd() * h * (0.16 - i * 0.025))}`;
    }
    d += ` L${w},${h} L0,${h} Z`;
    return (
      <path key={i} d={d} fill={[glow, mid, mid, deep][i]} opacity={[0.28, 0.55, 0.85, 1][i]} />
    );
  });
  const birds = Array.from({ length: 5 }, (_, i) => {
    const x = w * (0.2 + rnd() * 0.5);
    const y = h * (0.18 + rnd() * 0.15);
    const s = 2 + rnd() * 3;
    return (
      <path
        key={i}
        d={`M${r2(x - s)},${r2(y)} q${r2(s / 2)},${r2(-s / 2)} ${r2(s)},0 q${r2(s / 2)},${r2(-s / 2)} ${r2(s)},0`}
        stroke={deep}
        strokeWidth={0.8}
        fill="none"
      />
    );
  });
  return (
    <>
      <circle cx={w * 0.68} cy={h * 0.36} r={Math.min(w, h) * 0.13} fill={accent} opacity={0.9} />
      <circle cx={w * 0.68} cy={h * 0.36} r={Math.min(w, h) * 0.3} fill={accent} opacity={0.08} />
      {ridges}
      {birds}
    </>
  );
}

function Confetti({ w, h, rnd, glow, accent, uid }: Scene) {
  const colors = [glow, accent, '#f472b6', '#60a5fa'];
  return (
    <>
      <polygon
        points={`${w * 0.42},0 ${w * 0.58},0 ${w * 0.95},${h} ${w * 0.05},${h}`}
        fill={`url(#${uid}-spot)`}
      />
      <linearGradient id={`${uid}-spot`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={accent} stopOpacity="0.35" />
        <stop offset="1" stopColor={accent} stopOpacity="0" />
      </linearGradient>
      <ellipse cx={w / 2} cy={h * 0.86} rx={w * 0.42} ry={h * 0.05} fill={accent} opacity={0.2} />
      {Array.from({ length: 46 }, (_, i) => {
        const x = rnd() * w;
        const y = rnd() * h * 0.9;
        const c = colors[i % colors.length];
        return i % 2 ? (
          <rect
            key={i}
            x={r2(x)}
            y={r2(y)}
            width={r2(2 + rnd() * 3)}
            height={r2(4 + rnd() * 4)}
            fill={c}
            opacity={r2(0.5 + rnd() * 0.5)}
            transform={`rotate(${Math.round(rnd() * 180)} ${r2(x)} ${r2(y)})`}
          />
        ) : (
          <circle
            key={i}
            cx={r2(x)}
            cy={r2(y)}
            r={r2(1 + rnd() * 2)}
            fill={c}
            opacity={r2(0.5 + rnd() * 0.5)}
          />
        );
      })}
    </>
  );
}

function Moon({ w, h, rnd, deep, glow, accent, uid }: Scene) {
  const branches: ReactNode[] = [];
  const grow = (x: number, y: number, angle: number, len: number, depth: number) => {
    if (depth === 0 || len < 3) return;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    branches.push(
      <line
        key={branches.length}
        x1={r2(x)}
        y1={r2(y)}
        x2={r2(x2)}
        y2={r2(y2)}
        stroke={deep}
        strokeWidth={r2(depth * 0.7)}
        strokeLinecap="round"
      />,
    );
    grow(x2, y2, angle - 0.35 - rnd() * 0.3, len * 0.72, depth - 1);
    grow(x2, y2, angle + 0.3 + rnd() * 0.3, len * 0.7, depth - 1);
  };
  grow(w * 0.18, h, -Math.PI / 2 + 0.15, h * 0.22, 6);
  return (
    <>
      <circle cx={w * 0.62} cy={h * 0.34} r={Math.min(w, h) * 0.5} fill={`url(#${uid}-glow)`} />
      <circle cx={w * 0.62} cy={h * 0.34} r={Math.min(w, h) * 0.2} fill={accent} opacity={0.95} />
      <circle cx={w * 0.58} cy={h * 0.3} r={Math.min(w, h) * 0.035} fill={glow} opacity={0.35} />
      <circle cx={w * 0.67} cy={h * 0.38} r={Math.min(w, h) * 0.05} fill={glow} opacity={0.25} />
      {branches}
      <g filter={`url(#${uid}-blur)`}>
        <ellipse cx={w * 0.5} cy={h * 0.92} rx={w * 0.7} ry={h * 0.08} fill={glow} opacity={0.25} />
      </g>
    </>
  );
}

function Orbs({ w, h, rnd, glow, accent, uid }: Scene) {
  const px = w * 0.66;
  const py = h * 0.36;
  const pr = Math.min(w, h) * 0.18;
  return (
    <>
      {Array.from({ length: 50 }, (_, i) => (
        <circle
          key={`s${i}`}
          cx={r2(rnd() * w)}
          cy={r2(rnd() * h)}
          r={r2(0.3 + rnd() * 0.8)}
          fill="#fff"
          opacity={r2(0.15 + rnd() * 0.5)}
        />
      ))}
      <circle cx={px} cy={py} r={pr * 2.6} fill={`url(#${uid}-glow)`} />
      <circle cx={px} cy={py} r={pr} fill={`url(#${uid}-planet)`} />
      <radialGradient id={`${uid}-planet`} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor={accent} />
        <stop offset="0.6" stopColor={glow} />
        <stop offset="1" stopColor={glow} stopOpacity="0.2" />
      </radialGradient>
      <ellipse
        cx={px}
        cy={py}
        rx={pr * 1.9}
        ry={pr * 0.42}
        fill="none"
        stroke={accent}
        strokeWidth={1}
        opacity={0.55}
        transform={`rotate(-18 ${px} ${py})`}
      />
      {Array.from({ length: 7 }, (_, i) => {
        const x = w * (0.1 + rnd() * 0.5);
        const y = h * (0.45 + rnd() * 0.45);
        const r = Math.min(w, h) * (0.015 + rnd() * 0.035);
        return (
          <g key={`o${i}`}>
            <circle cx={r2(x)} cy={r2(y)} r={r2(r * 3)} fill={accent} opacity={0.08} />
            <circle cx={r2(x)} cy={r2(y)} r={r2(r)} fill={accent} opacity={r2(0.6 + rnd() * 0.4)} />
          </g>
        );
      })}
    </>
  );
}

/**
 * Motifs are called as plain functions, never rendered as components: each
 * PosterArt render then starts from a fresh seeded generator, so a repeated
 * render (React StrictMode renders twice in development) draws the same shapes
 * the server did instead of continuing the random sequence.
 */
const MOTIFS: Record<PosterMotif, (scene: Scene) => ReactNode> = {
  blaze: Blaze,
  rain: Rain,
  grid: Grid,
  fog: Fog,
  paper: Paper,
  bokeh: Bokeh,
  ridge: Ridge,
  confetti: Confetti,
  moon: Moon,
  orbs: Orbs,
};

function PosterArtImpl({
  movie,
  variant = 'poster',
  showTitle = true,
  credit = false,
  className = '',
}: Props) {
  const uid = `pa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { w, h } = SIZE[variant];
  const [deep, mid, glow] = movie.art.palette;
  const scene: Scene = {
    w,
    h,
    rnd: seeded(`${movie.id}:${variant}`),
    deep,
    mid,
    glow,
    accent: movie.art.accent,
    uid,
  };
  const paint = MOTIFS[movie.art.motif];

  return (
    <div
      className={`grain relative isolate overflow-hidden ${className}`}
      style={{ backgroundColor: deep }}
    >
      {movie.posterPath ? (
        // A plain <img>: posters are served by the API from disk, not by Next.
        <img
          src={assetUrl(movie.posterPath) ?? undefined}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0" stopColor={mid} />
              <stop offset="1" stopColor={deep} />
            </linearGradient>
            <radialGradient id={`${uid}-glow`}>
              <stop offset="0" stopColor={glow} stopOpacity="0.55" />
              <stop offset="1" stopColor={glow} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.45" r="0.75">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.6" />
            </radialGradient>
            <filter id={`${uid}-blur`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>
          <rect width={w} height={h} fill={`url(#${uid}-bg)`} />
          {paint(scene)}
          <rect width={w} height={h} fill={`url(#${uid}-vignette)`} />
        </svg>
      )}

      {showTitle && !movie.posterPath ? (
        <div className="absolute inset-0 flex flex-col justify-between p-[8%] text-center">
          {credit && movie.director ? (
            <p className="text-[0.55em] font-semibold uppercase tracking-[0.28em] text-white/70">
              A film by {movie.director}
            </p>
          ) : (
            <span />
          )}
          <p
            className="font-display text-[1.45em] font-semibold leading-[1.02] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]"
            style={{ fontVariationSettings: "'SOFT' 100" }}
          >
            {movie.title}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Memoised: catalog filters re-render every card, but a poster only depends on
 * its movie and layout props — skipping the SVG keeps filter clicks instant.
 */
export const PosterArt = memo(PosterArtImpl);
