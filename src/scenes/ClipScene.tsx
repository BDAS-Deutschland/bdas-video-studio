import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { ClipScene as ClipSceneT } from "../types";
import { useFadeIn } from "../useFade";

export const ClipScene = ({ scene }: { scene: ClipSceneT }) => {
  const { fps } = useVideoConfig();
  const opacity = useFadeIn(scene.transition === "fade");
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={staticFile(scene.src)}
        trimBefore={Math.round(scene.in * fps)}
        trimAfter={Math.round(scene.out * fps)}
        volume={scene.volume ?? 1}
        style={{ width: "100%", height: "100%", objectFit: scene.fit ?? "cover" }}
      />
    </AbsoluteFill>
  );
};
