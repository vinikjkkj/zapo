const base = require('@vinikjkkj/eslint-config')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const pluginImport = require('eslint-plugin-import')
const pluginN = require('eslint-plugin-n')

module.exports = [
    {
        ignores: [
            'dist/**',
            'packages/*/dist/**',
            'wa-web/**',
            'wa-mob/**',
            'coverage/**',
            'proto/index.js',
            'proto/index.d.ts',
            'proto/*.tmp.*',
            'proto/WAProto.codegen.tmp.proto',
            'proto/WAProto.types.codegen.tmp.js'
        ]
    },
    ...base,
    {
        files: ['scripts/**/*.{ts,js}'],
        languageOptions: {
            parserOptions: {
                project: false
            }
        }
    },
    {
        files: ['src/**/*.ts', 'examples/**/*.ts', 'bench/**/*.ts'],
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: ['./tsconfig.json', './bench/tsconfig.json', './examples/tsconfig.json']
            }
        }
    },
    {
        files: ['packages/*/src/**/*.ts', 'packages/*/bench/**/*.ts'],
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: [
                    './packages/store-mysql/tsconfig.json',
                    './packages/store-sqlite/tsconfig.json',
                    './packages/store-postgres/tsconfig.json',
                    './packages/store-redis/tsconfig.json',
                    './packages/store-mongo/tsconfig.json',
                    './packages/media-utils/tsconfig.json',
                    './packages/fake-server/tsconfig.json'
                ]
            }
        }
    },
    {
        files: ['src/**/*.ts', 'packages/**/src/**/*.ts', 'examples/**/*.ts', 'bench/**/*.ts'],
        plugins: {
            '@typescript-eslint': tsPlugin,
            import: pluginImport,
            n: pluginN
        },
        settings: {
            'import/parsers': {
                '@typescript-eslint/parser': ['.ts', '.tsx']
            },
            'import/resolver': {
                node: {
                    extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs']
                },
                typescript: {
                    alwaysTryTypes: true,
                    noWarnOnMultipleProjects: true,
                    project: [
                        './tsconfig.json',
                        './bench/tsconfig.json',
                        './examples/tsconfig.json',
                        './packages/store-mysql/tsconfig.json',
                        './packages/store-sqlite/tsconfig.json',
                        './packages/store-postgres/tsconfig.json',
                        './packages/store-redis/tsconfig.json',
                        './packages/store-mongo/tsconfig.json',
                        './packages/media-utils/tsconfig.json',
                        './packages/fake-server/tsconfig.json'
                    ]
                }
            }
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'inline-type-imports'
                }
            ],
            'import/no-duplicates': ['error', { 'prefer-inline': true }],
            'sort-imports': [
                'error',
                {
                    ignoreDeclarationSort: true,
                    ignoreCase: true,
                    ignoreMemberSort: false,
                    memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
                }
            ],
            'n/prefer-node-protocol': 'error',
            'n/no-extraneous-import': 'error',
            'import/no-unresolved': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/require-await': 'error'
        }
    },
    {
        files: [
            'src/store/**/*.ts',
            'packages/store-*/**/*.ts',
            'src/**/__tests__/**/*.ts',
            'packages/**/__tests__/**/*.ts',
            'bench/**/*.ts'
        ],
        rules: {
            '@typescript-eslint/require-await': 'off'
        }
    },
    {
        files: ['src/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['..', '../*', '../**'],
                            message:
                                'cross-module relative imports are forbidden — use a path alias (@module/*) instead'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/proto.ts', 'src/__tests__/index.test.ts'],
        rules: {
            'no-restricted-imports': 'off'
        }
    },
    {
        files: [
            'packages/fake-server/src/infra/**/*.ts',
            'packages/fake-server/src/protocol/**/*.ts',
            'packages/fake-server/src/state/**/*.ts',
            'packages/fake-server/src/api/**/*.ts'
        ],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['zapo-js', 'zapo-js/*'],
                            message:
                                'fake-server Layer 2/3 must not import zapo-js. Add the primitive to src/transport/ and import from there.'
                        }
                    ]
                }
            ]
        }
    },
    {
        // Cross-check tests intentionally drive the fake server side-by-side
        // with the real zapo-js side to validate that they interoperate.
        // The firewall is relaxed here because crossing it is the entire
        // purpose of these tests.
        files: [
            'packages/fake-server/src/**/*.cross-check.test.ts',
            'packages/fake-server/src/**/__tests__/helpers/**/*.ts'
        ],
        rules: {
            'no-restricted-imports': 'off'
        }
    }
]
