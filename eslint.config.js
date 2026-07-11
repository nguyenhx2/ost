import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // `.claude/` holds agent worktrees (full repo copies), which otherwise give
    // every file a second TSConfigRootDir candidate and fail parsing.
    ignores: [
      "dist/",
      "node_modules/",
      "src-tauri/target/",
      "src-tauri/gen/",
      ".claude/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],
    },
  },
  {
    // e2e (WebdriverIO + tauri-driver, TASK-022): Mocha + wdio globals, and the
    // diagnostic console output that reports the REAL run outcomes. These specs
    // run against the release binary, never in the jsdom unit environment.
    files: ["e2e/**/*.ts"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        beforeEach: "readonly",
        after: "readonly",
        afterEach: "readonly",
        expect: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
);
