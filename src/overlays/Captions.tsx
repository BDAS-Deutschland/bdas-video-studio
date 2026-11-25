import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useLayout } from "../layout";
import type { Brand, CaptionChunk } from "../types";

export const Captions = ({ chunk, brand }: { chunk: CaptionChunk; brand: Brand }) => {
  const local = useCurrentFrame();
  const frame = chunk.startFrame + local;
  const { unit, left, right, bottom, vertical } = useLayout();
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingLeft: left,
        paddingRight: right,
        paddingBottom: vertical ? bottom + 20 * unit : bottom,
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 1.15 }}>
        {chunk.words.map((w, i) => {
          const active = frame >= w.startFrame && frame < w.endFrame;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: `0 ${12 * unit}px`,
                fontSize: 66 * unit,
                fontWeight: 800,
                color: active ? brand.captions.highlight : "#fff",
                WebkitTextStroke: `${3 * unit}px rgba(0,0,0,0.85)`,
                paintOrder: "stroke fill",
                textShadow: "0 4px 18px rgba(0,0,0,0.6)",
                transform: active ? "scale(1.08)" : "none",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
