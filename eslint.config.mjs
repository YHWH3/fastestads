// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default defineConfig(
  {
    ignores: ['dist', '.astro', '.wrangler', 'coverage', 'node_modules'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // src/core is framework-agnostic: no server, UI, Astro, Preact, or zod imports.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'astro',
                'astro/*',
                'astro:*',
                'preact',
                'preact/*',
                'zod',
                '@server/*',
                '@ui/*',
                '**/server/**',
                '**/ui/**',
              ],
              message:
                'src/core must stay framework-agnostic: no src/server, src/ui, Astro, Preact, or zod imports.',
            },
          ],
        },
      ],
    },
  },
);
