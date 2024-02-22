// see https://www.robertcooper.me/using-eslint-and-prettier-in-a-typescript-project
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    plugins: ['simple-import-sort'],
    rules: {
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        quotes: [2, 'single', { avoidEscape: true }],
        'no-debugger': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-misused-new': 'off',
        '@typescript-eslint/triple-slash-reference': 'off',
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            },
        ],
        // For Gjs
        camelcase: 'off',
        '@typescript-eslint/camelcase': 'off',
    },
};