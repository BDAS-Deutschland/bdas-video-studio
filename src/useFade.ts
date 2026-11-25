import { interpolate, useCurrentFrame } from "remotion";

export function useFadeIn(enabled: boolean, frames = 8) {
  const frame = useCurrentFrame();
  return enabled ? interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp" }) : 1;
}
