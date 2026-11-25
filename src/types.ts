export type Brand = {
  name: string;
  colors: {
    accent: string;
    background: string;
    surface: string;
    inkStrong: string;
    inkBody: string;
    inkMuted: string;
    onAccent: string;
  };
  font: string;
  logo: string | null;
  radius: number;
  captions: { maxWordsPerChunk: number; highlight: string };
};

type Timed = { start: number; end: number; startFrame: number; durationInFrames: number };

export type SceneOverlay = Timed &
  (
    | { type: "title"; text: string; subtitle?: string }
    | { type: "text"; text: string; position?: "center" | "top" | "bottom" }
    | { type: "logo"; position?: "top-left" | "top-right" | "bottom-right" | "center" }
  );

type SceneBase = Timed & { id: string; transition?: "cut" | "fade" };

export type ClipScene = SceneBase & {
  type: "clip";
  src: string;
  in: number;
  out: number;
  volume?: number;
  fit?: "cover" | "contain";
};

export type CardScene = SceneBase & {
  type: "card" | "cta";
  title?: string;
  subtitle?: string;
  variant?: "accent" | "light";
};

export type Scene = ClipScene | CardScene;

export type CaptionChunk = {
  startFrame: number;
  durationInFrames: number;
  words: { text: string; startFrame: number; endFrame: number }[];
};

export type VideoProps = {
  format: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  scenes: Scene[];
  overlays: SceneOverlay[];
  captions: CaptionChunk[];
  music: { src: string; volume: number; duckTo: number; duckRanges: [number, number][] } | null;
  brand: Brand;
};
