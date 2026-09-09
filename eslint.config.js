import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Vitest asymmetric matchers (`expect.any`, `arrayContaining`, etc.) are
      // intentionally typed as `any` when embedded in otherwise typed objects.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  { ignores: ['dist/**', 'coverage/**'] },
);
