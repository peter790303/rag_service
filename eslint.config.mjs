import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

const acronymUppercaseRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Use uppercase spelling for DTO, QO, and VO acronym tokens in owned identifiers.' },
    schema: [],
    messages: {
      uppercase: 'Use {{uppercase}} for the acronym in owned identifier "{{name}}".',
    },
  },
  create(context) {
    const checkedIdentifiers = new WeakSet()
    const reportedRanges = new Set()
    const acronyms = [
      ['dto', 'DTO'],
      ['qo', 'QO'],
      ['vo', 'VO'],
    ]

    const malformedAcronym = (name) => {
      const lowercaseName = name.toLowerCase()
      const malformed = acronyms.find(([lowercase, uppercase]) =>
        Array.from({ length: Math.max(name.length - lowercase.length + 1, 0) }, (_, start) => start).some((start) => {
          const end = start + lowercase.length

          if (lowercaseName.slice(start, end) !== lowercase) return false

          const previous = name[start - 1]
          const first = name[start]
          const next = name[end]
          const leftBoundary =
            start === 0 ||
            !/[A-Za-z0-9]/.test(previous ?? '') ||
            (/[a-z]/.test(previous ?? '') && /[A-Z]/.test(first)) ||
            (/[A-Z]/.test(previous ?? '') && /[A-Z]/.test(first))
          const rightBoundary = end === name.length || !/[A-Za-z0-9]/.test(next ?? '') || /[A-Z]/.test(next)

          return leftBoundary && rightBoundary && name.slice(start, end) !== uppercase
        }),
      )

      return malformed?.[1] ?? null
    }

    const checkIdentifier = (node) => {
      if (checkedIdentifiers.has(node)) return

      checkedIdentifiers.add(node)

      const uppercase = malformedAcronym(node.name)

      if (uppercase !== null) {
        const range = node.range?.join(':')

        if (range !== undefined && reportedRanges.has(range)) return

        if (range !== undefined) reportedRanges.add(range)

        context.report({ node, messageId: 'uppercase', data: { uppercase, name: node.name } })
      }
    }

    const checkBindingPattern = (node) => {
      if (node === null || node === undefined) return

      switch (node.type) {
        case 'Identifier':
          checkIdentifier(node)

          return
        case 'RestElement':
        case 'TSParameterProperty':
          checkBindingPattern(node.argument ?? node.parameter)

          return
        case 'AssignmentPattern':
          checkBindingPattern(node.left)

          return
        case 'ArrayPattern':
          node.elements.forEach(checkBindingPattern)

          return
        case 'ObjectPattern':
          node.properties.forEach((property) => {
            if (property.type === 'RestElement') {
              checkBindingPattern(property.argument)
            } else {
              checkBindingPattern(property.value)
            }
          })
      }
    }

    const checkParameters = (node) => node.params.forEach(checkBindingPattern)
    const checkPropertyKey = (node) => {
      if (!node.computed && node.key.type === 'Identifier') checkIdentifier(node.key)
    }

    return {
      VariableDeclarator(node) {
        checkBindingPattern(node.id)
      },
      FunctionDeclaration(node) {
        if (node.id !== null) checkIdentifier(node.id)

        checkParameters(node)
      },
      FunctionExpression(node) {
        if (node.id !== null) checkIdentifier(node.id)

        checkParameters(node)
      },
      ArrowFunctionExpression: checkParameters,
      ClassDeclaration(node) {
        if (node.id !== null) checkIdentifier(node.id)
      },
      ClassExpression(node) {
        if (node.id !== null) checkIdentifier(node.id)
      },
      TSInterfaceDeclaration(node) {
        checkIdentifier(node.id)
      },
      TSTypeAliasDeclaration(node) {
        checkIdentifier(node.id)
      },
      TSEnumDeclaration(node) {
        checkIdentifier(node.id)
      },
      MethodDefinition(node) {
        if (!node.computed && node.key.type === 'Identifier') checkIdentifier(node.key)
      },
      TSMethodSignature(node) {
        checkPropertyKey(node)

        checkParameters(node)
      },
      Property(node) {
        checkPropertyKey(node)
      },
      PropertyDefinition: checkPropertyKey,
      TSPropertySignature: checkPropertyKey,
      TSTypeParameter(node) {
        checkIdentifier(node.name)
      },
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSFunctionType: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction(node) {
        if (node.id !== null) checkIdentifier(node.id)

        checkParameters(node)
      },
      CatchClause(node) {
        checkBindingPattern(node.param)
      },
      ImportDefaultSpecifier(node) {
        checkIdentifier(node.local)
      },
      ImportNamespaceSpecifier(node) {
        checkIdentifier(node.local)
      },
      ImportSpecifier(node) {
        const importedName = node.imported.name ?? node.imported.value

        if (importedName !== node.local.name) checkIdentifier(node.local)
      },
      TSImportEqualsDeclaration(node) {
        checkIdentifier(node.id)
      },
    }
  },
}

const noAsyncCollectionCallbackRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Reject async reduce and forEach callbacks that hide serial work or discard promises.' },
    schema: [],
    messages: { asyncCallback: 'Do not use an async callback with {{method}}; express ordered async work explicitly.' },
  },
  create(context) {
    const isAsyncFunction = (node) =>
      (node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration') &&
      node.async

    const unwrapExpression = (node) => {
      if (
        node?.type === 'ChainExpression' ||
        node?.type === 'ParenthesizedExpression' ||
        node?.type === 'TSAsExpression' ||
        node?.type === 'TSSatisfiesExpression' ||
        node?.type === 'TSNonNullExpression' ||
        node?.type === 'TSTypeAssertion'
      ) {
        return unwrapExpression(node.expression)
      }

      return node
    }

    const getDefaultSortRank = (node) => {
      const candidate = unwrapExpression(node)

      if (
        (candidate?.type !== 'ArrowFunctionExpression' && candidate?.type !== 'FunctionExpression') ||
        candidate.generator
      ) {
        return undefined
      }

      const firstToken = context.sourceCode.getFirstToken(candidate)

      if (candidate.async) return firstToken?.value === 'async' ? 1 : undefined

      if (candidate.type === 'ArrowFunctionExpression') return firstToken?.value === '(' ? 0 : undefined

      return firstToken?.value === 'function' ? 2 : undefined
    }

    const getStaticPropertyName = (property, computed) => {
      const candidate = unwrapExpression(property)

      if (!computed && candidate?.type === 'Identifier') return candidate.name

      if (computed && candidate?.type === 'Literal' && typeof candidate.value === 'string') return candidate.value

      if (computed && candidate?.type === 'TemplateLiteral' && candidate.expressions.length === 0) {
        return candidate.quasis[0]?.value.cooked
      }

      return undefined
    }

    const resolveVariable = (identifier, scope = context.sourceCode.getScope(identifier)) => {
      if (scope === null || scope === undefined) return undefined

      return scope.set.get(identifier.name) ?? resolveVariable(identifier, scope.upper)
    }

    const executionScopeTypes = new Set(['function', 'global', 'module'])

    const getNodeStart = (node) =>
      node?.range?.[0] ?? (node?.loc === undefined ? undefined : context.sourceCode.getIndexFromLoc(node.loc.start))

    const getExecutionScope = (scope) => {
      if (scope === null || scope === undefined) return undefined

      return executionScopeTypes.has(scope.type) ? scope : getExecutionScope(scope.upper)
    }

    const getVariableDeclaration = (variable) => {
      if (variable?.defs.length !== 1) return undefined

      const definition = variable.defs[0]
      const declaration = definition.node

      return definition.type === 'Variable' &&
        declaration.type === 'VariableDeclarator' &&
        declaration.id.type === 'Identifier' &&
        declaration.init !== null &&
        !variable.references.some((reference) => reference.isWrite() && !reference.init)
        ? declaration
        : undefined
    }

    const getArrayInitializer = (variable, seenVariables = new Set()) => {
      if (variable === undefined || seenVariables.has(variable)) return undefined

      const declaration = getVariableDeclaration(variable)

      if (declaration === undefined) return undefined

      const initializer = unwrapExpression(declaration.init)

      if (initializer?.type === 'ArrayExpression') return { variable, initializer }

      if (initializer?.type !== 'Identifier') return undefined

      const nestedVariables = new Set(seenVariables)

      nestedVariables.add(variable)

      return getArrayInitializer(resolveVariable(initializer), nestedVariables)
    }

    const isArrayIndex = (property, computed) => {
      if (!computed) return undefined

      const candidate = unwrapExpression(property)
      const value = candidate?.type === 'Literal' ? candidate.value : undefined
      const index = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined

      return Number.isSafeInteger(index) && index >= 0 && String(index) === String(value) ? index : undefined
    }

    const getStraightLineStatement = (node, executionScope) => {
      if (node === executionScope.block || node === null || node === undefined) return undefined

      return node.type === 'ExpressionStatement' ? node : getStraightLineStatement(node.parent, executionScope)
    }

    const hasOnlyBlockAncestors = (node, executionScope) => {
      if (node === executionScope.block) return true

      return node?.type === 'BlockStatement' && hasOnlyBlockAncestors(node.parent, executionScope)
    }

    const isDirectMutationStatement = (mutation, executionScope) => {
      const scopeBlock = executionScope.block

      if (
        scopeBlock?.type === 'ArrowFunctionExpression' &&
        scopeBlock.body.type !== 'BlockStatement' &&
        unwrapExpression(scopeBlock.body) === unwrapExpression(mutation)
      ) {
        return true
      }

      const statement = getStraightLineStatement(mutation, executionScope)

      return (
        statement !== undefined &&
        unwrapExpression(statement.expression) === unwrapExpression(mutation) &&
        hasOnlyBlockAncestors(statement.parent, executionScope)
      )
    }

    const foldStaticSpreads = (items, resolveSpread) =>
      items.reduce(
        (resolved, item) => {
          if (!resolved.complete) return resolved

          if (item?.type !== 'SpreadElement') {
            return { elements: [...resolved.elements, item], complete: true }
          }

          const spread = resolveSpread(item.argument)

          return spread === undefined
            ? { ...resolved, complete: false }
            : { elements: [...resolved.elements, ...spread.elements], complete: spread.complete }
        },
        { elements: [], complete: true },
      )

    const getStaticInteger = (expression) => {
      const candidate = unwrapExpression(expression)
      const isSignedLiteral = candidate?.type === 'UnaryExpression' && ['+', '-'].includes(candidate.operator)
      const literal = isSignedLiteral ? unwrapExpression(candidate.argument) : candidate

      if (
        literal?.type !== 'Literal' ||
        (![null, 'number', 'string', 'boolean'].includes(typeof literal.value) && literal.value !== null)
      ) {
        return undefined
      }

      const value = Number(literal.value)
      const signedValue = isSignedLiteral && candidate.operator === '-' ? -value : value

      return Number.isNaN(signedValue) ? 0 : Math.trunc(signedValue)
    }

    const normalizeRelativeIndex = (index, length) =>
      index === Number.NEGATIVE_INFINITY
        ? 0
        : index === Number.POSITIVE_INFINITY
          ? length
          : index < 0
            ? Math.max(length + index, 0)
            : Math.min(index, length)

    const getArrayAliasVariables = (rootVariable, useNode) => {
      const executionScope = getExecutionScope(rootVariable.scope)
      const useExecutionScope = getExecutionScope(context.sourceCode.getScope(useNode))

      if (executionScope === undefined || executionScope !== useExecutionScope) return undefined

      const variables = context.sourceCode.scopeManager.scopes.flatMap((scope) => scope.variables)
      const addAliases = (aliases) => {
        const aliasSet = new Set(aliases)
        const additions = variables.filter((variable) => {
          if (
            aliasSet.has(variable) ||
            getExecutionScope(variable.scope) !== executionScope ||
            getNodeStart(getVariableDeclaration(variable)) > getNodeStart(useNode)
          ) {
            return false
          }

          const declaration = getVariableDeclaration(variable)
          const initializer = declaration === undefined ? undefined : unwrapExpression(declaration.init)

          return initializer?.type === 'Identifier' && aliasSet.has(resolveVariable(initializer))
        })
        const nextAliases = [...aliases, ...additions]

        return additions.length === 0 ? nextAliases : addAliases(nextAliases)
      }

      return addAliases([rootVariable])
    }

    const getArrayMutation = (identifier, executionScope, aliases) => {
      const member = identifier.parent

      if (member?.type === 'MemberExpression' && member.object === identifier) {
        const parent = member.parent

        if (parent?.type === 'CallExpression' && parent.callee === member) {
          const method = getStaticPropertyName(member.property, member.computed)
          const argumentsList = parent.arguments
          const supportedMethod = [
            'push',
            'unshift',
            'pop',
            'shift',
            'splice',
            'reverse',
            'fill',
            'copyWithin',
            'sort',
          ].includes(method)

          if (!supportedMethod || !isDirectMutationStatement(parent, executionScope))
            return { kind: 'unknown', node: parent }

          const resolvedArguments = resolveArgumentList(argumentsList, new Set(aliases), parent)

          if (!resolvedArguments.complete) return { kind: 'unknown', node: parent }

          const values = resolvedArguments.elements

          if ((method === 'pop' || method === 'shift') && argumentsList.length > 0) {
            return { kind: 'unknown', node: parent }
          }

          if (method === 'push' || method === 'unshift') {
            return { kind: method, node: parent, values }
          }

          if (method === 'pop' || method === 'shift') return { kind: method, node: parent }

          if (method === 'reverse') return { kind: 'reverse', node: parent }

          if (method === 'splice') {
            if (values.length === 0) return { kind: 'splice', node: parent, start: 0, deleteCount: 0, values: [] }

            const start = getStaticInteger(values[0])

            if (start === undefined) return { kind: 'unknown', node: parent }

            if (values.length === 1) {
              return { kind: 'splice', node: parent, start, deleteCount: Infinity, values: [] }
            }

            const deleteCount = getStaticInteger(values[1])

            return deleteCount === undefined
              ? { kind: 'unknown', node: parent }
              : {
                  kind: 'splice',
                  node: parent,
                  start,
                  deleteCount: Math.max(0, deleteCount),
                  values: values.slice(2),
                }
          }

          if (method === 'fill') {
            const start = values.length < 2 ? 0 : getStaticInteger(values[1])
            const end = values.length < 3 ? Number.POSITIVE_INFINITY : getStaticInteger(values[2])

            return start === undefined || end === undefined
              ? { kind: 'unknown', node: parent }
              : { kind: 'fill', node: parent, value: values[0] ?? null, start, end }
          }

          if (method === 'copyWithin') {
            const target = values.length < 1 ? 0 : getStaticInteger(values[0])
            const start = values.length < 2 ? 0 : getStaticInteger(values[1])
            const end = values.length < 3 ? Number.POSITIVE_INFINITY : getStaticInteger(values[2])

            return target === undefined || start === undefined || end === undefined
              ? { kind: 'unknown', node: parent }
              : { kind: 'copyWithin', node: parent, target, start, end }
          }

          if (method === 'sort') {
            return values.length === 0 ? { kind: 'sort', node: parent } : { kind: 'unknown', node: parent }
          }
        }

        if (parent?.type === 'AssignmentExpression' && parent.left === member) {
          if (parent.operator !== '=' || !isDirectMutationStatement(parent, executionScope)) {
            return { kind: 'unknown', node: parent }
          }

          if (getStaticPropertyName(member.property, member.computed) === 'length') {
            const length = unwrapExpression(parent.right)

            return length?.type === 'Literal' && Number.isSafeInteger(length.value) && length.value >= 0
              ? { kind: 'length', node: parent, value: length.value }
              : { kind: 'unknown', node: parent }
          }

          const index = isArrayIndex(member.property, member.computed)

          return index === undefined
            ? { kind: 'unknown', node: parent }
            : { kind: 'set', node: parent, index, value: parent.right }
        }

        if (
          getStaticPropertyName(member.property, member.computed) === 'length' ||
          isArrayIndex(member.property, member.computed) !== undefined
        ) {
          return undefined
        }

        return { kind: 'unknown', node: member }
      }

      const declaration = identifier.parent

      if (
        declaration?.type === 'VariableDeclarator' &&
        declaration.init === identifier &&
        declaration.id.type === 'Identifier' &&
        aliases.includes(resolveVariable(declaration.id))
      ) {
        return undefined
      }

      const parent = identifier.parent

      if (parent?.type === 'SpreadElement') {
        if (parent.parent?.type === 'ArrayExpression') return undefined

        if (parent.parent?.type === 'CallExpression' && getCollectionFunction(parent.parent.callee) !== undefined) {
          return undefined
        }
      }

      if (parent?.type === 'CallExpression' && parent.arguments.includes(identifier)) {
        return getCollectionFunction(parent.callee) === undefined ? { kind: 'unknown', node: parent } : undefined
      }

      if (parent?.type === 'ArrayExpression') return { kind: 'unknown', node: parent }

      if (parent?.type === 'AssignmentExpression' || parent?.type === 'ReturnStatement') {
        return { kind: 'unknown', node: parent }
      }

      return undefined
    }

    const getHelperMutationEvents = (mutation, useExecutionScope, useNode) => {
      const helper = mutation.executionScope?.block
      const getHelperDeclarator = (expression) => {
        const parent = expression?.parent

        if (parent?.type === 'VariableDeclarator' && parent.init === expression) return parent

        return parent !== undefined && unwrapExpression(parent) === expression ? getHelperDeclarator(parent) : undefined
      }
      const helperDeclarator = getHelperDeclarator(helper)
      const helperVariable =
        helper?.type === 'FunctionDeclaration'
          ? resolveVariable(helper.id)
          : helperDeclarator?.id.type === 'Identifier'
            ? resolveVariable(helperDeclarator.id)
            : undefined

      if (helperVariable?.defs.length !== 1) return []

      const definition = helperVariable.defs[0]
      const declarationMatchesHelper =
        (helper?.type === 'FunctionDeclaration' && definition.node === helper) ||
        (definition.node.type === 'VariableDeclarator' && unwrapExpression(definition.node.init) === helper)

      if (!declarationMatchesHelper) return []

      const references = helperVariable.references
      const calls = references.flatMap(({ identifier }) => {
        const call = identifier.parent

        return call?.type === 'CallExpression' && unwrapExpression(call.callee) === identifier ? [call] : []
      })
      const priorCalls = calls.filter(
        (call) =>
          getExecutionScope(context.sourceCode.getScope(call)) === useExecutionScope &&
          getNodeStart(call) < getNodeStart(useNode),
      )

      if (priorCalls.length === 0) return []

      const allReferencesAreStraightLineCalls = references.every(({ identifier }) => {
        const declaration = identifier.parent

        if (
          declaration?.type === 'VariableDeclarator' &&
          declaration.id === identifier &&
          declaration === helperDeclarator
        ) {
          return true
        }

        const call = identifier.parent

        return (
          call?.type === 'CallExpression' &&
          unwrapExpression(call.callee) === identifier &&
          !call.optional &&
          call.arguments.length === 0 &&
          getExecutionScope(context.sourceCode.getScope(call)) === useExecutionScope &&
          isDirectMutationStatement(call, useExecutionScope)
        )
      })
      const statements = helper.body?.type === 'BlockStatement' ? helper.body.body : []
      const bodyStatement = statements[0]
      const hasSingleMutationStatement =
        (statements.length === 1 &&
          bodyStatement?.type === 'ExpressionStatement' &&
          unwrapExpression(bodyStatement.expression) === unwrapExpression(mutation.node)) ||
        (helper.type === 'ArrowFunctionExpression' &&
          helper.body.type !== 'BlockStatement' &&
          unwrapExpression(helper.body) === unwrapExpression(mutation.node))
      const canModelMutation =
        (helper.type === 'FunctionDeclaration' ||
          helper.type === 'FunctionExpression' ||
          helper.type === 'ArrowFunctionExpression') &&
        !helper.async &&
        !helper.generator &&
        helper.params.length === 0 &&
        !references.some((reference) => reference.isWrite() && !reference.init) &&
        allReferencesAreStraightLineCalls &&
        hasSingleMutationStatement

      return priorCalls.map((call) => ({
        ...mutation,
        kind: canModelMutation ? mutation.kind : 'unknown',
        node: call,
        executionScope: useExecutionScope,
      }))
    }

    const applyArrayMutation = (elements, mutation) => {
      switch (mutation.kind) {
        case 'push':
          return [...elements, ...mutation.values]
        case 'unshift':
          return [...mutation.values, ...elements]
        case 'pop':
          return elements.slice(0, -1)
        case 'shift':
          return elements.slice(1)
        case 'splice': {
          const start = normalizeRelativeIndex(mutation.start, elements.length)
          const deleteCount = Math.min(mutation.deleteCount, elements.length - start)

          return [...elements.slice(0, start), ...mutation.values, ...elements.slice(start + deleteCount)]
        }
        case 'reverse':
          return elements.slice().reverse()
        case 'fill': {
          const start = normalizeRelativeIndex(mutation.start, elements.length)
          const end = normalizeRelativeIndex(mutation.end, elements.length)

          return elements.map((element, index) => (index >= start && index < end ? mutation.value : element))
        }
        case 'copyWithin': {
          const target = normalizeRelativeIndex(mutation.target, elements.length)
          const start = normalizeRelativeIndex(mutation.start, elements.length)
          const end = normalizeRelativeIndex(mutation.end, elements.length)
          const copyCount = Math.max(0, Math.min(end - start, elements.length - target))
          const copied = elements.slice(start, start + copyCount)

          return elements.map((element, index) =>
            index >= target && index < target + copyCount ? (copied[index - target] ?? null) : element,
          )
        }
        case 'sort': {
          if (elements.length <= 1) return elements

          const rankedElements = elements.map((element) => ({ element, rank: getDefaultSortRank(element) }))
          const ranks = rankedElements.map(({ rank }) => rank)

          if (ranks.includes(undefined) || new Set(ranks).size !== ranks.length) return undefined

          return rankedElements.sort((left, right) => left.rank - right.rank).map(({ element }) => element)
        }
        case 'set':
          return [
            ...elements.slice(0, mutation.index),
            ...Array(Math.max(0, mutation.index - elements.length)).fill(null),
            mutation.value,
            ...elements.slice(mutation.index + 1),
          ]
        case 'length':
          return mutation.value <= elements.length
            ? elements.slice(0, mutation.value)
            : [...elements, ...Array(mutation.value - elements.length).fill(null)]
        default:
          return undefined
      }
    }

    const resolveArrayElements = (elements, seenVariables, useNode) =>
      foldStaticSpreads(elements, (argument) => resolveStaticArray(argument, seenVariables, useNode))

    const resolveStaticArray = (expression, seenVariables = new Set(), useNode = expression) => {
      const candidate = unwrapExpression(expression)

      if (candidate?.type === 'ArrayExpression') {
        return resolveArrayElements(candidate.elements, seenVariables, useNode)
      }

      if (candidate?.type !== 'Identifier') return undefined

      const variable = resolveVariable(candidate)
      const initializer = getArrayInitializer(variable, seenVariables)

      if (initializer === undefined || seenVariables.has(initializer.variable)) return undefined

      const aliases = getArrayAliasVariables(initializer.variable, useNode)

      if (aliases === undefined) return undefined

      const nestedVariables = new Set(seenVariables)

      nestedVariables.add(initializer.variable)

      const initial = resolveArrayElements(initializer.initializer.elements, nestedVariables, useNode)
      const mutations = aliases.flatMap((alias) =>
        alias.references.flatMap((reference) => {
          const identifier = reference.identifier
          const executionScope = getExecutionScope(context.sourceCode.getScope(identifier))
          const mutation = getArrayMutation(identifier, executionScope, aliases)

          return mutation === undefined ? [] : [{ ...mutation, executionScope }]
        }),
      )
      const useExecutionScope = getExecutionScope(context.sourceCode.getScope(useNode))
      const mutationEvents = mutations.flatMap((mutation) =>
        mutation.executionScope === useExecutionScope
          ? [mutation]
          : getHelperMutationEvents(mutation, useExecutionScope, useNode),
      )
      const isPriorSameScopeMutation = (mutation) =>
        mutation.executionScope === useExecutionScope && getNodeStart(mutation.node) < getNodeStart(useNode)
      const unresolvedMutation = mutations.some(
        (mutation) => mutation.kind === 'unknown' && isPriorSameScopeMutation(mutation),
      )

      const unresolvedHelperMutation = mutationEvents.some(
        (mutation) => mutation.kind === 'unknown' && isPriorSameScopeMutation(mutation),
      )

      if (unresolvedMutation || unresolvedHelperMutation) return undefined

      if (!initial.complete) return initial

      const elements = mutationEvents
        .filter((mutation) => mutation.kind !== 'unknown' && isPriorSameScopeMutation(mutation))
        .sort((left, right) => getNodeStart(left.node) - getNodeStart(right.node))
        .reduce(
          (elements, mutation) => (elements === undefined ? undefined : applyArrayMutation(elements, mutation)),
          initial.elements,
        )

      return elements === undefined ? undefined : { elements, complete: true }
    }

    const resolveArgumentList = (argumentsList, seenVariables = new Set(), useNode) =>
      foldStaticSpreads(argumentsList, (argument) => resolveStaticArray(argument, seenVariables, useNode ?? argument))

    const getArgumentAt = (argumentsList, index) => resolveArgumentList(argumentsList).elements[index]

    const getBoundArguments = (argumentsList) => {
      const resolved = resolveArgumentList(argumentsList)

      return {
        elements: resolved.elements.length === 0 ? [] : resolved.elements.slice(1),
        complete: resolved.complete,
      }
    }

    const appendBoundArguments = (boundArguments, addedArguments) =>
      boundArguments.elements.length > 0 || !boundArguments.complete ? boundArguments : addedArguments

    const isBindingIdentifier = (pattern, name) => {
      const candidate = pattern?.type === 'AssignmentPattern' ? pattern.left : pattern

      return candidate?.type === 'Identifier' && candidate.name === name
    }

    const getCollectionFunction = (expression, seenVariables = new Set()) => {
      const candidate = unwrapExpression(expression)

      if (candidate?.type === 'MemberExpression') {
        const method = getStaticPropertyName(candidate.property, candidate.computed)
        const collection = getCollectionFunction(candidate.object, seenVariables)

        if (method === 'reduce' || method === 'forEach') return { method, invocation: 'direct' }

        if (collection?.invocation === 'direct' && ['call', 'apply', 'bind'].includes(method)) {
          return { ...collection, invocation: method }
        }

        if (collection?.invocation === 'bound' && ['call', 'apply', 'bind'].includes(method)) {
          return { ...collection, invocation: method === 'bind' ? 'bindBound' : `${method}Bound` }
        }

        return undefined
      }

      if (candidate?.type === 'CallExpression') {
        const collection = getCollectionFunction(candidate.callee, seenVariables)

        if (collection?.invocation === 'bind') {
          return {
            method: collection.method,
            invocation: 'bound',
            boundArguments: getBoundArguments(candidate.arguments),
          }
        }

        if (collection?.invocation === 'bindBound') {
          return {
            method: collection.method,
            invocation: 'bound',
            boundArguments: appendBoundArguments(collection.boundArguments, getBoundArguments(candidate.arguments)),
          }
        }

        return undefined
      }

      if (candidate?.type !== 'Identifier') return undefined

      const variable = resolveVariable(candidate)

      if (variable === undefined || seenVariables.has(variable)) return undefined

      seenVariables.add(variable)

      const declaration = variable.defs.find((definition) => definition.type === 'Variable')?.node

      if (declaration?.type !== 'VariableDeclarator') return undefined

      if (declaration.id.type === 'Identifier') {
        return getCollectionFunction(declaration.init, seenVariables)
      }

      if (declaration.id.type !== 'ObjectPattern') return undefined

      const property = declaration.id.properties.find(
        (entry) =>
          entry.type === 'Property' &&
          isBindingIdentifier(entry.value, candidate.name) &&
          (getStaticPropertyName(entry.key, entry.computed) === 'reduce' ||
            getStaticPropertyName(entry.key, entry.computed) === 'forEach'),
      )

      const method = property === undefined ? undefined : getStaticPropertyName(property.key, property.computed)

      return method === 'reduce' || method === 'forEach' ? { method, invocation: 'direct' } : undefined
    }

    const getApplyCallback = (argumentsList) => resolveStaticArray(argumentsList)?.elements[0]

    const getBoundCallback = (boundArguments, unboundCallback) => {
      if (boundArguments.elements.length > 0) return boundArguments.elements[0]

      return boundArguments.complete ? unboundCallback : undefined
    }

    const getCollectionCallback = (call, collection) => {
      switch (collection.invocation) {
        case 'direct':
          return getArgumentAt(call.arguments, 0)
        case 'call':
          return getArgumentAt(call.arguments, 1)
        case 'apply':
          return getApplyCallback(getArgumentAt(call.arguments, 1))
        case 'bound':
          return getBoundCallback(collection.boundArguments, getArgumentAt(call.arguments, 0))
        case 'callBound':
          return getBoundCallback(collection.boundArguments, getArgumentAt(call.arguments, 1))
        case 'applyBound':
          return getBoundCallback(collection.boundArguments, getApplyCallback(getArgumentAt(call.arguments, 1)))
        default:
          return undefined
      }
    }

    const isAsyncCallback = (callback, seenVariables = new Set()) => {
      const candidate = unwrapExpression(callback)

      if (isAsyncFunction(candidate)) return true

      if (candidate?.type !== 'Identifier') return false

      const variable = resolveVariable(candidate)

      if (variable === undefined || seenVariables.has(variable)) return false

      seenVariables.add(variable)

      return variable.defs.some((definition) => {
        const value = unwrapExpression(
          definition.node.type === 'VariableDeclarator' ? definition.node.init : definition.node,
        )

        return isAsyncFunction(value) || (value?.type === 'Identifier' && isAsyncCallback(value, seenVariables))
      })
    }

    return {
      CallExpression(node) {
        const collection = getCollectionFunction(node.callee)

        if (collection === undefined || ['bind', 'bindBound'].includes(collection.invocation)) return

        const callback = getCollectionCallback(node, collection)

        if (isAsyncCallback(callback)) {
          context.report({ node: callback, messageId: 'asyncCallback', data: { method: collection.method } })
        }
      },
    }
  },
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    plugins: {
      'import-x': importX,
      local: {
        rules: {
          'acronym-uppercase': acronymUppercaseRule,
          'no-async-collection-callback': noAsyncCollectionCallbackRule,
        },
      },
    },
    rules: {
      'local/acronym-uppercase': 'error',
      'local/no-async-collection-callback': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'ForStatement', message: 'Collection handling must use map, filter, reduce, or flatMap.' },
        { selector: 'ForOfStatement', message: 'Collection handling must use map, filter, reduce, or flatMap.' },
        { selector: 'ForInStatement', message: 'Collection handling must use map, filter, reduce, or flatMap.' },
        { selector: 'WhileStatement', message: 'Collection handling must use map, filter, reduce, or flatMap.' },
        { selector: 'DoWhileStatement', message: 'Collection handling must use map, filter, reduce, or flatMap.' },
      ],
      'import-x/newline-after-import': ['error', { count: 1, considerComments: true }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'lines-between-class-members': ['error', 'always'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: 'if', next: '*' },
      ],
    },
  },
  {
    files: ['src/Application/Chunks/**/*.ts', 'src/Domain/Chunk/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ForStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'ForOfStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'ForInStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'WhileStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
        { selector: 'DoWhileStatement', message: 'Chunks 集合處理請使用 map、filter、reduce 或 flatMap。' },
      ],
    },
  },
  eslintConfigPrettier,
)
