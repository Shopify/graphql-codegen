import type {Types} from '@graphql-codegen/plugin-helpers';
import * as addPlugin from '@graphql-codegen/add';
import * as typescriptPlugin from '@graphql-codegen/typescript';
import * as typescriptOperationPlugin from '@graphql-codegen/typescript-operations';
import {processSources} from './sources.js';
import {
  plugin as dtsPlugin,
  GENERATED_MUTATION_INTERFACE_NAME,
  GENERATED_QUERY_INTERFACE_NAME,
} from './plugin.js';

export type PresetConfig = {
  /**
   * Whether types should be imported or generated inline.
   */
  importTypes?: {
    /**
     * Name for the variable that contains the imported types.
     * @example 'StorefrontAPI'
     */
    namespace: string;
    /**
     * Module to import the types from.
     * @example '@shopify/hydrogen/storefront-api-types'
     */
    from: string;
  };
  /**
   * Whether to skip adding `__typename` to generated operation types.
   * @default true
   */
  skipTypenameInOperations?: boolean;
  /**
   * Override the default interface extension.
   * @example ({queryType}) => `declare module 'my-api' { interface Queries extends ${queryType} {} }`
   */
  interfaceExtension: (options: {
    queryType: string;
    mutationType: string;
  }) => string;
};

const ERROR_PREFIX = '[@shopify/graphql-codegen]';

export const preset: Types.OutputPreset<PresetConfig> = {
  [Symbol.for('name')]: '@shopify/graphql-codegen',
  buildGeneratesSection: (options) => {
    if (!options.baseOutputDir.endsWith('.ts')) {
      throw new Error(
        ERROR_PREFIX + ' target output should be a .ts or a .d.ts file.',
      );
    }

    if (
      options.plugins?.length > 0 &&
      Object.keys(options.plugins).some((p) => p.startsWith('typescript'))
    ) {
      throw new Error(
        ERROR_PREFIX +
          ' providing additional typescript-based `plugins` leads to duplicated generated types',
      );
    }

    const isDts = options.baseOutputDir.endsWith('.d.ts');
    const sourcesWithOperations = processSources(options.documents);
    const sources = sourcesWithOperations.map(({source}) => source);

    const namespacedImportName = options.presetConfig.importTypes?.namespace;
    const importTypesFrom = options.presetConfig.importTypes?.from;
    const importTypes = !!namespacedImportName && !!importTypesFrom;

    const interfaceExtensionCode = options.presetConfig.interfaceExtension({
      queryType: GENERATED_QUERY_INTERFACE_NAME,
      mutationType: GENERATED_MUTATION_INTERFACE_NAME,
    });

    const pluginMap = {
      ...options.pluginMap,
      [`add`]: addPlugin,
      [`typescript`]: typescriptPlugin,
      [`typescript-operations`]: typescriptOperationPlugin,
      [`gen-dts`]: {plugin: dtsPlugin},
    };

    const plugins: Array<Types.ConfiguredPlugin> = [
      // 1. Disable eslint for the generated file
      {
        [`add`]: {
          content: `/* eslint-disable eslint-comments/disable-enable-pair */\n/* eslint-disable eslint-comments/no-unlimited-disable */\n/* eslint-disable */`,
        },
      },
      // 2. Import all the generated API types or generate all the types from the schema.
      importTypes
        ? {
            [`add`]: {
              content: `import${
                isDts ? ' type ' : ' '
              }* as ${namespacedImportName} from '${importTypesFrom}';\n`,
            },
          }
        : {
            [`typescript`]: {
              enumsAsTypes: isDts,
              useTypeImports: isDts,
              useImplementingTypes: true,
            },
          },
      // 3. Generate the operations (i.e. queries, mutations, and fragments types)
      {
        [`typescript-operations`]: {
          useTypeImports: isDts, // Use `import type` instead of `import`
          preResolveTypes: false, // Use Pick<...> instead of primitives
          mergeFragmentTypes: true, // Merge equal fragment interfaces. Avoids adding `| {}` to Metaobject
          skipTypename: options.presetConfig.skipTypenameInOperations ?? true, // Skip __typename fields
          namespacedImportName: importTypes ? namespacedImportName : undefined,
        },
      },
      // 4.  Augment query/mutation interfaces with the generated operations
      {[`gen-dts`]: {sourcesWithOperations, interfaceExtensionCode}},
      // 5. Custom plugins from the user
      ...options.plugins,
    ];

    return [
      {
        filename: options.baseOutputDir,
        plugins,
        pluginMap,
        schema: options.schema,
        config: {
          // For the TS plugin:
          defaultScalarType: 'unknown',
          // Allow overwriting defaults:
          ...options.config,
        },
        documents: sources,
        documentTransforms: options.documentTransforms,
      },
    ];
  },
};
