import { noise2D } from "@remotion/noise";
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoProps } from "./types";

/**
 * Kamerawackeln für Pointen und Bass-Schläge. Wirkt auf Szenen und Overlays, nicht auf Untertitel.
 * Der Container bleibt immer derselbe, damit Videos darin nicht neu geladen werden.
 */
export const Shake = ({ shakes, children }: { shakes: VideoProps["shakes"]; children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const unit = width / 1080;
  let dx = 0;
  let dy = 0;
  let rot = 0;
  let scale = 1;
  for (const s of shakes ?? []) {
    const f = frame - s.startFrame;
    if (f < 0 || f >= s.durationInFrames) continue;
    const p = f / s.durationInFrames;
    const env = Math.min(1, (f + 1) / 2) * (1 - p) ** 1.6;
    const amp = 26 * unit * s.strength * env;
    dx += noise2D(`x${s.startFrame}`, frame * 0.55, 0) * amp;
    dy += noise2D(`y${s.startFrame}`, frame * 0.55, 0) * amp;
    rot += noise2D(`r${s.startFrame}`, frame * 0.45, 0) * 1.1 * s.strength * env;
    scale = Math.max(scale, 1 + 0.045 * s.strength * env);
  }
  const moving = dx !== 0 || dy !== 0 || rot !== 0;
  return (
    <AbsoluteFill style={{ transform: moving ? `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})` : undefined }}>{children}</AbsoluteFill>
  );
};
