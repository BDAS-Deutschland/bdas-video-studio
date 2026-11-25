import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import type { Brand, SceneOverlay } from "../types";

// Platz unter einem Logo oben, damit großer Text es nicht überdeckt.
const LOGO_CLEARANCE = 150;

function useInOut() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return { enter, exit };
}

const Title = ({ text, subtitle, brand }: { text: string; subtitle?: string; brand: Brand }) => {
  const { enter, exit } = useInOut();
  const { unit, left, bottom } = useLayout();
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", paddingLeft: left, paddingBottom: bottom + 140 * unit }}>
      <div style={{ opacity: exit, transform: `translateX(${(1 - enter) * -60 * unit}px)` }}>
        <div
          style={{
            display: "inline-block",
            background: brand.colors.background,
            color: brand.colors.inkStrong,
            fontWeight: 800,
            fontSize: 54 * unit,
            padding: `${14 * unit}px ${26 * unit}px`,
            borderLeft: `${10 * unit}px solid ${brand.colors.accent}`,
            borderRadius: brand.radius * unit * 0.5,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          {text}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 10 * unit,
              display: "inline-block",
              background: brand.colors.accent,
              color: brand.colors.onAccent,
              fontWeight: 600,
              fontSize: 38 * unit,
              padding: `${8 * unit}px ${22 * unit}px`,
              borderRadius: brand.radius * unit * 0.5,
              opacity: enter,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const BigText = ({ text, position = "center", brand }: { text: string; position?: string; brand: Brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { exit } = useInOut();
  const { unit, left, right, top, bottom } = useLayout();
  const words = text.split(/\s+/).filter(Boolean);
  const justify = position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center";
  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: "center",
        paddingLeft: left,
        paddingRight: right,
        paddingTop: top + LOGO_CLEARANCE * unit,
        paddingBottom: bottom,
      }}
    >
      <div style={{ textAlign: "center", opacity: exit, lineHeight: 1.08 }}>
        {words.map((w, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { damping: 14, stiffness: 160 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: 18 * unit,
                color: "#fff",
                fontSize: 104 * unit,
                fontWeight: 800,
                letterSpacing: -2 * unit,
                textShadow: "0 6px 30px rgba(0,0,0,0.55)",
                transform: `translateY(${(1 - s) * 50 * unit}px) scale(${0.85 + 0.15 * s})`,
                opacity: Math.min(1, s * 1.5),
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Logo = ({ position = "top-left", brand }: { position?: string; brand: Brand }) => {
  const { enter, exit } = useInOut();
  const { unit, left, right, top, bottom } = useLayout();
  const size = 110 * unit;
  const style: React.CSSProperties = { position: "absolute", height: size, opacity: enter * exit };
  if (position === "top-left") Object.assign(style, { top, left });
  if (position === "top-right") Object.assign(style, { top, right });
  if (position === "bottom-right") Object.assign(style, { bottom, right });
  if (position === "center") Object.assign(style, { top: "50%", left: "50%", transform: "translate(-50%,-50%)", height: size * 2.5 });
  if (!brand.logo) {
    return (
      <AbsoluteFill>
        <div style={{ ...style, height: undefined, color: "#fff", fontWeight: 800, fontSize: 56 * unit, textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
          {brand.name}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <Img src={staticFile(brand.logo)} style={style} />
    </AbsoluteFill>
  );
};

export const Overlay = ({ overlay, brand }: { overlay: SceneOverlay; brand: Brand }) => {
  switch (overlay.type) {
    case "title":
      return <Title text={overlay.text} subtitle={overlay.subtitle} brand={brand} />;
    case "text":
      return <BigText text={overlay.text} position={overlay.position} brand={brand} />;
    case "logo":
      return <Logo position={overlay.position} brand={brand} />;
  }
};
