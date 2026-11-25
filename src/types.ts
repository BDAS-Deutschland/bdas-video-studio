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
    | {
        type: "media";
        src: string;
        kind: "video" | "image";
        /** Sekunde im Quellvideo, ab der abgespielt wird. */
        from?: number;
        /** Ausschnitt der Quelle als Anteile [x, y, w, h] (0–1). */
        crop?: [number, number, number, number];
        /** Seitenverhältnis (B/H) der Quelle, vom Resolver eingetragen. */
        srcAspect: number;
        layout?: "card" | "full";
        position?: "top" | "center";
        /** Kartenbreite als Anteil der Bildbreite. */
        width?: number;
        tilt?: number;
        /** Hintergrund abdunkeln und weichzeichnen. */
        dim?: boolean;
        label?: string;
        quote?: string;
        /** Freie Platzierung als Anteile des Bildes: [links, oben, Breite, max. Höhe?]. */
        box?: [number, number, number] | [number, number, number, number];
        /** Abspielgeschwindigkeit eines Videos (1 = normal). */
        rate?: number;
        /** Auftritt: "pop" (Standard), von rechts/links hereinfliegen oder ohne Animation. */
        enter?: "pop" | "right" | "left" | "none";
        /** false = am Ende nicht ausblenden (für nahtlos anschließende Teile). */
        exitFade?: boolean;
      }
    | {
        type: "sticker";
        text: string;
        kicker?: string;
        /** Ankerpunkt als Anteile des Bildes. */
        x: number;
        y: number;
        anchor?: "left" | "center" | "right";
        rotate?: number;
        variant?: "white" | "accent" | "dark" | "plain";
        size?: number;
      }
    | {
        type: "comment";
        author: string;
        text: string;
        /** "logo" = Marken-Logo als Profilbild, sonst Initiale. */
        avatar?: "logo" | string;
        y?: number;
        /** Text wird getippt (Sekunden bis vollständig). */
        typing?: number;
      }
    | { type: "notify"; app: string; title: string; body?: string; y?: number }
    | { type: "button"; text: string; doneText?: string; tapAt?: number; x?: number; y?: number }
    | { type: "audio"; src: string; from?: number; volume?: number }
    | { type: "headline"; text: string; kicker?: string; position?: "top" | "center"; accent?: boolean; dim?: boolean }
    | { type: "stat"; value: number; fromValue?: number; prefix?: string; suffix?: string; label?: string; source?: string; position?: "top" | "center"; dim?: boolean }
    /** Soundeffekt aus brand/sfx (vom Resolver nach .build/sfx kopiert). */
    | { type: "sfx"; name: string; src: string; from: number; volume: number }
    /** Gezeichnete Markierung. Koordinaten als Anteile des Bildes. */
    | {
        type: "draw";
        shape: "circle" | "underline" | "arrow" | "check" | "cross" | "box";
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        from?: [number, number];
        to?: [number, number];
        /** Krümmung des Pfeils (−1 … 1), Standard 0.25. */
        curve?: number;
        color?: "accent" | "white" | "dark";
        /** Strichstärke in px (bei 1080 Breite). */
        stroke?: number;
        /** Sekunden, bis die Form fertig gezeichnet ist. */
        drawTime?: number;
      }
    | { type: "lottie"; animationData: Record<string, unknown>; x?: number; y?: number; size?: number; loop?: boolean; rate?: number }
    | { type: "leak"; seed?: number; hue?: number }
    | { type: "flash"; color?: string }
  ) & {
    /** "behind" = zwischen Video und Freisteller (Text hinter der Person). */
    layer?: "behind";
  };

export type Punch = {
  /** Frames ab Szenenbeginn. */
  startFrame: number;
  durationInFrames: number;
  scale: number;
  origin: [number, number];
  ease: "snap" | "smooth";
};

type SceneBase = Timed & {
  id: string;
  transition?: "fade";
  /** Übergang aus der vorigen Szene (TransitionSeries), mittig um den Schnitt. */
  enter?: { type: string; frames: number };
  /** Frames vor dem Schnitt (Vorlauf für den Übergang hinein). */
  lead: number;
  /** Frames nach dem Szenenende (Nachlauf für den Übergang hinaus). */
  tail: number;
};

export type ClipScene = SceneBase & {
  type: "clip";
  src: string;
  in: number;
  out: number;
  volume?: number;
  fit?: "cover" | "contain";
  /** Skalierung am Szenenanfang (Punch-in), z. B. 1.12. */
  zoom?: number;
  /** Skalierung am Szenenende; ohne Angabe = zoom. */
  zoomTo?: number;
  /** Zoom-Mittelpunkt als Anteile [x, y]; Standard [0.5, 0.35]. */
  origin?: [number, number];
  /** Abspielgeschwindigkeit (0.3 = Zeitlupe, 3 = Zeitraffer). Szenendauer = (out − in) / speed. */
  speed?: number;
  /** Vor-/Nachlauf aus dem Quellclip spielen oder als Standbild (wenn kein Material da ist). */
  leadMode?: "play" | "freeze";
  tailMode?: "play" | "freeze";
  /** Bildausschnitt folgt dem Gesicht: [Frame ab Szenenbeginn, object-position x, y]. */
  pan?: [number, number, number][];
  punches?: Punch[];
  /** Freigestellte Person (WebM mit Alpha) für Text hinter der Person. */
  cutoutSrc?: string;
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
  shakes: { startFrame: number; durationInFrames: number; strength: number }[];
  music: { src: string; from?: number; volume: number; duckTo: number; duckRanges: [number, number][] } | null;
  brand: Brand;
};
