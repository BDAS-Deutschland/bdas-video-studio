// Gilt für pnpm render und pnpm studio (Remotion liest diese Datei automatisch).
import { Config } from "@remotion/cli/config";

// WebGL für Shader-Übergänge (zoom, whip, …), Light Leaks und Effekte.
Config.setChromiumOpenGlRenderer("angle");
