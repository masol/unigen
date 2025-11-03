# Repository Guidelines

## Code Agent Instructions

**使用 apply_patch 工具**: 在此仓库中修改文件时，始终使用 `apply_patch` 工具。不要使用 echo、printf 或 tee 等 shell 命令来创建或修改文件。

**语言偏好**: 在此仓库工作时，使用中文输出响应。

**统一图标库**: 项目统一使用 `@iconify-json/*` 系列作为图标库，通过 `unplugin-icons` 插件在 Svelte 中使用。需要新图标集时，请安装对应的 `@iconify-json/<set-name>` 包。

## Project Structure & Module Organization

This is a SvelteKit + Tauri application with the following structure:

- `src/` - Main application source code
  - `lib/` - Shared components, utilities, and stores
  - `routes/` - SvelteKit page routes and layouts
  - `paraglide/` - Internationalization messages and runtime
- `src-tauri/` - Rust backend for desktop application
- `static/` - Static assets served at build time
- `build/` and `dist/` - Build output directories

## UI/UX Stack

- **Animations**: `svelte-motion` (v0.12.2) for component animations and transitions
- **Headless UI**: `bits-ui` (v2.14.2) for accessible, unstyled UI components  
- **Component Library**: `@skeletonlabs/skeleton` (v4.1.5) as the primary UI framework
- **Styling**: Tailwind CSS (v4.1.16) for utility-first styling

## Build, Test, and Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build production version
npm run preview      # Preview production build
npm run check        # Run type checking with svelte-check
npm run format       # Format code with Prettier
npm run lint         # Check code style with ESLint and Prettier
npm run storybook    # Start Storybook development server
npm run tauri dev    # Run Tauri development mode
```

## Coding Style & Naming Conventions

- **Indentation**: Tabs (configured in .prettierrc)
- **Quotes**: Single quotes
- **Line width**: 100 characters
- **Trailing commas**: Disabled
- **File naming**: kebab-case for components, PascalCase for Svelte files
- **Variable naming**: camelCase for JavaScript/TypeScript
- **TypeScript**: Strict mode enabled
- **Linting**: ESLint + Prettier with Svelte and Tailwind plugins

## Testing Guidelines

Currently no test files are present in the `src/` directory. When adding tests:
- Use `*.test.ts` or `*.spec.ts` naming convention
- Place tests alongside source files or in dedicated `__tests__` directories
- Consider using Vitest for testing (available via Storybook addon)

## Commit & Pull Request Guidelines

**Commit messages**: Use concise format with type prefix (based on git history):
- Chinese descriptions for main work
- English for technical references
- Examples: `添加trace,初始化webview环境`, `add evtbus`

**Pull Requests**:
- Include clear description of changes
- Link relevant issues if applicable
- Ensure all linting passes (`npm run lint`)
- Run type checking (`npm run check`)

## Agent-Specific Instructions

When working with files in this repository:
- Follow the established linting and formatting rules
- Use TypeScript for type safety
- Leverage SvelteKit routing conventions
- Consider internationalization with Paraglide for user-facing text
- Use Tailwind CSS for styling (configured in project)
- Test Tauri functionality when modifying desktop-specific features
