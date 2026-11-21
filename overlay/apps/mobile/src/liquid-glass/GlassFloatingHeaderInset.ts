import { createContext, use } from "react";

/**
 * Total vertical clearance reserved at the top of a scrolling Android screen whose
 * floating oval LiquidGlassHeader overlays the content so scrolling rows blur live behind it.
 */
export const GlassFloatingHeaderInsetContext = createContext(0);

export function useGlassFloatingHeaderInset(): number {
  return use(GlassFloatingHeaderInsetContext);
}
