import simpleImportSort from 'eslint-plugin-simple-import-sort';

import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
// see https://www.robertcooper.me/using-eslint-and-prettier-in-a-typescript-project

export default tseslint.config({
  languageOptions: { parser: tseslint.parser, parserOptions: { project: true } },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    'simple-import-sort': simpleImportSort,
  },
  extends: [eslint.configs.recommended, ...tseslint.configs.recommended, eslintPluginPrettierRecommended],
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    quotes: [2, 'single', { avoidEscape: true }],
    'no-debugger': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-misused-new': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    // For Gjs
    camelcase: 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
  },
  files: ['**/*.ts', '**/*.tsx'],
});
