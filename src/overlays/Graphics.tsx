import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import type { Brand, SceneOverlay } from "../types";

type MediaO = Extract<SceneOverlay, { type: "media" }>;
type HeadlineO = Extract<SceneOverlay, { type: "headline" }>;
type StatO = Extract<SceneOverlay, { type: "stat" }>;

// Platz unter dem Logo oben und über den Untertiteln unten.
const LOGO_CLEARANCE = 150;
const CAPTION_ROOM = 230;

function useEnterExit(exitFrames = 8) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, stiffness: 140, mass: 0.8 } });
  const exit = interpolate(frame, [durationInFrames - exitFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  return { frame, fps, durationInFrames, enter, exit };
}

/** Bereich für Grafiken: unter dem Logo, über den Untertiteln. */
function useStage() {
  const { width, height } = useVideoConfig();
  const l = useLayout();
  const top = l.top + LOGO_CLEARANCE * l.unit;
  const bottom = height - l.bottom - CAPTION_ROOM * l.unit;
  return { ...l, width, height, stageTop: top, stageBottom: bottom };
}

const Dim = ({ amount }: { amount: number }) => (
  <AbsoluteFill style={{ background: `rgba(0,0,0,${0.4 * amount})`, backdropFilter: `blur(${10 * amount}px)` }} />
);

const Pill = ({ text, brand, unit, opacity = 1 }: { text: string; brand: Brand; unit: number; opacity?: number }) => (
  <div
    style={{
      display: "inline-block",
      background: brand.colors.background,
      color: brand.colors.inkStrong,
      fontWeight: 700,
      fontSize: 34 * unit,
      padding: `${8 * unit}px ${20 * unit}px`,
      borderLeft: `${8 * unit}px solid ${brand.colors.accent}`,
      borderRadius: brand.radius * unit * 0.5,
      boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
      opacity,
    }}
  >
    {text}
  </div>
);

export const Media = ({ o, brand }: { o: MediaO; brand: Brand }) => {
  const { frame, fps, durationInFrames, enter: popEnter, exit: fadeExit } = useEnterExit();
  const { unit, width, height, stageTop, stageBottom, right, left } = useStage();
  const [cx, cy, cw, ch] = o.crop ?? [0, 0, 1, 1];
  const cropAspect = (o.srcAspect * cw) / ch;
  const full = o.layout === "full";
  const mode = o.enter ?? "pop";
  const slide = spring({ frame, fps, config: { damping: 16, stiffness: 120, mass: 0.9 } });
  const enter = mode === "none" ? 1 : mode === "pop" ? popEnter : slide;
  const exit = o.exitFade === false ? 1 : fadeExit;

  // Slow push-in innerhalb des Bildes, damit es lebt.
  const drift = interpolate(frame, [0, durationInFrames], [1, o.box ? 1.03 : 1.07]);

  let cardW = full ? width : width * (o.width ?? 0.8);
  let cardH = full ? height : cardW / cropAspect;
  const textRoom = (o.quote ? 170 : 0) * unit + (o.label ? 70 : 0) * unit;
  if (o.box) {
    const [, , bw, bh] = o.box;
    cardW = bw * width;
    cardH = cardW / cropAspect;
    if (bh && cardH > bh * height) {
      cardH = bh * height;
      cardW = cardH * cropAspect;
    }
  } else {
    const maxH = stageBottom - stageTop - textRoom;
    if (!full && cardH > maxH) {
      cardH = maxH;
      cardW = cardH * cropAspect;
    }
  }

  // Innere Mediengröße so wählen, dass genau der Ausschnitt die Karte füllt.
  let innerW = cardW / cw;
  let innerH = innerW / o.srcAspect;
  if (full && innerH < cardH / ch) {
    innerH = cardH / ch;
    innerW = innerH * o.srcAspect;
  }
  const offX = -cx * innerW - (full ? (innerW * cw - cardW) / 2 : 0);
  const offY = -cy * innerH - (full ? (innerH * ch - cardH) / 2 : 0);

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    left: offX,
    top: offY,
    width: innerW,
    height: innerH,
    transform: `scale(${drift})`,
    transformOrigin: `${(cx + cw / 2) * 100}% ${(cy + ch / 2) * 100}%`,
    objectFit: "cover",
  };
  const media =
    o.kind === "video" ? (
      <OffthreadVideo
        src={staticFile(o.src)}
        muted
        playbackRate={o.rate ?? 1}
        trimBefore={Math.round((o.from ?? 0) * fps)}
        style={mediaStyle}
      />
    ) : (
      <Img src={staticFile(o.src)} style={mediaStyle} />
    );

  if (full) {
    return (
      <AbsoluteFill style={{ opacity: Math.min(1, enter * 1.4) * exit, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>{media}</div>
        {o.label ? (
          <div style={{ position: "absolute", left, bottom: height - stageBottom + 40 * unit }}>
            <Pill text={o.label} brand={brand} unit={unit} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  const tilt = o.tilt ?? 0;
  const fly = mode === "right" ? 1 : mode === "left" ? -1 : 0;
  const rot = tilt + (mode === "pop" ? (1 - enter) * 8 : fly * (1 - enter) * 10);
  const scale = mode === "pop" ? (0.7 + 0.3 * enter) * (0.92 + 0.08 * exit) : 0.92 + 0.08 * exit;
  const shiftX = fly * (1 - enter) * width * 0.7;
  const blockH = cardH + textRoom;
  let blockTop = o.position === "top" ? stageTop : stageTop + (stageBottom - stageTop - blockH) / 2;
  let blockLeft = left + (width - left - right - cardW) / 2;
  if (o.box) {
    blockTop = o.box[1] * height;
    blockLeft = o.box[0] * width + (o.box[2] * width - cardW) / 2;
  }
  const quoteEnter = spring({ frame: frame - 8, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill>
      {o.dim ? (
        <AbsoluteFill
          style={{
            background: `rgba(0,0,0,${0.45 * Math.min(1, enter) * exit})`,
            backdropFilter: `blur(${14 * Math.min(1, enter) * exit}px)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: blockTop,
          left: blockLeft,
          width: cardW,
          opacity: (mode === "none" ? 1 : Math.min(1, enter * 1.5)) * exit,
          transform: `translateX(${shiftX}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: cardW,
            height: cardH,
            overflow: "hidden",
            borderRadius: brand.radius * unit * (o.box ? 2.2 : 1.4),
            border: `${(o.box ? 6 : 8) * unit}px solid ${brand.colors.background}`,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            transform: `rotate(${rot}deg) scale(${scale})`,
            background: "#111",
          }}
        >
          {media}
        </div>
        {o.quote ? (
          <div
            style={{
              marginTop: 34 * unit,
              color: "#fff",
              fontWeight: 800,
              fontSize: 54 * unit,
              lineHeight: 1.12,
              textAlign: "center",
              textShadow: "0 4px 22px rgba(0,0,0,0.7)",
              opacity: quoteEnter * exit,
              transform: `translateY(${(1 - quoteEnter) * 24 * unit}px)`,
            }}
          >
            <span style={{ color: brand.colors.accent }}>„</span>
            {o.quote}
            <span style={{ color: brand.colors.accent }}>“</span>
          </div>
        ) : null}
        {o.label ? (
          <div style={{ marginTop: (o.quote ? 18 : 26) * unit, textAlign: "center" }}>
            <Pill text={o.label} brand={brand} unit={unit} opacity={quoteEnter * exit} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Headline = ({ o, brand }: { o: HeadlineO; brand: Brand }) => {
  const { frame, fps, exit } = useEnterExit(7);
  const { unit, left, right, stageTop, stageBottom, width } = useStage();
  const words = o.text.split(/\s+/).filter(Boolean);
  // Längstes Wort muss in eine Zeile passen (Inter 800 ≈ 0,62 em pro Zeichen).
  const longest = Math.max(...words.map((w) => w.length));
  const fontSize = Math.min(118 * unit, (width - left - right) / (longest * 0.62));
  const kick = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  const bar = spring({ frame: frame - 3, fps, config: { damping: 200 }, durationInFrames: 14 });
  const color = o.accent === false ? "#fff" : brand.colors.accent;
  const top = o.position === "center" ? (stageTop + stageBottom) / 2 - 160 * unit : stageTop;
  return (
    <AbsoluteFill style={{ paddingLeft: left, paddingRight: right }}>
      {o.dim ? <Dim amount={Math.min(1, kick) * exit} /> : null}
      <div style={{ position: "absolute", top, left, right, textAlign: "center", opacity: exit }}>
        {o.kicker ? (
          <div
            style={{
              display: "inline-block",
              color: "#fff",
              fontWeight: 600,
              fontSize: 46 * unit,
              letterSpacing: 1 * unit,
              textShadow: "0 3px 16px rgba(0,0,0,0.7)",
              opacity: kick,
              transform: `translateY(${(1 - kick) * -20 * unit}px)`,
            }}
          >
            {o.kicker}
            <div
              style={{
                height: 6 * unit,
                marginTop: 8 * unit,
                background: brand.colors.accent,
                borderRadius: 3 * unit,
                transform: `scaleX(${bar})`,
                transformOrigin: "left",
              }}
            />
          </div>
        ) : null}
        <div style={{ lineHeight: 1.0, marginTop: 6 * unit }}>
          {words.map((w, i) => {
            const s = spring({ frame: frame - 4 - i * 3, fps, config: { damping: 11, stiffness: 170 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  // Wortabstand relativ zur Schriftgröße – mit weißer Kontur wirkten 12 px wie „JEDERZWEITE“.
                  margin: `0 ${Math.max(12 * unit, fontSize * 0.15)}px`,
                  color,
                  fontSize,
                  fontWeight: 800,
                  letterSpacing: -3 * unit,
                  WebkitTextStroke: o.accent === false ? undefined : `${5 * unit}px #fff`,
                  paintOrder: "stroke fill",
                  textShadow: "0 8px 30px rgba(0,0,0,0.45)",
                  transform: `translateY(${(1 - s) * 60 * unit}px) scale(${0.6 + 0.4 * s})`,
                  opacity: Math.min(1, s * 1.6),
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Stat = ({ o, brand }: { o: StatO; brand: Brand }) => {
  const { frame, fps, enter, exit } = useEnterExit(7);
  const { unit, left, right, stageTop, stageBottom } = useStage();
  const t = interpolate(frame, [2, Math.round(fps * 0.9)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const from = o.fromValue ?? 0;
  const v = Math.round(from + (o.value - from) * t);
  const isYear = o.value >= 1000 && o.value <= 2100 && Number.isInteger(o.value) && !o.suffix;
  const shown = isYear ? String(v) : v.toLocaleString("de-DE");
  const land = spring({ frame: frame - Math.round(fps * 0.9), fps, config: { damping: 9, stiffness: 200 } });
  const pop = 1 + 0.06 * Math.sin(Math.min(1, land) * Math.PI);
  const labelIn = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const top = o.position === "top" ? stageTop : (stageTop + stageBottom) / 2 - 200 * unit;
  return (
    <AbsoluteFill style={{ paddingLeft: left, paddingRight: right }}>
      {o.dim ? <Dim amount={Math.min(1, enter) * exit} /> : null}
      <div style={{ position: "absolute", top, left, right, textAlign: "center", opacity: Math.min(1, enter * 1.5) * exit }}>
        <div
          style={{
            display: "inline-block",
            color: "#fff",
            fontWeight: 800,
            fontSize: 210 * unit,
            letterSpacing: -6 * unit,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            WebkitTextStroke: `${4 * unit}px rgba(0,0,0,0.35)`,
            paintOrder: "stroke fill",
            textShadow: "0 10px 40px rgba(0,0,0,0.6)",
            transform: `scale(${(0.75 + 0.25 * enter) * pop})`,
          }}
        >
          {o.prefix ?? ""}
          {shown}
          {o.suffix ? <span style={{ color: brand.colors.accent, WebkitTextStroke: `${4 * unit}px #fff` }}>{o.suffix}</span> : null}
        </div>
        {o.label ? (
          <div style={{ marginTop: 18 * unit }}>
            <div
              style={{
                display: "inline-block",
                background: brand.colors.accent,
                color: brand.colors.onAccent,
                fontWeight: 800,
                fontSize: 52 * unit,
                padding: `${10 * unit}px ${28 * unit}px`,
                borderRadius: brand.radius * unit * 0.6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                opacity: labelIn,
                transform: `translateY(${(1 - labelIn) * 30 * unit}px) rotate(${-2 * labelIn}deg)`,
              }}
            >
              {o.label}
            </div>
          </div>
        ) : null}
        {o.source ? (
          <div
            style={{
              marginTop: 16 * unit,
              color: "#fff",
              fontWeight: 600,
              fontSize: 28 * unit,
              opacity: 0.85 * labelIn,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
          >
            {o.source}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

type StickerO = Extract<SceneOverlay, { type: "sticker" }>;
type CommentO = Extract<SceneOverlay, { type: "comment" }>;
type NotifyO = Extract<SceneOverlay, { type: "notify" }>;
type ButtonO = Extract<SceneOverlay, { type: "button" }>;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Frei platzierbarer Sticker (z. B. neben eine Geste), poppt rein und wackelt leicht. */
export const Sticker = ({ o, brand }: { o: StickerO; brand: Brand }) => {
  const { frame, fps, exit } = useEnterExit(6);
  const { unit, width, height } = useStage();
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 180, mass: 0.7 } });
  const wobble = Math.sin(frame / 9) * 0.8;
  const variant = o.variant ?? "white";
  const plain = variant === "plain";
  const bg = plain ? "transparent" : variant === "accent" ? brand.colors.accent : variant === "dark" ? brand.colors.inkStrong : brand.colors.background;
  const ink = variant === "white" ? brand.colors.inkStrong : brand.colors.onAccent;
  const kickInk = variant === "white" ? brand.colors.inkBody : "rgba(255,255,255,0.88)";
  const k = (o.size ?? 1) * unit;
  const anchor = o.anchor ?? "center";
  const tx = anchor === "left" ? "0%" : anchor === "right" ? "-100%" : "-50%";
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: o.x * width,
          top: o.y * height,
          transform: `translateX(${tx}) rotate(${(o.rotate ?? -3) + wobble}deg) scale(${(0.4 + 0.6 * pop) * (0.9 + 0.1 * exit)})`,
          transformOrigin: anchor === "left" ? "left center" : anchor === "right" ? "right center" : "center",
          opacity: Math.min(1, pop * 2) * exit,
        }}
      >
        <div
          style={{
            background: bg,
            borderRadius: 22 * k,
            padding: `${14 * k}px ${30 * k}px ${16 * k}px`,
            boxShadow: plain ? undefined : "0 14px 34px rgba(0,0,0,0.35)",
            filter: plain ? "drop-shadow(0 8px 18px rgba(0,0,0,0.45))" : undefined,
            borderBottom: variant === "white" ? `${7 * k}px solid ${brand.colors.accent}` : undefined,
            whiteSpace: "pre",
            textAlign: anchor === "right" ? "right" : anchor === "left" ? "left" : "center",
          }}
        >
          {o.kicker ? (
            <div style={{ fontSize: 30 * k, fontWeight: 600, color: kickInk, letterSpacing: 0.5 * k, marginBottom: 2 * k }}>{o.kicker}</div>
          ) : null}
          <div style={{ fontSize: 58 * k, fontWeight: 800, color: ink, letterSpacing: -1 * k, lineHeight: 1.08 }}>{o.text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Kommentar-Karte im Stil sozialer Netzwerke, optional getippt. */
export const Comment = ({ o, brand }: { o: CommentO; brand: Brand }) => {
  const { frame, fps, exit } = useEnterExit(6);
  const { unit, height, left, right, width } = useStage();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 170 } });
  const chars = Array.from(o.text);
  const typeEnd = o.typing ? 4 + Math.round(o.typing * fps) : 0;
  const count = o.typing ? Math.round(interpolate(frame, [4, typeEnd], [0, chars.length], CLAMP)) : chars.length;
  const caret = o.typing !== undefined && frame < typeEnd + 8 && Math.floor(frame / 7) % 2 === 0;
  const heart = spring({ frame: frame - (typeEnd + 12), fps, config: { damping: 8, stiffness: 200 } });
  const liked = heart > 0.5;
  const c = brand.colors;
  const avatar =
    o.avatar === "logo" && brand.logo ? (
      <Img src={staticFile(brand.logo)} style={{ width: 84 * unit, height: 84 * unit, borderRadius: 42 * unit, objectFit: "contain", background: "#fff", border: `${3 * unit}px solid ${c.surface}` }} />
    ) : (
      <div style={{ width: 84 * unit, height: 84 * unit, borderRadius: 42 * unit, background: c.accent, color: c.onAccent, fontWeight: 800, fontSize: 40 * unit, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {(o.avatar ?? o.author[0] ?? "?").toUpperCase()}
      </div>
    );
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left,
          top: (o.y ?? 0.5) * height,
          width: width - left - right,
          transform: `translateY(${(1 - pop) * 40 * unit}px) scale(${0.85 + 0.15 * pop})`,
          opacity: Math.min(1, pop * 1.6) * exit,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 22 * unit, background: c.background, borderRadius: 34 * unit, padding: `${24 * unit}px ${28 * unit}px`, boxShadow: "0 18px 44px rgba(0,0,0,0.35)" }}>
          {avatar}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32 * unit, fontWeight: 800, color: c.inkStrong }}>
              {o.author} <span style={{ fontWeight: 400, color: c.inkMuted }}>· jetzt</span>
            </div>
            <div style={{ fontSize: 46 * unit, fontWeight: 600, color: c.inkStrong, lineHeight: 1.18, marginTop: 6 * unit, minHeight: 54 * unit }}>
              {chars.slice(0, count).join("")}
              {caret ? <span style={{ color: c.accent }}>|</span> : null}
            </div>
            <div style={{ fontSize: 26 * unit, fontWeight: 600, color: c.inkMuted, marginTop: 10 * unit }}>Antworten</div>
          </div>
          <div style={{ fontSize: 48 * unit, lineHeight: 1, color: liked ? c.accent : c.inkMuted, transform: `scale(${1 + 0.45 * Math.sin(Math.min(1, heart) * Math.PI)})` }}>
            {liked ? "♥" : "♡"}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Benachrichtigung, die von oben hereinrutscht. */
export const Notify = ({ o, brand }: { o: NotifyO; brand: Brand }) => {
  const { frame, fps, exit } = useEnterExit(8);
  const { unit, height, left, right, width } = useStage();
  const drop = spring({ frame, fps, config: { damping: 15, stiffness: 140 } });
  const c = brand.colors;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left, width: width - left - right, top: (o.y ?? 0.145) * height, transform: `translateY(${(1 - drop) * -300 * unit}px)`, opacity: exit }}>
        <div style={{ display: "flex", gap: 22 * unit, alignItems: "center", background: "rgba(255,255,255,0.95)", borderRadius: 40 * unit, padding: `${22 * unit}px ${26 * unit}px`, boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }}>
          <div style={{ width: 88 * unit, height: 88 * unit, borderRadius: 22 * unit, background: c.background, border: `${3 * unit}px solid ${c.surface}`, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ background: c.accent, color: c.onAccent, fontSize: 18 * unit, fontWeight: 800, width: "100%", textAlign: "center", padding: `${3 * unit}px 0` }}>KAL</div>
            <div style={{ fontSize: 40 * unit, fontWeight: 800, color: c.inkStrong, lineHeight: 1.25 }}>📅</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 * unit, fontWeight: 600, color: c.inkMuted, letterSpacing: 1 * unit }}>
              <span>{o.app.toUpperCase()}</span>
              <span>jetzt</span>
            </div>
            <div style={{ fontSize: 40 * unit, fontWeight: 800, color: c.inkStrong, marginTop: 2 * unit }}>{o.title}</div>
            {o.body ? <div style={{ fontSize: 33 * unit, color: c.inkBody, marginTop: 2 * unit }}>{o.body}</div> : null}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Knopf, der angetippt wird (z. B. „Folgen“ → „Gefolgt“). */
export const Button = ({ o, brand }: { o: ButtonO; brand: Brand }) => {
  const { frame, fps, exit } = useEnterExit(6);
  const { unit, width, height } = useStage();
  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 170 } });
  const tapF = Math.round((o.tapAt ?? 0.8) * fps);
  const tapped = frame >= tapF;
  const press = interpolate(frame, [tapF - 4, tapF, tapF + 5], [1, 0.86, 1], CLAMP);
  const fingerIn = spring({ frame: frame - (tapF - 14), fps, config: { damping: 14 } });
  const fingerOut = interpolate(frame, [tapF + 6, tapF + 16], [1, 0], CLAMP);
  const c = brand.colors;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: (o.x ?? 0.5) * width, top: (o.y ?? 0.16) * height, transform: `translateX(-50%) scale(${(0.5 + 0.5 * pop) * press})`, opacity: Math.min(1, pop * 2) * exit }}>
        <div style={{ background: tapped ? c.background : c.accent, color: tapped ? c.inkStrong : c.onAccent, fontWeight: 800, fontSize: 56 * unit, padding: `${18 * unit}px ${54 * unit}px`, borderRadius: 999, boxShadow: "0 14px 34px rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>
          {tapped ? o.doneText ?? "Gefolgt ✓" : o.text}
        </div>
        <div style={{ position: "absolute", right: -40 * unit, bottom: -80 * unit, fontSize: 90 * unit, transform: `translate(${(1 - fingerIn) * 140 * unit}px, ${(1 - fingerIn) * 140 * unit}px)`, opacity: Math.min(1, fingerIn) * fingerOut }}>
          👆
        </div>
      </div>
    </AbsoluteFill>
  );
};
