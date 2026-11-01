import type {Source} from '@graphql-tools/utils';
import {convertFactory} from '@graphql-codegen/visitor-plugin-common';
import {pascalCase} from 'change-case-all';
import type {FragmentDefinitionNode, OperationDefinitionNode} from 'graphql';
import type {OperationOrFragment, SourceWithOperations} from './plugin.js';

type OperationNamingConfig = Parameters<typeof convertFactory>[0] & {
  typesPrefix?: string;
  typesSuffix?: string;
  omitOperationSuffix?: boolean;
  dedupeOperationSuffix?: boolean;
  operationResultSuffix?: string;
};

const buildOperationTypeNames = (
  node: OperationDefinitionNode | FragmentDefinitionNode,
  config: OperationNamingConfig,
) => {
  if (node.kind === 'FragmentDefinition') {
    return {initialName: 'not used', variablesName: 'not used'};
  }

  const convertName = convertFactory(config);
  const name = convertName(node.name!.value);
  const operationType = pascalCase(node.operation);
  const operationSuffix =
    config.omitOperationSuffix ||
    (config.dedupeOperationSuffix &&
      name.toLowerCase().endsWith(operationType.toLowerCase()))
      ? ''
      : operationType;
  const convertOperationTypeName = (suffix: string) =>
    `${config.typesPrefix ?? ''}${convertName(name, {suffix})}${
      config.typesSuffix ?? ''
    }`;

  return {
    initialName: convertOperationTypeName(
      operationSuffix + (config.operationResultSuffix ?? ''),
    ),
    variablesName: convertOperationTypeName(operationSuffix + 'Variables'),
  };
};

export function processSources(
  sources: Array<Source>,
  config: OperationNamingConfig = {},
) {
  const sourcesWithOperations: Array<SourceWithOperations> = [];

  for (const originalSource of sources) {
    const source = fixLinebreaks(originalSource);
    const {document} = source;
    const operations: Array<OperationOrFragment> = [];

    for (const definition of document?.definitions ?? []) {
      if (
        definition?.kind !== 'OperationDefinition' &&
        definition?.kind !== 'FragmentDefinition'
      )
        continue;

      if (definition.name?.kind !== `Name`) continue;

      operations.push({
        ...buildOperationTypeNames(definition, config),
        definition,
      });
    }

    if (operations.length === 0) continue;

    sourcesWithOperations.push({
      source,
      operations,
    });
  }

  return sourcesWithOperations;
}

/**
 * https://github.com/dotansimha/graphql-code-generator/issues/7362
 *
 * Source file is read by @graphql/tools using fs.promises.readFile,
 * which means that the linebreaks are read as-is and the result will be different
 * depending on the OS: it will contain LF (\n) on Linux/MacOS and CRLF (\r\n) on Windows.
 *
 * In most scenarios that would be OK. However, gql-tag-operation is using the resulting string
 * as a TypeScript type. Which means that the string will be compared against a template literal,
 * for example:
 *
 * <pre><code>
 * `
 * query a {
 *    a
 *  }
 * ` === '\n query a {\n    a\n  }\n '
 * </code></pre>
 *
 * According to clause 12.8.6.2 of ECMAScript Language Specification
 * (https://tc39.es/ecma262/#sec-static-semantics-trv),
 * when comparing strings, JavaScript doesn't care which linebreaks does the source file contain,
 * any linebreak (CR, LF or CRLF) is LF from JavaScript standpoint
 * (otherwise the result of the above comparison would be OS-dependent, which doesn't make sense).
 *
 * Therefore gql-tag-operation would break on Windows as it would generate
 *
 * '\r\n query a {\r\n    a\r\n  }\r\n '
 *
 * which is NOT equal to
 *
 * <pre><code>
 * `
 * query a {
 *    a
 *  }
 * `
 * </code></pre>
 *
 * Therefore we need to replace \r\n with \n in the string.
 *
 * @param source
 */
function fixLinebreaks(source: Source) {
  const fixedSource = {...source};

  fixedSource.rawSDL = source.rawSDL?.replace(/\r\n/g, '\n');

  return fixedSource;
}
