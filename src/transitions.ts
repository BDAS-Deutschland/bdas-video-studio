import { linearTiming, type TransitionPresentation, type TransitionMotionBlur } from "@remotion/transitions";
import { blurSlide } from "@remotion/transitions/blur-slide";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { cube } from "@remotion/transitions/cube";
import { dreamyZoom } from "@remotion/transitions/dreamy-zoom";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { pushCut } from "@remotion/transitions/push-cut";
import { ripple } from "@remotion/transitions/ripple";
import { slide } from "@remotion/transitions/slide";
import { swap } from "@remotion/transitions/swap";
import { wipe } from "@remotion/transitions/wipe";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { zoomInOut } from "@remotion/transitions/zoom-in-out";
import { Easing } from "remotion";

type Dir = "from-left" | "from-right" | "from-top" | "from-bottom";

/** "slide-left" = das neue Bild bewegt sich nach links, kommt also von rechts. */
const FROM: Record<string, Dir> = { left: "from-right", right: "from-left", up: "from-bottom", down: "from-top" };

const BLUR: TransitionMotionBlur = { shutterAngle: 180, samples: 12 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPresentation = TransitionPresentation<any>;

/** Übersetzt den Übergangsnamen aus timeline.json in eine Remotion-Präsentation. */
export function transitionProps(type: string, frames: number, width: number, height: number) {
  const [base, dirWord] = type.split(/-(left|right|up|down)$/);
  const direction = dirWord ? FROM[dirWord] : undefined;
  let presentation: AnyPresentation;
  let motionBlur: TransitionMotionBlur | undefined;
  let easing = Easing.inOut(Easing.cubic);
  switch (dirWord ? base : type) {
    case "slide":
      presentation = slide({ direction });
      motionBlur = BLUR;
      break;
    case "whip":
      presentation = blurSlide({ direction });
      easing = Easing.inOut(Easing.quad);
      break;
    case "wipe":
      presentation = wipe({ direction });
      break;
    case "cube":
      presentation = cube({ direction: direction ?? "from-right" });
      motionBlur = BLUR;
      break;
    case "flip":
      presentation = flip({ direction });
      motionBlur = BLUR;
      break;
    case "push":
      presentation = pushCut({ flashColor: "#ffffff" });
      break;
    case "zoom":
      presentation = zoomBlur({});
      break;
    case "zoom-in-out":
      presentation = zoomInOut({});
      break;
    case "cross-zoom":
      presentation = crossZoom({});
      break;
    case "linear-blur":
      presentation = linearBlur({});
      break;
    case "swap":
      presentation = swap({});
      break;
    case "crosswarp":
      presentation = crosswarp({});
      break;
    case "ripple":
      presentation = ripple({});
      break;
    case "dreamy":
      presentation = dreamyZoom({});
      break;
    case "iris":
      presentation = iris({ width, height });
      break;
    case "clock":
      presentation = clockWipe({ width, height });
      break;
    case "crossfade":
    default:
      presentation = fade();
      easing = Easing.linear;
  }
  return { presentation, timing: linearTiming({ durationInFrames: frames, easing }), motionBlur };
}
