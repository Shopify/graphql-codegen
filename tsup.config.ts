import path from 'node:path';
import fs from 'node:fs/promises';
import {defineConfig} from 'tsup';

const commonConfig = {
  minify: false,
  bundle: false,
  splitting: true,
  treeshake: true,
  sourcemap: true,
};

export default defineConfig([
  {
    ...commonConfig,
    format: 'esm',
    // Force bundling types in files here so that they can later be
    // bundled in GraphQL client packages to avoid having codegen as
    // a direct dependency. Otherwise, TSUP fails to bundle them later.
    dts: {entry: ['src/index.ts', 'src/patch.ts']},
    entry: ['src/**/*.ts'],
    outDir: 'dist/esm',
  },
  {
    ...commonConfig,
    format: 'cjs',
    dts: false,
    entry: ['src/**/*.ts'],
    outDir: 'dist/cjs',
    plugins: [
      {
        // Replace .js with .cjs in require() calls:
        name: 'replace-require-extension',
        async buildEnd({writtenFiles}) {
          await Promise.all(
            writtenFiles
              .filter(({name}) => name.endsWith('.cjs'))
              .map(async ({name}) => {
                const filepath = path.resolve('.', name);
                const contents = await fs.readFile(filepath, 'utf8');

                await fs.writeFile(
                  filepath,
                  contents.replace(/\.js'\);/g, ".cjs');"),
                );
              }),
          );
        },
      },
    ],
  },
]);
