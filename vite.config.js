// vite.config.js - ZAMIJENI POSTOJEĆI (Jednostavan fix)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      // JSX support u .js fajlovima
      include: "**/*.{jsx,js}",
    }),
  ],

  // Development server
  server: {
    port: 3000,
    host: true,
  },

  // Build optimizacije
  build: {
    target: "es2020",
    sourcemap: true,

    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "router-vendor": ["react-router-dom"],
          "supabase-vendor": ["@supabase/supabase-js"],
          utils: [/src\/utils/],
        },
      },
    },
  },

  // JSX u .js fajlovima
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
  },

  // Optimizacije za dependencies
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
