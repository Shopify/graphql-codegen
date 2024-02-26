// Example of a GraphQL client implementation using fetch.

import type {
  ClientReturn,
  ClientVariablesInRestParams,
} from '@shopify/graphql-codegen';

// Empty interface to be extended with the generated queries and mutations in user projects.
export interface MyAPIQueries {}
export interface MyAPIMutations {}

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
