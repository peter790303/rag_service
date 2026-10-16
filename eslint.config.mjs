import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/newline-after-import': ['error', { count: 1, considerComments: true }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'lines-between-class-members': ['error', 'always'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: 'if', next: '*' },
      ],
    },
  },
  {
    files: ['src/Application/Chunks/**/*.ts', 'src/Domain/Chunk/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ForStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'ForOfStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'ForInStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
      ],
    },
  },
  eslintConfigPrettier,
)
