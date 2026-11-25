import { useVideoConfig } from "remotion";

// Freizuhaltende Ränder in Hochkant-Feeds (siehe CLAUDE.md, Stufe 5).
export const SAFE = { top: 0.14, bottom: 0.22, right: 0.12, side: 0.06 };

export function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const unit = Math.min(width, height) / 1080;
  return {
    unit,
    vertical,
    top: vertical ? height * SAFE.top : height * 0.06,
    bottom: vertical ? height * SAFE.bottom : height * 0.08,
    left: width * SAFE.side,
    right: vertical ? width * SAFE.right : width * SAFE.side,
  };
}
