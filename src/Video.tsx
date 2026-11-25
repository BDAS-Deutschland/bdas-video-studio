import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { fontFamily } from "./font";
import { Captions } from "./overlays/Captions";
import { Overlay } from "./overlays/Overlay";
import { CardScene } from "./scenes/CardScene";
import { ClipScene } from "./scenes/ClipScene";
import type { VideoProps } from "./types";

const DUCK_RAMP = 8;

export const Video = (props: VideoProps) => {
  const { scenes, overlays, captions, music, brand } = props;

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
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationInFrames} name={`${s.type}: ${s.id}`}>
          {s.type === "clip" ? <ClipScene scene={s} /> : <CardScene scene={s} brand={brand} />}
        </Sequence>
      ))}
      {captions.map((c, i) => (
        <Sequence key={`cap${i}`} from={c.startFrame} durationInFrames={c.durationInFrames} name="Untertitel" layout="none">
          <Captions chunk={c} brand={brand} />
        </Sequence>
      ))}
      {overlays.map((o, i) => (
        <Sequence key={`ov${i}`} from={o.startFrame} durationInFrames={o.durationInFrames} name={`${o.type}`}>
          <Overlay overlay={o} brand={brand} />
        </Sequence>
      ))}
      {music ? <Audio src={staticFile(music.src)} volume={musicVolume} loop /> : null}
    </AbsoluteFill>
  );
};
