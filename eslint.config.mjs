import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next. Use "**/" prefixes so these also
    // match nested checkouts (e.g. .claude/worktrees/*/.next) — a bare ".next/**"
    // is gitignore-anchored to the repo root and won't catch those.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Nested git worktrees are separate checkouts with their own lint runs.
    ".claude/worktrees/**",
  ]),
  {
    // Native alert()/confirm() block the thread and look out of place in the PWA:
    // use toast.* from sonner and useConfirm() from components/confirm_provider.
    rules: {
      "no-alert": "error",
      // Icon-only buttons need an aria-label (see the `a11y` namespace in messages/*.json).
      "jsx-a11y/control-has-associated-label": ["error", {
        depth: 3,
        controlComponents: ["Button", "PopoverTrigger", "DropdownMenuTrigger"],
        ignoreElements: ["audio", "canvas", "embed", "input", "option", "textarea", "tr", "video"],
        ignoreRoles: ["grid", "listbox", "menu", "menubar", "radiogroup", "row", "tablist", "toolbar", "tree", "treegrid"],
      }],
    },
  },
]);

export default eslintConfig;
