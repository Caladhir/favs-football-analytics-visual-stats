// .eslintrc-performance.js - NOVI FAJL za performance rules
export default {
  extends: ["./eslint.config.js"],
  rules: {
    // React Hooks performance
    "react-hooks/exhaustive-deps": "error",
    "react-hooks/rules-of-hooks": "error",

    // React performance specifične pravila
    "react/jsx-key": "error",
    "react/no-array-index-key": "warn",
    "react/jsx-no-bind": [
      "warn",
      {
        ignoreRefs: true,
        allowArrowFunctions: true,
        allowFunctions: false,
        allowBind: false,
      },
    ],

    // Općenite performance optimizacije
    "prefer-const": "error",
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "no-console": "off", // Allowaj console u development

    // Code quality za performance
    "no-multiple-empty-lines": ["error", { max: 2 }],
    "max-lines-per-function": ["warn", { max: 50 }],
    complexity: ["warn", { max: 10 }],
    "max-depth": ["warn", { max: 4 }],

    // Import optimizacije
    "no-duplicate-imports": "error",

    // Performance anti-patterns
    "no-inner-declarations": "error",
    "no-loop-func": "error",
    "prefer-template": "warn",

    // Custom rules za naš projekt
    "no-restricted-syntax": [
      "error",
      {
        selector:
          'CallExpression[callee.name="setInterval"][arguments.1.type="Literal"][arguments.1.value<100]',
        message: "Interval less than 100ms can cause performance issues",
      },
      {
        selector:
          'CallExpression[callee.name="setTimeout"][arguments.1.type="Literal"][arguments.1.value=0]',
        message: "Use requestAnimationFrame instead of setTimeout(0)",
      },
    ],
  },

  // Performance specific overrides
  overrides: [
    {
      files: ["src/hooks/**/*.js"],
      rules: {
        "react-hooks/exhaustive-deps": "error",
        "max-lines-per-function": ["warn", { max: 100 }],
      },
    },
    {
      files: ["src/utils/**/*.js"],
      rules: {
        complexity: ["warn", { max: 15 }],
      },
    },
    {
      files: ["**/*.test.js", "**/*.spec.js"],
      rules: {
        "max-lines-per-function": "off",
        complexity: "off",
      },
    },
  ],
};
