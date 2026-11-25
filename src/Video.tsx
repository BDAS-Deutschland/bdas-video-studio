import { TransitionSeries } from "@remotion/transitions";
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { fontFamily } from "./font";
import { Captions } from "./overlays/Captions";
import { Overlay } from "./overlays/Overlay";
import { CardScene } from "./scenes/CardScene";
import { ClipScene } from "./scenes/ClipScene";
import { Shake } from "./Shake";
import { transitionProps } from "./transitions";
import type { Brand, Scene, SceneOverlay, VideoProps } from "./types";

const DUCK_RAMP = 8;

/** Szenen nacheinander; Übergänge überlappen mittig um den Schnitt (Vor-/Nachlauf), Zeiten bleiben gleich. */
const Scenes = ({ scenes, brand }: { scenes: Scene[]; brand: Brand }) => {
  const { width, height } = useVideoConfig();
  const items: ReactNode[] = [];
  scenes.forEach((s, i) => {
    if (s.enter && i > 0) {
      const t = transitionProps(s.enter.type, s.enter.frames, width, height);
      items.push(<TransitionSeries.Transition key={`t-${s.id}`} presentation={t.presentation} timing={t.timing} motionBlur={t.motionBlur} />);
    }
    items.push(
      <TransitionSeries.Sequence key={s.id} durationInFrames={(s.lead ?? 0) + s.durationInFrames + (s.tail ?? 0)} name={`${s.type}: ${s.id}`}>
        {s.type === "clip" ? <ClipScene scene={s} /> : <CardScene scene={s} brand={brand} />}
      </TransitionSeries.Sequence>,
    );
  });
  return <TransitionSeries name="Szenen">{items}</TransitionSeries>;
};

const OverlayLayer = ({ overlays, brand, prefix }: { overlays: SceneOverlay[]; brand: Brand; prefix: string }) => (
  <>
    {overlays.map((o, i) => (
      <Sequence key={`${prefix}${i}`} from={o.startFrame} durationInFrames={o.durationInFrames} name={o.type}>
        <Overlay overlay={o} brand={brand} />
      </Sequence>
    ))}
  </>
);

export const Video = (props: VideoProps) => {
  const { scenes, overlays, captions, music, brand, shakes, fps } = props;
  const behind = overlays.filter((o) => o.layer === "behind");
  const front = overlays.filter((o) => o.layer !== "behind" && o.type !== "sfx");
  const sounds = overlays.filter((o) => o.type === "sfx");
  const cutouts = scenes.filter((s) => s.type === "clip" && s.cutoutSrc);

  const musicVolume = (f: number) => {
    if (!music) return 0;
    let v = music.volume;
    for (const [a, b] of music.duckRanges) {
      const down = interpolate(f, [a - DUCK_RAMP, a, b, b + DUCK_RAMP], [music.volume, music.duckTo, music.duckTo, music.volume], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      v = Math.min(v, down);
    }
    return v;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <Shake shakes={shakes ?? []}>
        <Scenes scenes={scenes} brand={brand} />
        <OverlayLayer overlays={behind} brand={brand} prefix="hinter" />
        {cutouts.map((s) => (
          <Sequence key={`cut-${s.id}`} from={s.startFrame} durationInFrames={s.durationInFrames} name={`Freisteller: ${s.id}`}>
            {s.type === "clip" ? <ClipScene scene={s} cutout /> : null}
          </Sequence>
        ))}
        <OverlayLayer overlays={front} brand={brand} prefix="ov" />
      </Shake>
      {captions.map((c, i) => (
        <Sequence key={`cap${i}`} from={c.startFrame} durationInFrames={c.durationInFrames} name="Untertitel" layout="none">
          <Captions chunk={c} brand={brand} />
        </Sequence>
      ))}
      <OverlayLayer overlays={sounds} brand={brand} prefix="sfx" />
      {music ? <Audio src={staticFile(music.src)} trimBefore={Math.round((music.from ?? 0) * fps)} volume={musicVolume} loop /> : null}
    </AbsoluteFill>
  );
};
