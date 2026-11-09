import base from '@cineseat/eslint-config';

export default [
  ...base,
  {
    // Client Components are added from phase 1 onward; allow the directive.
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];
