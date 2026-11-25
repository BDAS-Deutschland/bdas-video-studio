import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipScene as ClipSceneT, Punch } from "../types";
import { useFadeIn } from "../useFade";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Zusätzlicher Zoom durch "punch"-Overlays zum Szenen-Frame f. */
function punchAt(punches: Punch[] | undefined, f: number): { scale: number; origin: [number, number] } {
  let out = { scale: 1, origin: [0.5, 0.35] as [number, number] };
  for (const p of punches ?? []) {
    const rel = f - p.startFrame;
    if (rel < 0 || rel >= p.durationInFrames) continue;
    const inFrames = p.ease === "smooth" ? 10 : 3;
    const outFrames = p.ease === "smooth" ? 10 : 0;
    const up = interpolate(rel, [0, inFrames], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
    const down = outFrames ? interpolate(rel, [p.durationInFrames - outFrames, p.durationInFrames], [1, 0], { ...CLAMP, easing: Easing.inOut(Easing.cubic) }) : 1;
    out = { scale: 1 + (p.scale - 1) * up * down, origin: p.origin };
  }
  return out;
}

/** object-position zum Szenen-Frame f (Gesicht folgen), sonst Mitte. */
function panAt(pan: ClipSceneT["pan"], f: number): string {
  if (!pan?.length) return "50% 50%";
  if (pan.length === 1) return `${pan[0][1] * 100}% ${pan[0][2] * 100}%`;
  const frames = pan.map((k) => k[0]);
  const x = interpolate(f, frames, pan.map((k) => k[1]), CLAMP);
  const y = interpolate(f, frames, pan.map((k) => k[2]), CLAMP);
  return `${x * 100}% ${y * 100}%`;
}

/**
 * Clip-Szene. Bei Übergängen läuft die Sequenz `lead` Frames vor dem Schnitt los und `tail` Frames
 * nach dem Szenenende weiter. Vor- und Nachlauf sind stumm, der Ton schneidet hart wie bisher.
 * Mit `cutout` wird statt des Clips die freigestellte Person (WebM mit Alpha) gezeigt – gleiche Bewegung.
 */
export const ClipScene = ({ scene, cutout = false }: { scene: ClipSceneT; cutout?: boolean }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const lead = cutout ? 0 : scene.lead ?? 0;
  const tail = cutout ? 0 : scene.tail ?? 0;
  const D = scene.durationInFrames;
  const local = frame - lead;
  const fadeOpacity = useFadeIn(scene.transition === "fade" && !cutout);
  const z0 = scene.zoom ?? 1;
  const z1 = scene.zoomTo ?? z0;
  const scale = interpolate(local, [0, Math.max(1, D - 1)], [z0, z1], CLAMP);
  const [ox, oy] = scene.origin ?? [0.5, 0.35];
  const punch = punchAt(scene.punches, local);
  const speed = scene.speed ?? 1;
  const style = { width: "100%", height: "100%", objectFit: scene.fit ?? "cover", objectPosition: panAt(scene.pan, local) } as const;
  const inF = Math.round(scene.in * fps);
  const outF = Math.round(scene.out * fps);

  const main = cutout ? (
    <OffthreadVideo src={staticFile(scene.cutoutSrc!)} transparent muted playbackRate={speed} style={style} />
  ) : (
    <OffthreadVideo src={staticFile(scene.src)} trimBefore={inF} trimAfter={outF} playbackRate={speed} volume={scene.volume ?? 1} style={style} />
  );

  return (
    <AbsoluteFill
      style={{ opacity: fadeOpacity, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: `${ox * 100}% ${oy * 100}%` }}
    >
      <AbsoluteFill
        style={{
          transform: punch.scale !== 1 ? `scale(${punch.scale})` : undefined,
          transformOrigin: `${punch.origin[0] * 100}% ${punch.origin[1] * 100}%`,
        }}
      >
        {lead > 0 ? (
          <Sequence durationInFrames={lead} name="Vorlauf">
            {scene.leadMode === "play" ? (
              <OffthreadVideo src={staticFile(scene.src)} trimBefore={Math.round(inF - lead * speed)} trimAfter={inF} playbackRate={speed} muted style={style} />
            ) : (
              <Freeze frame={0}>
                <OffthreadVideo src={staticFile(scene.src)} trimBefore={inF} muted style={style} />
              </Freeze>
            )}
          </Sequence>
        ) : null}
        <Sequence from={lead} durationInFrames={D} name={cutout ? "Freisteller" : "Clip"}>
          {main}
        </Sequence>
        {tail > 0 ? (
          <Sequence from={lead + D} durationInFrames={tail} name="Nachlauf">
            {scene.tailMode === "play" ? (
              <OffthreadVideo src={staticFile(scene.src)} trimBefore={outF} trimAfter={Math.round(outF + tail * speed) + 1} playbackRate={speed} muted style={style} />
            ) : (
              <Freeze frame={0}>
                <OffthreadVideo src={staticFile(scene.src)} trimBefore={Math.max(0, outF - 1)} muted style={style} />
              </Freeze>
            )}
          </Sequence>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
