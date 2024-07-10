import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'dist_legacy/**'],
    },
    {
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
            },
            sourceType: 'module',
            ecmaVersion: 2022,
            globals: {
                ...globals.es2021,
                ARGV: 'readonly',
                Debugger: 'readonly',
                GIRepositoryGType: 'readonly',
                globalThis: 'readonly',
                imports: 'readonly',
                Intl: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                window: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
            },
        },
        extends: [eslint.configs.recommended, eslintPluginPrettierRecommended, ...tseslint.configs.recommended],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        rules: {
            'prettier/prettier': 'error',
            camelcase: [
                'off',
                {
                    properties: 'never',
                },
            ],
            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                },
            ],
            /* Allow unused variables starting with underscores */
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-non-null-assertion': 'warn',
        },
        files: ['**/*.ts'],
    },
    {
      // disable type-aware linting on JS files
      files: ['**/*.js'],
      ...tseslint.configs.disableTypeChecked,
    },
);
