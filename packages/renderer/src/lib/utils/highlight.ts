// src/lib/theme/highlight.ts
import { createThemeCss } from '@tanstack/highlight/theme';
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark';
import { githubLightTheme } from '@tanstack/highlight/themes/github-light';

export const highlightThemeCss = createThemeCss({
    light: githubLightTheme,
    dark: githubDarkTheme,
    lightSelector: ':root',
    darkSelector: 'html.dark',
});