import { lightLeak } from "@remotion/effects/light-leak";
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { noise2D } from "@remotion/noise";
import { evolvePath } from "@remotion/paths";
import { AbsoluteFill, Audio, Easing, Solid, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import type { Brand, SceneOverlay } from "../types";

type DrawO = Extract<SceneOverlay, { type: "draw" }>;
type LottieO = Extract<SceneOverlay, { type: "lottie" }>;
type LeakO = Extract<SceneOverlay, { type: "leak" }>;
type FlashO = Extract<SceneOverlay, { type: "flash" }>;
type SfxO = Extract<SceneOverlay, { type: "sfx" }>;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const pts = (p: [number, number][]) => p.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/** Pfade in Pixeln. Leichte Unregelmäßigkeit (noise2D), damit es wie mit dem Stift gezeichnet wirkt. */
function shapePaths(o: DrawO, W: number, H: number): string[] {
  const seed = `${o.shape}${o.x ?? 0}${o.y ?? 0}`;
  const cx = (o.x ?? 0.5) * W;
  const cy = (o.y ?? 0.5) * H;
  const w = (o.w ?? 0.3) * W;
  const h = (o.h ?? (o.shape === "circle" ? (o.w ?? 0.3) * 0.55 : o.shape === "check" || o.shape === "cross" ? o.w ?? 0.1 : 0.1)) * (o.shape === "check" || o.shape === "cross" ? W : H);
  const jitter = (k: number, amt: number) => noise2D(seed, k * 0.9, 0) * amt;
  switch (o.shape) {
    case "circle": {
      // Etwas mehr als eine Umdrehung, Radius wächst leicht – das Ende läuft über den Anfang hinaus.
      const p: [number, number][] = [];
      const turns = 1.12;
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = -Math.PI * 0.62 + t * turns * Math.PI * 2;
        const grow = 1 + 0.07 * t + jitter(i / 6, 0.035);
        p.push([cx + Math.cos(a) * (w / 2) * grow, cy + Math.sin(a) * (h / 2) * grow]);
      }
      return [pts(p)];
    }
    case "underline": {
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      return [`M ${x0} ${cy + jitter(1, 6)} Q ${cx} ${cy + w * 0.035} ${x1} ${cy - w * 0.02}`];
    }
    case "box": {
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      const y0 = cy - h / 2;
      const y1 = cy + h / 2;
      const j = (k: number) => jitter(k, Math.min(w, h) * 0.04);
      return [pts([[x0 + j(1), y0 + j(2)], [x1 + j(3), y0 + j(4)], [x1 + j(5), y1 + j(6)], [x0 + j(7), y1 + j(8)], [x0 + j(9), y0 - h * 0.08]])];
    }
    case "check":
      return [pts([[cx - w / 2, cy], [cx - w / 6, cy + h / 2], [cx + w / 2, cy - h / 2]])];
    case "cross":
      return [pts([[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]]), pts([[cx + w / 2, cy - h / 2], [cx - w / 2, cy + h / 2]])];
    case "arrow": {
      const [fx, fy] = [(o.from?.[0] ?? 0.3) * W, (o.from?.[1] ?? 0.3) * H];
      const [tx, ty] = [(o.to?.[0] ?? 0.6) * W, (o.to?.[1] ?? 0.6) * H];
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (o.curve ?? 0.25) * len;
      const [mx, my] = [(fx + tx) / 2 - (dy / len) * bend, (fy + ty) / 2 + (dx / len) * bend];
      // Richtung am Ende der Kurve (Tangente der quadratischen Bezierkurve).
      const ex = tx - mx;
      const ey = ty - my;
      const el = Math.hypot(ex, ey) || 1;
      const head = Math.min(70 * (W / 1080), len * 0.3);
      const back = (ang: number): [number, number] => {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const ux = -ex / el;
        const uy = -ey / el;
        return [tx + (ux * c - uy * s) * head, ty + (ux * s + uy * c) * head];
      };
      return [`M ${fx} ${fy} Q ${mx} ${my} ${tx} ${ty}`, pts([back(0.5), [tx, ty], back(-0.5)])];
    }
  }
}

export const Draw = ({ o, brand }: { o: DrawO; brand: Brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const { unit } = useLayout();
  const paths = shapePaths(o, width, height);
  const drawFrames = Math.max(4, Math.round((o.drawTime ?? 0.45) * fps));
  const color = o.color === "white" ? "#ffffff" : o.color === "dark" ? brand.colors.inkStrong : brand.colors.accent;
  const exit = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], CLAMP);
  // Mehrteilige Formen (Pfeilspitze, zweiter Strich) werden nacheinander gezeichnet: erster Teil 75 % der Zeit.
  const split = paths.length > 1 ? 0.75 : 1;
  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}>
        {paths.map((d, i) => {
          const [a, b] = i === 0 ? [0, split] : [split, 1];
          const progress = interpolate(frame, [a * drawFrames, Math.max(a * drawFrames + 1, b * drawFrames)], [0, 1], {
            ...CLAMP,
            easing: Easing.out(Easing.quad),
          });
          const evolved = evolvePath(progress, d);
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={(o.stroke ?? 12) * unit}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={evolved.strokeDasharray}
              strokeDashoffset={evolved.strokeDashoffset}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const LottieOverlay = ({ o }: { o: LottieO }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const data = o.animationData as unknown as LottieAnimationData & { w?: number; h?: number };
  const w = (o.size ?? 0.5) * width;
  const h = data.w && data.h ? (w * data.h) / data.w : w;
  const exit = interpolate(frame, [durationInFrames - 5, durationInFrames], [1, 0], CLAMP);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: (o.x ?? 0.5) * width - w / 2, top: (o.y ?? 0.5) * height - h / 2, width: w, height: h, opacity: exit }}>
        <Lottie animationData={data} loop={o.loop ?? false} playbackRate={o.rate ?? 1} style={{ width: "100%", height: "100%" }} />
      </div>
    </AbsoluteFill>
  );
};

/** Light Leak (WebGL). hue verschiebt von Gelb-Orange (0) Richtung Rot: 40 = Markenrot (Standard), 60 = Pink. */
export const Leak = ({ o }: { o: LeakO }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      <Solid
        width={width}
        height={height}
        effects={[lightLeak({ seed: o.seed ?? 3, hueShift: o.hue ?? 40, progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], CLAMP) })]}
      />
    </AbsoluteFill>
  );
};

export const Flash = ({ o }: { o: FlashO }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const peak = Math.max(1, Math.round(durationInFrames * 0.35));
  const opacity = interpolate(frame, [0, peak, durationInFrames], [0, 1, 0], { ...CLAMP, easing: Easing.out(Easing.quad) });
  return <AbsoluteFill style={{ backgroundColor: o.color ?? "#ffffff", opacity: opacity * 0.9 }} />;
};

/** Soundeffekt ohne Einblendung (der Anschlag soll knallen), am Ende 2 Frames Ausblendung gegen Knacken. */
export const Sfx = ({ o }: { o: SfxO }) => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile(o.src)}
      trimBefore={Math.round(o.from * fps)}
      volume={(f) => o.volume * interpolate(f, [durationInFrames - 2, durationInFrames], [1, 0], CLAMP)}
    />
  );
};
