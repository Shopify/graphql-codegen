// Example of an app consuming the client implementation.

import {clientQuery} from 'examples/client';
import type {LayoutQuery} from './storefrontapi.generated';

const {shop} = await clientQuery(`#graphql
  query layout {
    shop {
      name
      description
    }
  }
`);

// @ts-expect-error property is not defined
shop.notDefined;
// Function contract
Layout({shop});

export function Layout(props: LayoutQuery) {
  console.log(props.shop.name, props.shop.description);
  // return <div>...</div>
}
