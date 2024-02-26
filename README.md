# Shopify GraphQL Codegen

A codegen plugin and preset for generating TypeScript types from GraphQL queries in a `d.ts` file. It does not require any function wrapper and adds no runtime overhead (0 bytes to the bundle).

> This package was originally extracted from `@shopify/hydrogen-codegen` to be agnostic of Hydrogen and to be used with any GraphQL client.

The GraphQL client must use TypeScript interfaces that are extended in the generated `d.ts` file. This package also exports utility types to create GraphQL clients that comply to these interfaces. See an example in [Hydrogen's Storefront client](https://github.com/Shopify/hydrogen/blob/081b41e0d43c9e1090933e908362625b9dfe7166/packages/hydrogen/src/storefront.ts#L58-L143).

For example, the following query:

```ts
// `shop` is inferred as {name: string, description: string}
const {shop} = await clientQuery(`#graphql
  query layout {
    shop {
      name
      description
    }
  }
`);
```

Would generate the following `d.ts` file:

```ts
import * as MyAPI from 'path/to/my-api-types';

export type LayoutQueryVariables = MyAPI.Exact<{[key: string]: never}>;

export type LayoutQuery = {
  shop: Pick<MyAPI.Shop, 'name' | 'description'>;
};

interface GeneratedQueryTypes {
  '#graphql\n  query layout {\n    shop {\n      name\n      description\n    }\n  }\n': {
    return: LayoutQuery;
    variables: LayoutQueryVariables;
  };
}

interface GeneratedMutationTypes {}

declare module 'my-api-client' {
  interface MyAPIQueries extends GeneratedQueryTypes {}
  interface MyAPIMutations extends GeneratedMutationTypes {}
}
```

Therefore, when passing the query to the GraphQL client, TypeScript will infer the type of the response and the variables parameter.

## Benefits

- It does not require wrapping your queries or transforming them to AST with `graphql-tag`. As long as the GraphQL client complies with the TypeScript interfaces, you can simply pass plain strings.
- It does not add any runtime overhead or size to the production bundle. The generated `d.ts` file is used only for type checking, and optionally for importing types in your code.
- Generated types can be imported in your components to declare the shape of the data you expect to receive. For example:

  ```tsx
  import type {LayoutQuery} from './my-api.generated';

  export function Layout({shop}: LayoutQuery) {
    return (
      <div>
        <h1>{shop.name}</h1>
        <p>{shop.description}</p>
      </div>
    );
  }
  ```

### Caveats

- This plugin is intended for server-side queries. Since it doesn't rely on AST transformations, it might not be compatible with normalized GraphQL caches in the browser or persisted queries.
- If you are using string interpolation to build your queries, you will need to use `as const` on the strings to avoid assigning a generic `string` type to the variable. For example:

  ```ts
  const fragment = `#graphql
    fragment MyFragment on Shop {
      name
      description
    }
  `;

  const query = `#graphql
    ${fragment}
  
    query layout {
      shop {
        ...MyFragment
      }
    }
  ` as const; // <--- Add `as const` here
  ```

## Usage

### With GraphQL CLI

You can use the following example configuration with [GraphQL CLI](https://www.graphql-cli.com/introduction/):

```ts
// <root>/codegen.ts

import type {CodegenConfig} from '@graphql-codegen/cli';
import {pluckConfig, preset} from '@shopify/graphql-codegen';

export default {
  overwrite: true,
  pluckConfig,
  generates: {
    'my-api.generated.d.ts': {
      preset,
      schema: './path/to/my-api-schema.json',
      documents: ['./src/graphql/my-api/*.{ts,tsx,js,jsx}'],
      presetConfig: {
        // Generate the line `import * as MyAPI from 'path/to/my-api-types';`.
        // If you don't have generated types for your API beforehand,
        // omit this parameter to generate the types inline.
        importTypes: {
          namespace: 'MyAPI',
          from: 'path/to/my-api-types',
        },

        // Skip the __typename property from generated types:
        skipTypenameInOperations: true,

        // Add a custom interface extension to connect
        // the generated types to the GraphQL client:
        interfaceExtension: ({queryType, mutationType}) => `
          declare module 'my-api-client' {
            interface MyAPIQueries extends ${queryType} {}
            interface MyAPIMutations extends ${mutationType} {}
          }
        `,
      },
    },
  },
} as CodegenConfig;
```

### Making GraphQL clients

To make a GraphQL client that complies with the generated types, you can use the following utility types:

```ts
// my-api-client.ts
import type {
  ClientReturn,
  ClientVariablesInRestParams,
} from '@shopify/graphql-codegen';

// Empty interface to be extended with the generated queries and mutations in user projects.
export interface MyAPIQueries {}

export async function clientQuery<
  OverrideReturnType extends any = never,
  RawGqlString extends string = string,
>(
  query: RawGqlString,
  ...params: ClientVariablesInRestParams<MyAPIQueries, RawGqlString>
): Promise<ClientReturn<MyAPIQueries, RawGqlString, OverrideReturnType>> {
  // The 'params' and 'params.variables' are optional
  // if the query has no variables, required otherwise.
  const {variables} = params[0] ?? {};

  // Client implementation (this could be forwarding the query to Apollo, urql, useQuery, etc.)
  const response = await fetch('https://my-api.com/graphql', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });

  return response.json();
}
```

This allows to use the `clientQuery` function with any query string and TypeScript will infer the type of the response and the variables parameter. It's also possible to override the return type of the query by passing a type argument to `clientQuery`:

```ts
// Inferred type from the query:
data = await clientQuery('query layout {shop {name}}');

// Overwritten return type:
data = await clientQuery<{shop: {name: string}}>('...');
```

The type utilities accept other optional type params:

```ts
ClientVariablesInRestParams<
  // Interface extended with queries in the user project
  MyAPIQueries,
  // The raw query string that comes from the user
  RawGqlString,
  // -- Optional:
  // Additional properties to the params object.
  // E.g. `{cache: Cache; debug?: boolean}`
  AdditionalParamOptions,
  // Query variables that the client automatically injects.
  // E.g. `'locale' | 'currency'`
  AutoInjectedVariables
>;
```
