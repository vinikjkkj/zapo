const base = require('@vinikjkkj/eslint-config')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const pluginImport = require('eslint-plugin-import')
const pluginN = require('eslint-plugin-n')

module.exports = [
    {
        ignores: [
            'dist/**',
            'packages/*/dist/**',
            'packages/*/binding.js',
            'packages/*/binding.d.ts',
            'packages/native/wasm/pkg/**',
            '**/___*',
            'wa-web/**',
            'wa-mob/**',
            'coverage/**',
            'spec/proto/index.js',
            'spec/proto/index.d.ts',
            'spec/proto/*.tmp.*',
            'spec/proto/WAProto.codegen.tmp.proto',
            'spec/proto/WAProto.types.codegen.tmp.js',
            'spec/abprops/**',
            'spec/mex/**',
            'spec/appstate/**',
            'spec/version/**'
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
                    './packages/voip/tsconfig.json',
                    './packages/voip-media/tsconfig.test.json',
                    './packages/fake-server/tsconfig.json',
                    './packages/mcp-server/tsconfig.json',
                    './packages/wam/tsconfig.json'
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
            'import/internal-regex': '^@zapo-js/',
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
                        './packages/voip/tsconfig.json',
                        './packages/voip-media/tsconfig.test.json',
                        './packages/fake-server/tsconfig.json',
                        './packages/mcp-server/tsconfig.json'
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
            'packages/mcp-server/src/**/*.ts',
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
                                'cross-module relative imports are forbidden – use a path alias (@module/*) instead'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: [
            'src/proto.ts',
            'src/mex.ts',
            'src/abprops-spec.ts',
            'src/appstate-spec.ts',
            'src/version-spec.ts',
            'src/__tests__/index.test.ts'
        ],
        rules: {
            'no-restricted-imports': 'off'
        }
    },
    // voip-media is installed on its own in a browser, where neither zapo-js nor
    // Node exists. The core runs on both hosts and only sees what they inject; web/
    // and node/ are the two hosts and never reach into each other. Tests run under
    // Node and may use anything.
    ...[
        {
            files: ['packages/voip-media/src/**/*.ts'],
            ignores: ['packages/voip-media/src/node/**', 'packages/voip-media/src/web/**'],
            forbidden: ['node:*', '@roamhq/wrtc', '**/node/**', '**/web/**'],
            message:
                'The voip-media core runs on every host: a host-specific piece lives in node/ or web/ and is injected.'
        },
        {
            files: ['packages/voip-media/src/web/**/*.ts'],
            ignores: [],
            forbidden: ['node:*', '@roamhq/wrtc', '**/node/**'],
            message: 'voip-media/web runs in the browser: nothing from Node or from node/.'
        },
        {
            files: ['packages/voip-media/src/node/**/*.ts'],
            ignores: [],
            forbidden: ['**/web/**'],
            message: 'voip-media/node is the Node host: the browser implementations stay in web/.'
        }
    ].map(({ files, ignores, forbidden, message }) => ({
        files,
        ignores: [...ignores, 'packages/voip-media/src/**/__tests__/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['zapo-js', 'zapo-js/*', '@zapo-js/*'],
                            message:
                                'voip-media runs in the browser without zapo-js. Keep the helper in this package.'
                        },
                        { group: forbidden, message }
                    ]
                }
            ]
        }
    })),
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
