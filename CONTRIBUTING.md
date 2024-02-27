# Working on `@shopify/graphql-codegen`

## Code of Conduct

This project and everyone participating in it is governed by the
[CONTRIBUTING.md Code of Conduct](./CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## Getting started

**Requirements:**

- Node.js version 18.12.0 or higher

Run the following commands to get started.

| Command                                                | Description                            |
| ------------------------------------------------------ | -------------------------------------- |
| `git clone git@github.com:Shopify/graphql-codegen.git` | Clones the repo to your local computer |
| `npm install`                                          | Installs the dependencies with `npm`   |
| `npm run build`                                        | builds the source code in `dist`       |
| `npm run dev`                                          | Builds and watches for changes         |

## Testing

Hydrogen tests are run using [vitest](https://vitest.dev). You can run the tests with the following commands.

| Command                 | Description                     |
| ----------------------- | ------------------------------- |
| `npm run test`          | Runs unit and type tests once   |
| `npm run test:watch`    | Runs tests on every file change |
| `npm run test:coverage` | Runs tests and outputs coverage |

## Before submitting a PR

Please run all the following commands before submitting a PR to ensure the code is correct:

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run format`    | Formats the code with prettier            |
| `npm run typecheck` | Checks source-code for invalid TypeScript |
| `npm run test`      | Runs unit and type tests once             |
| `npm run codegen`   | Generates types for the example app       |

## Merging PRs

When merging PRs, please select the **Squash and Merge** option, which consolidates all the changes from the PR into a single commit. This helps reduce the commit noise in our Git repository.
