import { defineConfig, loadEnv, type PluginOption } from "vite";
import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Load all env vars into process.env for server routes (SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, etc.)
const serverEnv = loadEnv(
  process.env.NODE_ENV === "production" ? "production" : "development",
  process.cwd(),
  "",
);
Object.assign(process.env, serverEnv);

export default defineConfig(async ({ command }) => {
  const isBuild = command === "build";

  const plugins: PluginOption[] = [
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ];

  if (isBuild) {
    const defaultPreset = process.env.NITRO_PRESET || "cloudflare-module";
    plugins.push(
      nitro({
        defaultPreset,
      }),
    );
  } else {
    // Local-development helper only; never loaded or required during production builds
    try {
      const { localPipelinePlugin } = await import("./scripts/local-pipeline-pump.mjs");
      plugins.push(localPipelinePlugin());
    } catch {
      // Gracefully continue if local helper is not present
    }
  }

  return {
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      allowedHosts: ["stuffy-lumping-rethink.ngrok-free.dev"],
    },
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
        "entities/lib/decode.js": path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        entities: path.resolve(process.cwd(), "node_modules/entities"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    plugins,
  };
});
