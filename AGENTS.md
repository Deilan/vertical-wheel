# Project instructions

Build a client-only React + TypeScript + Vite web app.

UI language: Russian.

Do not add backend code.

Do not add Angular, Next.js, Redux, Zustand, Tailwind, or a UI kit unless explicitly requested.

Use CSS Modules.

Keep domain logic in pure TypeScript functions where possible.

Add unit tests for pure functions.

Run before finishing each task:
- npm run typecheck
- npm run test:run
- npm run build

Prioritize mobile iOS/Android UX.
Desktop is secondary.

Read docs/SPEC.md before implementation.

## Modern stack and coding style

Use current stable versions available from the official Vite React TypeScript template.

Runtime and tooling:
- Use Node.js version compatible with current Vite requirements.
- Use React with modern function components and hooks.
- Use TypeScript in strict mode.
- Use ES modules only.
- Do not use CommonJS.
- Do not use legacy React class components.
- Do not use deprecated React APIs.
- Do not add polyfills for old browsers unless explicitly needed.
- Target modern evergreen browsers, primarily current iOS Safari and Android Chrome.

TypeScript / JavaScript style:
- Prefer explicit domain types.
- Prefer pure functions for domain logic.
- Use discriminated unions where useful.
- Use `const` by default.
- Avoid `any`; use `unknown` with validation where needed.
- Avoid unnecessary classes.
- Avoid global mutable state.
- Avoid large utility libraries for simple tasks.
- Use native browser APIs when they are reliable enough for the target browsers.

React style:
- Keep components small and focused.
- Keep side effects in `useEffect` only when needed.
- Use controlled inputs in the editor.
- Avoid derived state duplication unless there is a clear reason.
- Keep animation/physics logic separated from visual components where possible.

CSS:
- Use CSS Modules.
- Use modern CSS: flex, grid, custom properties, clamp, dvh/svh where appropriate.
- Mobile-first layout.
- Do not use Tailwind, Bootstrap, Material UI, shadcn/ui, or other UI kits.

Quality:
- Code must pass:
  - npm run typecheck
  - npm run test:run
  - npm run build