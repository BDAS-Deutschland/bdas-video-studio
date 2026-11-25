import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import type { Brand, CardScene as CardSceneT } from "../types";
import { useFadeIn } from "../useFade";

export const CardScene = ({ scene, brand }: { scene: CardSceneT; brand: Brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { unit, left, right } = useLayout();
  const accent = scene.variant === "accent" || (scene.type === "card" && scene.variant !== "light");
  const bg = accent ? brand.colors.accent : brand.colors.background;
  const ink = accent ? brand.colors.onAccent : brand.colors.inkStrong;
  const sub = accent ? brand.colors.onAccent : brand.colors.inkBody;

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const subEnter = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = useFadeIn(scene.transition === "fade");

  return (
    <AbsoluteFill
      style={{ backgroundColor: bg, justifyContent: "center", alignItems: "center", paddingLeft: left, paddingRight: right, opacity }}
    >
      <div style={{ textAlign: "center", opacity: exit }}>
        {scene.type === "cta" && brand.logo ? (
          <Img
            src={staticFile(brand.logo)}
            style={{ height: 180 * unit, marginBottom: 60 * unit, opacity: enter, transform: `scale(${0.9 + 0.1 * enter})` }}
          />
        ) : null}
        {scene.title ? (
          <div
            style={{
              color: ink,
              fontSize: 112 * unit,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2 * unit,
              transform: `translateY(${(1 - enter) * 40 * unit}px)`,
              opacity: enter,
            }}
          >
            {scene.title}
          </div>
        ) : null}
        {scene.subtitle ? (
          <div
            style={{
              color: sub,
              fontSize: 52 * unit,
              fontWeight: 400,
              marginTop: 28 * unit,
              transform: `translateY(${(1 - subEnter) * 30 * unit}px)`,
              opacity: subEnter * (accent ? 0.9 : 1),
            }}
          >
            {scene.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
