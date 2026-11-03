/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends {[key: string]: unknown}> = {[K in keyof T]: T[K]};
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {[P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never};
export type LayoutQueryVariables = Exact<{[key: string]: never}>;

export type LayoutQuery = {
  shop: {
    name: import('./../../tests/fixtures/storefront-api-types.d.ts').Scalars['String']['output'];
    description:
      | import('./../../tests/fixtures/storefront-api-types.d.ts').Scalars['String']['output']
      | null;
  };
};

interface GeneratedQueryTypes {
  '#graphql\n  query layout {\n    shop {\n      name\n      description\n    }\n  }\n': {
    return: LayoutQuery;
    variables: LayoutQueryVariables;
  };
}

interface GeneratedMutationTypes {}

declare module 'examples/client' {
  interface MyAPIQueries extends GeneratedQueryTypes {}
  interface MyAPIMutations extends GeneratedMutationTypes {}
}
