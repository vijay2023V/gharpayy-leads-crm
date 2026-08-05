// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// nitro is disabled because this app's entry (src/main.tsx) is a plain client-rendered
// React SPA, not a TanStack Start SSR app — the default nitro build targets Cloudflare
// Workers, which Netlify can't serve as a static site.
export default defineConfig({ nitro: false });
