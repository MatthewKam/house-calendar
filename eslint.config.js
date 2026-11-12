import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// What `npm run lint` checks: likely mistakes, not style (TypeScript checks the types, and formatting is
// left to the formatter).
export default tseslint.config(
  { ignores: ['web/dist/', 'data/', 'node_modules/', 'web/public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A name starting with _ is left unused on purpose (a value taken out of an object, say).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      // Worth knowing about, not worth failing over.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  { files: ['**/*.test.ts', 'server/testing.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  { files: ['server/**/*.ts', 'shared/**/*.ts', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  {
    // The two classic hooks rules. The plugin's newer ones are written for the React Compiler, which
    // this app doesn't use.
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
