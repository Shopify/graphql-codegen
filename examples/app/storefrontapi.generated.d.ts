/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import * as StorefrontAPI from '../../tests/fixtures/storefront-api-types.d.ts';

export type LayoutQueryVariables = StorefrontAPI.Exact<{[key: string]: never}>;

export type LayoutQuery = {
  shop: Pick<StorefrontAPI.Shop, 'name' | 'description'>;
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
