import {pluckConfig, preset, type PresetConfig} from '../../src';

export default {
  projects: {
    default: {
      schema: '../../tests/fixtures/storefront.schema.json',
      documents: ['*.{js,ts,jsx,tsx}'],
      extensions: {
        codegen: {
          pluckConfig,
          generates: {
            'storefrontapi.generated.d.ts': {
              preset,
              presetConfig: {
                importTypes: {
                  namespace: 'StorefrontAPI',
                  from: '../../tests/fixtures/storefront-api-types.d.ts',
                },
                interfaceExtension: ({queryType, mutationType}) => `
                  declare module 'examples/client' {
                    interface MyAPIQueries extends ${queryType} {}
                    interface MyAPIMutations extends ${mutationType} {}
                  }
                `,
              } satisfies PresetConfig,
            },
          },
        },
      },
    },
  },
};
