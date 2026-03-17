const base = require('@vinikjkkj/eslint-config')

module.exports = [
    {
        ignores: [
            'dist/**',
            'deobfuscated/**',
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
    }
]
