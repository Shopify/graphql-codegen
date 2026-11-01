export const A = `#graphql
  query supplementQRCode($id: ID!) {
    product(id: $id) {
      title
    }
  }
`;

export const B = `#graphql
  query product_search {
    shop {
      name
    }
  }
`;
