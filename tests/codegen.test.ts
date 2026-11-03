import path from 'node:path';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import ts from 'typescript';
import {describe, it, expect} from 'vitest';
import {executeCodegen} from '@graphql-codegen/cli';
import {preset, pluckConfig} from '../src/index.js';
import {
  GENERATED_MUTATION_INTERFACE_NAME,
  GENERATED_QUERY_INTERFACE_NAME,
} from '../src/plugin.js';

const sfapiDefaultInterfaceExtensionCode = `
declare module '@shopify/hydrogen' {
  interface StorefrontQueries extends ${GENERATED_QUERY_INTERFACE_NAME} {}
  interface StorefrontMutations extends ${GENERATED_MUTATION_INTERFACE_NAME} {}
}`;

describe('Shopify GraphQL Codegen', async () => {
  const getFixturePath = (fixture: string) =>
    path.join(__dirname, 'fixtures', fixture);

  const getCodegenOptions = (fixture: string, output = 'out.d.ts') => ({
    pluckConfig: pluckConfig as any,
    generates: {
      [output]: {
        preset,
        schema: getFixturePath('storefront.schema.json'),
        documents: [getFixturePath(fixture)],
        presetConfig: {
          interfaceExtension: () => sfapiDefaultInterfaceExtensionCode,
          importTypes: {
            namespace: 'StorefrontAPI',
            from: './fixtures/storefront-api-types',
          },
        },
      },
    },
  });

  const runCodegen = async (config: Parameters<typeof executeCodegen>[0]) => {
    const {result, error} = await executeCodegen(config);

    if (error) throw error;

    return result;
  };

  it.each([
    {scalars: undefined, input: 'number', output: 'string'},
    {scalars: undefined, input: 'number', output: 'string', nested: true},
    {
      scalars: undefined,
      input: 'number',
      output: 'string',
      packageImport: true,
    },
    {scalars: 'module', input: 'number', output: 'string'},
    {scalars: undefined, input: 'unknown', output: 'unknown', inline: true},
    {scalars: {URL: 'boolean'}, input: 'boolean', output: 'boolean'},
    {
      scalars: {URL: {input: 'string', output: 'Date'}},
      input: 'string',
      output: 'Date',
    },
  ])(
    'preserves scalar input/output types and overrides: $input/$output',
    async ({
      scalars,
      input,
      output: outputType,
      inline,
      nested,
      packageImport,
    }) => {
      const directory = mkdtempSync(
        path.join(tmpdir(), 'shopify-codegen-scalars-'),
      );
      try {
        const documents = path.join(directory, 'query.graphql');
        const outputDirectory = nested
          ? path.join(directory, 'generated', 'operations')
          : directory;
        mkdirSync(outputDirectory, {recursive: true});
        const output = path.join(outputDirectory, 'generated.d.ts');
        const consumer = path.join(outputDirectory, 'consumer.ts');
        writeFileSync(
          documents,
          'query ScalarProbe($url: URL!, $mode: Mode!) { echo(url: $url, mode: $mode) id mode }',
        );
        const schema = path.join(directory, 'schema.graphql');
        writeFileSync(
          schema,
          'scalar URL\nenum Mode { FIRST SECOND }\ntype Query { echo(url: URL!, mode: Mode!): URL! id: ID! mode: Mode! }',
        );
        writeFileSync(
          path.join(directory, 'schema-types.ts'),
          `export type Scalars = {URL: {input: number; output: string}; ID: {input: string; output: string}}; export type Mode = 'FIRST' | 'SECOND'; export type URL = Scalars['URL']; export type ID = Scalars['ID']; export type String = {input: string; output: string}; export type Boolean = {input: boolean; output: boolean};`,
        );
        const options = getCodegenOptions('simple-operations.ts', output);
        const generation = options.generates[output];
        generation.documents = [documents];
        generation.schema = schema;
        Object.assign(generation, {
          config: {
            scalars:
              scalars === 'module'
                ? path.join(directory, 'schema-types')
                : scalars,
          },
        });
        generation.presetConfig.importTypes.from = path.relative(
          process.cwd(),
          path.join(directory, 'schema-types'),
        );
        generation.presetConfig.interfaceExtension = () => '';
        if (packageImport) {
          const packageDirectory = path.join(
            directory,
            'node_modules',
            'scalar-fixture',
          );
          mkdirSync(packageDirectory, {recursive: true});
          copyFileSync(
            path.join(directory, 'schema-types.ts'),
            path.join(packageDirectory, 'schema-types.d.ts'),
          );
          writeFileSync(
            path.join(packageDirectory, 'package.json'),
            JSON.stringify({
              name: 'scalar-fixture',
              exports: {'./schema-types': './schema-types.d.ts'},
            }),
          );
          generation.presetConfig.importTypes.from =
            '~scalar-fixture/schema-types';
        }
        if (inline) delete (generation.presetConfig as any).importTypes;
        const [generated] = await runCodegen(options);
        writeFileSync(output, generated.content);
        writeFileSync(
          consumer,
          `import type {ScalarProbeQuery, ScalarProbeQueryVariables} from './generated';
         declare const result: ScalarProbeQuery;
         const url: ${outputType} = result.echo;
         const id: string = result.id;
         const mode: 'FIRST' | 'SECOND' = result.mode;
         declare const input: ${input};
         const variables: ScalarProbeQueryVariables = {url: input, mode: 'FIRST'};`,
        );
        const program = ts.createProgram([consumer], {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          types: [],
        });
        expect(
          ts
            .getPreEmitDiagnostics(program)
            .map((diagnostic) =>
              ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            ),
        ).toEqual([]);
      } finally {
        rmSync(directory, {recursive: true, force: true});
      }
    },
  );

  it('requires .ts or .d.ts extension', async () => {
    await expect(
      runCodegen(getCodegenOptions('simple-operations.ts', 'out')),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AggregateError: [@shopify/graphql-codegen] target output should be a .ts or a .d.ts file.]`,
    );
  });

  it('prevents duplicate operations', async () => {
    await expect(
      runCodegen(getCodegenOptions('duplicate-operations.ts')),
    ).rejects.toThrowError(/Not all operations have an unique name: layout/i);
  });

  it('uses type imports for .ts files', async () => {
    const result = await runCodegen(
      getCodegenOptions('simple-operations.ts', 'out.ts'),
    );

    expect(result).toHaveLength(1);

    const generatedCode = result.find(
      (file) => file.filename === 'out.ts',
    )!.content;

    // Imports SFAPI
    expect(generatedCode).toMatch(
      `import type * as StorefrontAPI from './fixtures/storefront-api-types';`,
    );
  });

  it('generates schema types inline when importTypes is omitted', async () => {
    const options = getCodegenOptions('simple-operations.ts');
    delete (options.generates['out.d.ts'].presetConfig as any).importTypes;

    const result = await runCodegen(options);
    const generatedCode = result[0].content;

    expect(generatedCode).toMatch(/export (?:type|interface) Shop/);
    expect(generatedCode).not.toContain('StorefrontAPI');
  });

  it('includes ESLint comments, imported schema types, generated operations and augments interfaces', async () => {
    const result = await runCodegen(getCodegenOptions('simple-operations.ts'));

    expect(result).toHaveLength(1);

    const generatedCode = result.find(
      (file) => file.filename === 'out.d.ts',
    )!.content;

    // Disables ESLint
    expect(generatedCode).toMatch('/* eslint-disable */');

    // Imports SFAPI
    expect(generatedCode).toMatch(
      `import type * as StorefrontAPI from './fixtures/storefront-api-types';`,
    );

    // Uses imported schema input types
    expect(generatedCode).toMatch(`StorefrontAPI.CartInput`);

    // Generates query and mutation types
    expect(generatedCode).toMatch(
      /interface GeneratedQueryTypes \{\s+"#graphql/,
    );
    expect(generatedCode).toMatch(
      /interface GeneratedMutationTypes \{\s+"#graphql/,
    );

    // Augments query/mutation types
    expect(generatedCode).toMatch(sfapiDefaultInterfaceExtensionCode);

    expect(generatedCode).toMatchInlineSnapshot(`
      "/* eslint-disable eslint-comments/disable-enable-pair */
      /* eslint-disable eslint-comments/no-unlimited-disable */
      /* eslint-disable */
      /** Internal type. DO NOT USE DIRECTLY. */
      type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
      /** Internal type. DO NOT USE DIRECTLY. */
      export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
      import type * as StorefrontAPI from './fixtures/storefront-api-types';

      export type LayoutQueryVariables = Exact<{ [key: string]: never; }>;


      export type LayoutQuery = { shop: { name: import("./fixtures/storefront-api-types").Scalars["String"]['output'], description: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null } };

      export type CartCreateMutationVariables = Exact<{
        input: StorefrontAPI.CartInput;
      }>;


      export type CartCreateMutation = { cartCreate: { cart: { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'] } | null } | null };

      interface GeneratedQueryTypes {
        "#graphql\\n  query layout {\\n    shop {\\n      name\\n      description\\n    }\\n  }\\n": {return: LayoutQuery, variables: LayoutQueryVariables},
      }

      interface GeneratedMutationTypes {
        "#graphql\\n  mutation cartCreate($input: CartInput!) {\\n    cartCreate(input: $input) {\\n      cart {\\n        id\\n      }\\n    }\\n  }\\n": {return: CartCreateMutation, variables: CartCreateMutationVariables},
      }

      declare module '@shopify/hydrogen' {
        interface StorefrontQueries extends GeneratedQueryTypes {}
        interface StorefrontMutations extends GeneratedMutationTypes {}
      }
      "
    `);
  });

  it('generates types for complex queries with fragments, directives and variables', async () => {
    const result = await runCodegen(getCodegenOptions('complex-operations.ts'));

    expect(result).toHaveLength(1);

    const generatedCode = result.find(
      (file) => file.filename === 'out.d.ts',
    )!.content;

    expect(generatedCode).toMatchInlineSnapshot(`
      "/* eslint-disable eslint-comments/disable-enable-pair */
      /* eslint-disable eslint-comments/no-unlimited-disable */
      /* eslint-disable */
      /** Internal type. DO NOT USE DIRECTLY. */
      type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
      /** Internal type. DO NOT USE DIRECTLY. */
      export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
      import type * as StorefrontAPI from './fixtures/storefront-api-types';

      type Media_ExternalVideo_Fragment = (
        { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], embedUrl: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], host: StorefrontAPI.MediaHost, mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
        & { __typename: 'ExternalVideo' }
      );

      type Media_MediaImage_Fragment = (
        { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, image: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], width: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null, height: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null } | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
        & { __typename: 'MediaImage' }
      );

      type Media_Model3d_Video_Fragment = (
        { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, sources: Array<{ mimeType: import("./fixtures/storefront-api-types").Scalars["String"]['output'], url: import("./fixtures/storefront-api-types").Scalars["String"]['output'] }>, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
        & { __typename: 'Model3d' | 'Video' }
      );

      export type MediaFragment =
        | Media_ExternalVideo_Fragment
        | Media_MediaImage_Fragment
        | Media_Model3d_Video_Fragment
      ;

      export type CollectionContentFragment = { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], handle: import("./fixtures/storefront-api-types").Scalars["String"]['output'], title: import("./fixtures/storefront-api-types").Scalars["String"]['output'], descriptionHtml: import("./fixtures/storefront-api-types").Scalars["HTML"]['output'], heading: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, byline: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, cta: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, spread: { reference:
            | (
              { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, image: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], width: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null, height: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null } | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
              & { __typename: 'MediaImage' }
            )
            | (
              { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, sources: Array<{ mimeType: import("./fixtures/storefront-api-types").Scalars["String"]['output'], url: import("./fixtures/storefront-api-types").Scalars["String"]['output'] }>, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
              & { __typename: 'Video' }
            )
           | null } | null, spreadSecondary: { reference:
            | (
              { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, image: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], width: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null, height: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null } | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
              & { __typename: 'MediaImage' }
            )
            | (
              { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, sources: Array<{ mimeType: import("./fixtures/storefront-api-types").Scalars["String"]['output'], url: import("./fixtures/storefront-api-types").Scalars["String"]['output'] }>, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
              & { __typename: 'Video' }
            )
           | null } | null };

      export type CollectionContentTestQueryVariables = Exact<{
        handle?: import("./fixtures/storefront-api-types").Scalars["String"]['input'] | null | undefined;
        country?: StorefrontAPI.CountryCode | null | undefined;
        language?: StorefrontAPI.LanguageCode | null | undefined;
      }>;


      export type CollectionContentTestQuery = { hero: { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], handle: import("./fixtures/storefront-api-types").Scalars["String"]['output'], title: import("./fixtures/storefront-api-types").Scalars["String"]['output'], descriptionHtml: import("./fixtures/storefront-api-types").Scalars["HTML"]['output'], heading: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, byline: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, cta: { value: import("./fixtures/storefront-api-types").Scalars["String"]['output'] } | null, spread: { reference:
              | (
                { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, image: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], width: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null, height: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null } | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
                & { __typename: 'MediaImage' }
              )
              | (
                { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, sources: Array<{ mimeType: import("./fixtures/storefront-api-types").Scalars["String"]['output'], url: import("./fixtures/storefront-api-types").Scalars["String"]['output'] }>, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
                & { __typename: 'Video' }
              )
             | null } | null, spreadSecondary: { reference:
              | (
                { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, image: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'], width: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null, height: import("./fixtures/storefront-api-types").Scalars["Int"]['output'] | null } | null, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
                & { __typename: 'MediaImage' }
              )
              | (
                { id: import("./fixtures/storefront-api-types").Scalars["ID"]['output'], mediaContentType: StorefrontAPI.MediaContentType, alt: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null, sources: Array<{ mimeType: import("./fixtures/storefront-api-types").Scalars["String"]['output'], url: import("./fixtures/storefront-api-types").Scalars["String"]['output'] }>, previewImage: { url: import("./fixtures/storefront-api-types").Scalars["URL"]['output'] } | null }
                & { __typename: 'Video' }
              )
             | null } | null } | null, shop: { name: import("./fixtures/storefront-api-types").Scalars["String"]['output'], description: import("./fixtures/storefront-api-types").Scalars["String"]['output'] | null } };

      interface GeneratedQueryTypes {
        "#graphql\\n  query collectionContentTest($handle: String, $country: CountryCode, $language: LanguageCode)\\n  @inContext(country: $country, language: $language) {\\n    hero: collection(handle: $handle) {\\n      ...CollectionContent\\n    }\\n    shop {\\n      name\\n      description\\n    }\\n  }\\n  #graphql\\n  fragment CollectionContent on Collection {\\n    id\\n    handle\\n    title\\n    descriptionHtml\\n    heading: metafield(namespace: \\"hero\\", key: \\"title\\") {\\n      value\\n    }\\n    byline: metafield(namespace: \\"hero\\", key: \\"byline\\") {\\n      value\\n    }\\n    cta: metafield(namespace: \\"hero\\", key: \\"cta\\") {\\n      value\\n    }\\n    spread: metafield(namespace: \\"hero\\", key: \\"spread\\") {\\n      reference {\\n        ...Media\\n      }\\n    }\\n    spreadSecondary: metafield(namespace: \\"hero\\", key: \\"spread_secondary\\") {\\n      reference {\\n        ...Media\\n      }\\n    }\\n  }\\n  #graphql\\n  fragment Media on Media {\\n    __typename\\n    mediaContentType\\n    alt\\n    previewImage {\\n      url\\n    }\\n    ... on MediaImage {\\n      id\\n      image {\\n        url\\n        width\\n        height\\n      }\\n    }\\n    ... on Video {\\n      id\\n      sources {\\n        mimeType\\n        url\\n      }\\n    }\\n    ... on Model3d {\\n      id\\n      sources {\\n        mimeType\\n        url\\n      }\\n    }\\n    ... on ExternalVideo {\\n      id\\n      embedUrl\\n      host\\n    }\\n  }\\n\\n\\n": {return: CollectionContentTestQuery, variables: CollectionContentTestQueryVariables},
      }

      interface GeneratedMutationTypes {
      }

      declare module '@shopify/hydrogen' {
        interface StorefrontQueries extends GeneratedQueryTypes {}
        interface StorefrontMutations extends GeneratedMutationTypes {}
      }
      "
    `);
  });
});
