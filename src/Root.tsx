import { Composition } from "remotion";
import { Video } from "./Video";
import type { VideoProps } from "./types";

const placeholder: VideoProps = {
  format: "9:16",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 60,
  scenes: [],
  overlays: [],
  captions: [],
  music: null,
  brand: {
    name: "BDAS",
    colors: {
      accent: "#d12020",
      background: "#ffffff",
      surface: "#f5f5f5",
      inkStrong: "#333333",
      inkBody: "#555555",
      inkMuted: "#888888",
      onAccent: "#ffffff",
    },
    font: "Inter",
    logo: null,
    radius: 12,
    captions: { maxWordsPerChunk: 4, highlight: "#d12020" },
  },
};

export const Root = () => (
  <Composition
    id="Video"
    component={Video}
    defaultProps={placeholder}
    width={placeholder.width}
    height={placeholder.height}
    fps={placeholder.fps}
    durationInFrames={placeholder.durationInFrames}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      fps: props.fps,
      durationInFrames: props.durationInFrames,
    })}
  />
);
