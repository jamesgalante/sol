/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Dev-only override for the sky background's time of day, so you can see
   * how the sun/moon look at any hour without waiting for the clock. Accepts
   * an hour ("14", "14.5") or "HH:MM" ("14:30"). Ignored in production.
   * Set it in `.env.local`, e.g. `VITE_SKY_TIME=14:30`.
   */
  readonly VITE_SKY_TIME?: string
}
