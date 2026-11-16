// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'worker/**', 'scripts/asset-icons/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/components/ui/icons.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              allowTypeImports: true,
              message:
                'Import Lucide icons from @/components/ui/icons. A runtime import of lucide-react-native pulls the full icon barrel into the Metro bundle.',
            },
          ],
        },
      ],
    },
  },
]);
