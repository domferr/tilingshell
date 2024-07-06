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
            /* Allow unused variables starting with underscores */
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    varsIgnorePattern: '(^unused|_$)',
                    argsIgnorePattern: '^(unused|_)',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],
            "no-shadow": "off",
            "@typescript-eslint/no-shadow": "error",
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'array-bracket-newline': ['error', 'consistent'],
            'array-bracket-spacing': ['error', 'never'],
            'array-callback-return': 'error',
            'arrow-spacing': 'error',
            'block-scoped-var': 'error',
            'block-spacing': 'error',
            'brace-style': 'error',
            camelcase: [
                'off',
                {
                    properties: 'never',
                },
            ],
            'comma-spacing': [
                'error',
                {
                    before: false,
                    after: true,
                },
            ],
            'comma-style': ['error', 'last'],
            'computed-property-spacing': 'error',
            curly: ['error', 'multi-or-nest', 'consistent'],
            'dot-location': ['error', 'property'],
            'eol-last': 'error',
            eqeqeq: 'error',
            'func-call-spacing': 'error',
            'func-name-matching': 'error',
            'func-style': [
                'error',
                'declaration',
                {
                    allowArrowFunctions: true,
                },
            ],
            'key-spacing': [
                'error',
                {
                    beforeColon: false,
                    afterColon: true,
                },
            ],
            'keyword-spacing': [
                'error',
                {
                    before: true,
                    after: true,
                },
            ],
            'linebreak-style': ['error', 'unix'],
            'max-nested-callbacks': 'error',
            'max-statements-per-line': 'error',
            'new-parens': 'error',
            'no-array-constructor': 'error',
            'no-await-in-loop': 'error',
            'no-caller': 'error',
            'no-constant-condition': [
                'error',
                {
                    checkLoops: false,
                },
            ],
            'no-div-regex': 'error',
            'no-empty': [
                'error',
                {
                    allowEmptyCatch: true,
                },
            ],
            'no-extra-bind': 'error',
            'no-implicit-coercion': [
                'error',
                {
                    allow: ['!!'],
                },
            ],
            'no-invalid-this': 'error',
            'no-iterator': 'error',
            'no-label-var': 'error',
            'no-lonely-if': 'error',
            'no-loop-func': 'error',
            'no-new-object': 'error',
            'no-new-wrappers': 'error',
            'no-octal-escape': 'error',
            'no-proto': 'error',
            'no-prototype-builtins': 'off',
            'no-restricted-globals': ['error', 'window'],
            'no-restricted-properties': [
                'error',
                {
                    object: 'Lang',
                    property: 'copyProperties',
                    message: 'Use Object.assign()',
                },
                {
                    object: 'Lang',
                    property: 'bind',
                    message: 'Use arrow notation or Function.prototype.bind()',
                },
                {
                    object: 'Lang',
                    property: 'Class',
                    message: 'Use ES6 classes',
                },
            ],
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'MethodDefinition[key.name="_init"] > FunctionExpression[params.length=1] > BlockStatement[body.length=1] CallExpression[arguments.length=1][callee.object.type="Super"][callee.property.name="_init"] > Identifier:first-child',
                    message:
                        '_init() that only calls super._init() is unnecessary',
                },
                {
                    selector:
                        'MethodDefinition[key.name="_init"] > FunctionExpression[params.length=0] > BlockStatement[body.length=1] CallExpression[arguments.length=0][callee.object.type="Super"][callee.property.name="_init"]',
                    message:
                        '_init() that only calls super._init() is unnecessary',
                },
                {
                    selector:
                        'BinaryExpression[operator="instanceof"][right.name="Array"]',
                    message: 'Use Array.isArray()',
                },
            ],
            'no-return-assign': 'error',
            'no-return-await': 'error',
            'no-self-compare': 'error',
            'no-shadow-restricted-names': 'error',
            'no-spaced-func': 'error',
            'no-tabs': 'error',
            'no-template-curly-in-string': 'error',
            'no-throw-literal': 'error',
            'no-trailing-spaces': 'error',
            'no-undef-init': 'error',
            'no-unneeded-ternary': 'error',
            'no-unused-expressions': 'error',
            'no-useless-call': 'error',
            'no-useless-computed-key': 'error',
            'no-useless-concat': 'error',
            'no-useless-constructor': 'error',
            'no-useless-rename': 'error',
            'no-useless-return': 'error',
            'no-whitespace-before-property': 'error',
            'no-with': 'error',
            'object-curly-newline': [
                'error',
                {
                    consistent: true,
                    multiline: true,
                },
            ],
            'object-shorthand': 'error',
            'operator-assignment': 'error',
            'operator-linebreak': 'error',
            'padded-blocks': ['error', 'never'],
            'prefer-numeric-literals': 'error',
            'prefer-promise-reject-errors': 'error',
            'prefer-rest-params': 'error',
            'prefer-spread': 'error',
            'prefer-template': 'error',
            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                },
            ],
            'require-await': 'error',
            'rest-spread-spacing': 'error',
            semi: ['error', 'always'],
            'semi-spacing': [
                'error',
                {
                    before: false,
                    after: true,
                },
            ],
            'semi-style': 'error',
            'space-before-blocks': 'error',
            'space-before-function-paren': [
                'error',
                {
                    named: 'never',
                    anonymous: 'always',
                    asyncArrow: 'always',
                },
            ],
            'space-in-parens': 'error',
            'space-infix-ops': [
                'error',
                {
                    int32Hint: false,
                },
            ],
            'space-unary-ops': 'error',
            'spaced-comment': 'error',
            'switch-colon-spacing': 'error',
            'symbol-description': 'error',
            'template-curly-spacing': 'error',
            'template-tag-spacing': 'error',
            'unicode-bom': 'error',
            'wrap-iife': ['error', 'inside'],
            'yield-star-spacing': 'error',
            yoda: 'error',
        },
        files: ['**/*.ts'],
    },
    {
      // disable type-aware linting on JS files
      files: ['**/*.js'],
      ...tseslint.configs.disableTypeChecked,
    },
);
