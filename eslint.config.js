// ESLint konfiguracija za Vite + React projekt s podrškom za hookove, HMR i pregledne greške

import js from "@eslint/js"; // Osnovna ESLint pravila za JavaScript
import globals from "globals"; // Browser globalne varijable (window, document itd.)
import reactHooks from "eslint-plugin-react-hooks"; // React Hook pravila (pravilan useEffect, useState itd.)
import reactRefresh from "eslint-plugin-react-refresh"; // HMR provjera za Vite s Reactom

export default [
  // Ovaj blok ignorira izlazne build direktorije
  { ignores: ["dist", "build"] },

  {
    // Primjenjuje ESLint na sve .js i .jsx fajlove
    files: ["**/*.{js,jsx}"],

    // Postavke jezika (parser, globals, itd.)
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },

    // Aktivirani pluginovi
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    // Pravila (kombinacija osnovnih + specifičnih)
    rules: {
      // Osnovna ESLint pravila
      ...js.configs.recommended.rules,

      // Pravila za React hookove
      ...reactHooks.configs.recommended.rules,

      // Spriječi greške kod Vite HMR ako zaboraviš eksportati komponentu pravilno
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Korisno pravilo da npr. UPPERCASE konstante ne bacaju warning ako nisu korištene
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
];
