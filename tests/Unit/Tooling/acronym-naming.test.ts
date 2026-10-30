import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { ESLint } from 'eslint'

const projectRoot = process.cwd()

const lintFixture = async (source: string, options: { filePath?: string; fix?: boolean; ruleId?: string } = {}) => {
  const eslint = new ESLint({
    cwd: projectRoot,
    overrideConfigFile: resolve(projectRoot, 'eslint.config.mjs'),
    fix: options.fix ?? false,
    ...(options.fix === true ? { fixTypes: ['layout'] } : {}),
  })
  const [result] = await eslint.lintText(source, {
    filePath: resolve(projectRoot, options.filePath ?? 'src/acronym-naming-fixture.ts'),
  })
  const messages = result?.messages ?? []

  return {
    output: result?.output ?? source,
    messages: options.ruleId
      ? messages.filter((message) => message.ruleId === options.ruleId)
      : messages.filter((message) => message.ruleId === 'local/acronym-uppercase'),
  }
}

test('owned identifiers and property names require uppercase DTO, QO, and VO tokens', async () => {
  const { messages } = await lintFixture(`
    import { ExternalDto as responseDto, ExternalDto } from 'third-party'
    type UserDto = string
    interface SearchQo {
      payloadDto: string
      find(resultVo: string): void
    }
    class IndexDto {
      payloadDto!: string
      replaceChunkDto(searchDto: string): void {}
    }
    type ObjectShape = { valueDto: string; transformVo(requestDto: string): void }
    type Result<TDto> = TDto
    const fooDto = 1
    function parseDto(inputDto: string): string { return inputDto }
    const mapper = (responseVo: string): string => responseVo
    type Callback = (requestDto: string) => void
    const receiver = { replaceDto(requestVo: string): void {} }
    const payload = { payloadDto: 'wire key' }
    const { payloadDto: localDTO } = payload
    const { payloadDto } = payload
  `)

  assert.deepEqual(
    messages.map((message) => message.message).sort(),
    [
      'Use DTO for the acronym in owned identifier "UserDto".',
      'Use QO for the acronym in owned identifier "SearchQo".',
      'Use DTO for the acronym in owned identifier "payloadDto".',
      'Use DTO for the acronym in owned identifier "payloadDto".',
      'Use DTO for the acronym in owned identifier "payloadDto".',
      'Use VO for the acronym in owned identifier "resultVo".',
      'Use DTO for the acronym in owned identifier "IndexDto".',
      'Use DTO for the acronym in owned identifier "payloadDto".',
      'Use DTO for the acronym in owned identifier "replaceChunkDto".',
      'Use DTO for the acronym in owned identifier "searchDto".',
      'Use DTO for the acronym in owned identifier "valueDto".',
      'Use VO for the acronym in owned identifier "transformVo".',
      'Use DTO for the acronym in owned identifier "requestDto".',
      'Use DTO for the acronym in owned identifier "TDto".',
      'Use DTO for the acronym in owned identifier "fooDto".',
      'Use DTO for the acronym in owned identifier "parseDto".',
      'Use DTO for the acronym in owned identifier "inputDto".',
      'Use VO for the acronym in owned identifier "responseVo".',
      'Use DTO for the acronym in owned identifier "requestDto".',
      'Use DTO for the acronym in owned identifier "replaceDto".',
      'Use VO for the acronym in owned identifier "requestVo".',
      'Use DTO for the acronym in owned identifier "payloadDto".',
      'Use DTO for the acronym in owned identifier "responseDto".',
    ].sort(),
  )
})

test('uppercase names pass, while external access and quoted protocol keys stay valid', async () => {
  const { messages } = await lintFixture(`
    import { ExternalDto, ExternalDto as ExternalDTO, HttpStatus as ExternalHttpStatus } from 'third-party'

    type UserDTO = string
    interface SearchQO {
      'payloadDto': string
      find(resultVO: string): void
    }
    class IndexDTO {
      'payloadDto'!: string
      replaceChunkDTO(searchDTO: string): void {}
    }
    type ObjectShape = { 'valueDto': string; transformVO(requestDTO: string): void }
    type Result<TDTO> = TDTO
    const receiver = { replaceChunkDTO(searchDTO: string): void {} }
    const fooDTO = 1
    function parseDTO(inputDTO: string): string { return inputDTO }
    const mapper = (responseVO: string): string => responseVO
    const identifier = 'id'
    const identity = 'identity'
    const invoke = () => ExternalHttpStatus.OK
    const videoObject = { 'payloadDto': 'wire key' }
    const externalPayload = { 'payloadDto': videoObject.payloadDto, 'HttpStatus': ExternalHttpStatus.OK }
    const { 'payloadDto': payloadDTO } = externalPayload
    const imported = ExternalDto
    const importedAlias = ExternalDTO
  `)

  assert.deepEqual(messages, [])
})

test('a lowercase acronym embedded between camel-case words is diagnosed', async () => {
  const { messages } = await lintFixture(`
    type FooDtoBar = string
    interface QueryQoResult { value: string }
    class PayloadVoRecord { read(): void {} }
  `)

  assert.deepEqual(
    messages.map((message) => message.message).sort(),
    [
      'Use DTO for the acronym in owned identifier "FooDtoBar".',
      'Use QO for the acronym in owned identifier "QueryQoResult".',
      'Use VO for the acronym in owned identifier "PayloadVoRecord".',
    ].sort(),
  )
})

test('the collection syntax gate rejects all prohibited loop statements in Chunks', async () => {
  const samples = [
    'function visit() { for (let item = 0; item < 1; item += 1) {} }',
    'function visit(items: string[]) { for (const item of items) {} }',
    'function visit(items: Record<string, string>) { for (const item in items) {} }',
    'function visit(condition: boolean) { while (condition) {} }',
    'function visit(condition: boolean) { do {} while (condition) }',
  ]
  const results = await Promise.all(
    samples.map((source) =>
      lintFixture(source, {
        filePath: 'src/DocumentIndexes/Application/collection-gate-fixture.ts',
        ruleId: 'no-restricted-syntax',
      }),
    ),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    samples.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages.map((message) => message.message)),
    samples.map(() => ['Chunks collection handling must use map, filter, or flatMap.']),
  )
})

test('the collection syntax gate also covers source, tests, and ESLint configuration files', async () => {
  const filePaths = [
    'src/Documents/Application/collection-gate-fixture.ts',
    'tests/Unit/Tooling/collection-gate-fixture.test.ts',
    'eslint.config.mjs',
  ]
  const sources = [
    'function visit() { for (let item = 0; item < 1; item += 1) {} }',
    'function visit(items) { for (const item of items) { void item } }',
    'function visit(items) { for (const item in items) { void item } }',
    'function visit(condition) { while (condition) { work() } }',
    'function visit(condition) { do { work() } while (condition) }',
  ]
  const fixtures = filePaths.flatMap((filePath) => sources.map((source) => ({ filePath, source })))
  const results = await Promise.all(
    fixtures.map((fixture) =>
      lintFixture(fixture.source, { filePath: fixture.filePath, ruleId: 'no-restricted-syntax' }),
    ),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    fixtures.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages.map((message) => message.message)),
    fixtures.map(() => ['Collection handling must use map, filter, or flatMap.']),
  )
})

test('layout-only autofix leaves while and do-while statements for lint to reject', async () => {
  const source = 'while(condition){work()};do{work()}while(condition)\n'
  const { output, messages } = await lintFixture(source, {
    filePath: 'src/DocumentIndexes/Application/collection-gate-fixture.ts',
    fix: true,
    ruleId: 'no-restricted-syntax',
  })

  assert.match(output, /while\s*\(/)
  assert.match(output, /do\s*\{/)
  assert.deepEqual(
    messages.map((message) => message.message),
    [
      'Chunks collection handling must use map, filter, or flatMap.',
      'Chunks collection handling must use map, filter, or flatMap.',
    ],
  )
})

test('layout-only autofix leaves acronym naming errors for lint to reject', async () => {
  const source = 'type UserDto=string\n'
  const { output, messages } = await lintFixture(source, { fix: true })

  assert.equal(output.includes('UserDto'), true)
  assert.deepEqual(
    messages.map((message) => message.message),
    ['Use DTO for the acronym in owned identifier "UserDto".'],
  )
})

test('async reduce and forEach callbacks are rejected in source, Chunks, tests, and configuration', async () => {
  const filePaths = [
    'src/DocumentIndexes/Application/collection-gate-fixture.ts',
    'src/DocumentIndexes/Application/collection-gate-fixture.ts',
    'tests/Unit/Tooling/collection-gate-fixture.test.ts',
    'eslint.config.mjs',
  ]
  const sources = [
    'items.reduce(async (previous, item) => { await previous; await save(item) }, Promise.resolve())',
    'items.forEach(async function (item) { await save(item) })',
    'items["reduce"](async (previous, item) => { await previous; await save(item) }, Promise.resolve())',
    'const saveItem = async (item) => save(item); items.forEach(saveItem)',
    'async function saveItem(item) { await save(item) } items.reduce(saveItem, Promise.resolve())',
    'const reduceItems = items.reduce; reduceItems(async (previous, item) => { await previous; await save(item) }, Promise.resolve())',
    'const { reduce: reduceItems } = items; reduceItems(async (previous, item) => { await previous; await save(item) }, Promise.resolve())',
    'const eachItem = items[`forEach`]; eachItem(async (item) => save(item))',
    'items?.forEach?.(async (item) => save(item))',
    'const saveItem = async (item) => save(item); const persist = saveItem; items.forEach(persist)',
    '(items.reduce as typeof items.reduce)(async (previous, item) => { await previous; await save(item) }, Promise.resolve())',
    'const eachItem = (items.forEach as typeof items.forEach)!; eachItem(async (item) => save(item))',
    'const saveItem = async (item) => save(item); const persist = saveItem satisfies typeof saveItem; items.forEach(persist)',
    'const saveItem = async (item) => save(item); items.forEach(saveItem as typeof saveItem)',
  ]
  const fixtures = filePaths.flatMap((filePath) => sources.map((source) => ({ filePath, source })))
  const results = await Promise.all(
    fixtures.map((fixture) =>
      lintFixture(fixture.source, { filePath: fixture.filePath, ruleId: 'local/no-async-collection-callback' }),
    ),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    fixtures.map(() => 1),
  )
})

test('async collection callbacks passed through call, apply, aliases, wrappers, and bind are rejected', async () => {
  const sources = [
    'items.reduce.call(items, async (previous, item) => { await previous; return save(item) }, Promise.resolve())',
    "items['forEach']['call'](items, async (item) => save(item))",
    'items.reduce?.call?.(items, async (previous, item) => { await previous; return save(item) }, Promise.resolve())',
    'items.forEach.apply(items, [async (item) => save(item)])',
    "items['forEach']['apply']?.(items, [async (item) => save(item)])",
    'const reduceItems = items.reduce; reduceItems.call(items, async (previous, item) => { await previous; return save(item) }, Promise.resolve())',
    'const reduceCall = items.reduce.call; reduceCall(items, async (previous, item) => { await previous; return save(item) }, Promise.resolve())',
    'const applyEach = items.forEach.apply; applyEach(items, [async (item) => save(item)])',
    '(items.reduce.call as typeof items.reduce.call)(items, async (previous, item) => { await previous; return save(item) }, Promise.resolve())',
    'const saveItem = async (item) => save(item); items.forEach.call(items, saveItem)',
    'items.forEach.bind(items, async (item) => save(item))()',
    "items['forEach']['bind']?.(items, async (item) => save(item))()",
    'const bindEach = items.forEach.bind; bindEach(items, async (item) => save(item))()',
    'const boundEach = items.forEach.bind(items); boundEach(async (item) => save(item))',
    'const boundCall = items.forEach.bind(items).call; boundCall(items, async (item) => save(item))',
    'const boundApply = items.forEach.bind(items).apply; boundApply(items, [async (item) => save(item)])',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    sources.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages[0]?.column),
    sources.map(
      (source) => (source.includes('saveItem') ? source.lastIndexOf('saveItem') : source.indexOf('async')) + 1,
    ),
  )
})

test('async callbacks in statically spread invocation arguments and chained binds are rejected', async () => {
  const sources = [
    'items.forEach(...[async (item) => save(item)])',
    'items.reduce(...[...[async (previous, item) => save(item)], Promise.resolve()])',
    'items.forEach.call(...[items, async (item) => save(item)])',
    'items.reduce.call(...[items, ...[async (previous, item) => save(item), Promise.resolve()]])',
    'items.forEach.apply(items, [...[async (item) => save(item)]])',
    'items.forEach.apply(...[items, [async (item) => save(item)]])',
    'const callbackArguments = [async (item) => save(item)]; items.forEach(...callbackArguments)',
    'const callbackArray = [async (item) => save(item)]; const callbackAlias = callbackArray; items.forEach.apply(items, callbackAlias)',
    'const invocationArguments = [items, async (item) => save(item)]; items.forEach.call(...invocationArguments)',
    'items.forEach.bind(...[items, async (item) => save(item)])()',
    'items.reduce.bind(items).bind(null, async (previous, item) => save(item))()',
    'items.forEach.bind(items, async (first) => save(first)).bind(null, async (later) => save(later))()',
    'items.reduce.bind(items).bind(null).bind(null, async (previous, item) => save(item))()',
    'const bindReducer = items.reduce.bind(items); const bindAgain = bindReducer.bind; bindAgain(null, async (previous, item) => save(item))()',
    'const boundArguments = [items, async (item) => save(item)]; items.forEach.bind(...boundArguments)()',
    'items.forEach.call(...[items, ...[async (item) => save(item)]])',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    sources.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages[0]?.column),
    sources.map((source) => source.indexOf('async') + 1),
  )
})

test('async callbacks added by statically ordered array mutations are rejected', async () => {
  const sources = [
    'const callbacks = []; callbacks.push(async (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = []; callbacks[0] = async (item) => save(item); items.forEach(...callbacks)',
    'const callbacks = []; const callbackAlias = callbacks; callbackAlias.push(async (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = []; const callbackAlias = callbacks; callbackAlias[0] = async (item) => save(item); items.forEach(...callbackAlias)',
    'const callbacks = []; callbacks.push(async (item) => save(item)); items.forEach.call(...[items, ...callbacks])',
    'const callbacks = []; callbacks.push(async (item) => save(item)); items.forEach.apply(items, callbacks)',
    'const callbacks = []; callbacks.push(async (item) => save(item)); items.forEach.bind(...[items, ...callbacks])()',
    'const callbacks = []; callbacks[0] = async (item) => save(item); items.forEach.call(items, ...callbacks)',
    'const callbacks = []; callbacks.push(...[...[async (item) => save(item)]]); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; callbacks.unshift(async (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = []; callbacks.push((item) => save(item)); callbacks[0] = async (item) => save(item); items.forEach(...callbacks)',
    'const callbacks = []; callbacks.push((item) => save(item)); callbacks.pop(); callbacks.unshift(async (item) => save(item)); items.forEach(...callbacks)',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    sources.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages[0]?.column),
    sources.map((source) => source.indexOf('async') + 1),
  )
})

test('array callback resolution uses call-time mutations and drops state after unknown mutations', async () => {
  const sources = [
    'const callbacks = []; callbacks.push((item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = []; callbacks[0] = (item) => save(item); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; items.forEach(...callbacks); callbacks.push(async (item) => save(item))',
    'const callbacks = [async (item) => save(item)]; callbacks.splice(0, 1, (item) => save(item)); items.forEach(...callbacks)',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    [0, 0, 0, 0],
  )
})

test('array callback resolution preserves async callbacks before later unknown mutations', async () => {
  const { messages } = await lintFixture(
    'const callbacks = [async (item) => save(item)]; items.forEach(...callbacks); callbacks.splice(0, 1, (item) => save(item))',
    { ruleId: 'local/no-async-collection-callback' },
  )

  assert.equal(messages.length, 1)
})

test('async callbacks remain detectable after statically modeled array mutators', async () => {
  const sources = [
    'const callbacks = []; callbacks.splice(0, 0, async (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; callbacks.splice(-1, 1, async (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.splice(1, 0, (other) => save(other)); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; const callbackAlias = callbacks; callbackAlias.splice(...[0, 0, ...[async (item) => save(item)]]); items.forEach(...callbackAlias)',
    'const callbacks = [(item) => save(item), async (item) => save(item)]; callbacks.reverse(); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; callbacks.fill(async (item) => save(item), -1); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item), (other) => save(other)]; callbacks.copyWithin(1, 0, 1); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; items.forEach.call(...[items, ...callbacks])',
    'const callbacks = [async (item) => save(item)]; items.forEach.apply(items, [...callbacks])',
    'const callbacks = [async (item) => save(item)]; items.forEach.bind(...[items, ...callbacks])()',
    'const callbacks = [async (item) => save(item)]; callbacks.splice(); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.sort(); items.forEach(...callbacks)',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    sources.map(() => 1),
  )
  assert.deepEqual(
    results.map((result) => result.messages[0]?.column),
    sources.map((source) => source.indexOf('async') + 1),
  )
})

test('default sort preserves a provably first async function callback', async () => {
  const source =
    'const callbacks = [async function (item) { await save(item) }, function (item) { save(item) }]; callbacks.sort(); items.forEach(...callbacks)'
  const { messages } = await lintFixture(source, { ruleId: 'local/no-async-collection-callback' })

  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.column, source.indexOf('async') + 1)
})

test('default sort keeps a provably earlier synchronous arrow ahead of async callbacks', async () => {
  const { messages } = await lintFixture(
    'const callbacks = [(item) => save(item), async function (other) { await save(other) }]; callbacks.sort(); items.forEach(...callbacks)',
    { ruleId: 'local/no-async-collection-callback' },
  )

  assert.equal(messages.length, 0)
})

test('the async callback gate resolves only direct synchronous no-argument helper mutations', async () => {
  const cases = [
    {
      source:
        'const callbacks = []; function add() { callbacks.push(async (item) => save(item)) } add(); items.forEach(...callbacks)',
      expected: 1,
    },
    {
      source:
        'const callbacks = []; function add() { callbacks.push((item) => save(item)) } add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; function add() { callbacks.push(async (item) => save(item)) } items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; function add() { callbacks.push(async (item) => save(item)) } items.forEach(...callbacks); add()',
      expected: 0,
    },
    {
      source:
        'const callbacks = [async (item) => save(item)]; function clear() { callbacks.pop(); clear() } clear(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = [async (item) => save(item)]; function clear() { callbacks.pop(); maybeClearMore() } clear(); items.forEach(...callbacks)',
      expected: 0,
    },
  ]
  const results = await Promise.all(
    cases.map(({ source }) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    cases.map(({ expected }) => expected),
  )
})

test('the async callback gate resolves local function-variable helper mutations', async () => {
  const cases = [
    {
      source:
        'const callbacks = []; const add = function () { callbacks.push(async (item) => save(item)) }; add(); items.forEach(...callbacks)',
      expected: 1,
    },
    {
      source:
        'const callbacks = []; const add = () => { callbacks.push(async (item) => save(item)) }; add(); items.forEach(...callbacks)',
      expected: 1,
    },
    {
      source:
        'const callbacks = []; const add = () => callbacks.push(async (item) => save(item)); add(); items.forEach(...callbacks)',
      expected: 1,
    },
    {
      source:
        'const callbacks = []; const add = function () { callbacks.push((item) => save(item)) }; add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = () => { callbacks.push((item) => save(item)) }; add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = () => callbacks.push((item) => save(item)); add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = function () { callbacks.push(async (item) => save(item)) }; items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = () => callbacks.push(async (item) => save(item)); items.forEach(...callbacks); add()',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = function () { callbacks.push(async (item) => save(item)); add() }; add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; let add = function () { callbacks.push(async (item) => save(item)) }; add = clear; add(); items.forEach(...callbacks)',
      expected: 0,
    },
    {
      source:
        'const callbacks = []; const add = function () { callbacks.push(async (item) => save(item)) }; const addAlias = add; addAlias(); items.forEach(...callbacks)',
      expected: 0,
    },
  ]
  const results = await Promise.all(
    cases.map(({ source }) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    cases.map(({ expected }) => expected),
  )
})

test('array mutator resolution allows sync results and does not reuse state across scopes or unknown indices', async () => {
  const sources = [
    'const callbacks = []; callbacks.splice(0, 0, (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.splice(0, 1, (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item), async (other) => save(other)]; callbacks.splice(1); items.forEach(...callbacks)',
    'const callbacks = [(item) => save(item)]; callbacks.reverse(); callbacks.fill((item) => save(item)); callbacks.copyWithin(0, 0, 1); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.splice(dynamicStart, 1, (item) => save(item)); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.fill((item) => save(item), dynamicStart); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.copyWithin(dynamicTarget, 0); items.forEach(...callbacks)',
    'const callbacks = [async (item) => save(item)]; callbacks.sort((left, right) => compare(left, right)); items.forEach(...callbacks)',
  ]
  const results = await Promise.all(
    sources.map((source) => lintFixture(source, { ruleId: 'local/no-async-collection-callback' })),
  )

  assert.deepEqual(
    results.map((result) => result.messages.length),
    sources.map(() => 0),
  )
})

test('array mutation inside a later nested function does not alter the earlier callback snapshot', async () => {
  const { messages } = await lintFixture(
    'const callbacks = [async (item) => save(item)]; function clear() { callbacks.pop() } items.forEach(...callbacks); clear()',
    { ruleId: 'local/no-async-collection-callback' },
  )

  assert.equal(messages.length, 1)
})

test('the async callback gate allows synchronous call and apply callbacks and ignores dynamic call shapes', async () => {
  const { messages } = await lintFixture(
    `
      items.reduce.call(items, (total, item) => total + item, 0)
      items.forEach.apply(items, [(item) => save(item)])
      items.forEach.bind(items, (item) => save(item))()
      const reduceCall = items.reduce.call
      reduceCall(items, (total, item) => total + item, 0)
      const applyEach = items.forEach.apply
      applyEach(items, [(item) => save(item)])
      const boundEach = items.forEach.bind(items)
      boundEach((item) => save(item))
      const boundCall = items.forEach.bind(items).call
      boundCall(items, (item) => save(item))
      const boundApply = items.forEach.bind(items).apply
      boundApply(items, [(item) => save(item)])
      items.forEach(...[(item) => save(item)])
      items.forEach.call(...[items, (item) => save(item)])
      items.forEach.apply(...[items, [...[(item) => save(item)] ]])
      items.forEach.bind(...[items, (item) => save(item)])()
      items.reduce.bind(items).bind(null, (total, item) => total + item)()
      items.forEach.call(...unknownInvocationArguments, async () => save('ambiguous'))
      items.forEach.apply(items, [...unknownCallbackArguments, async () => save('ambiguous')])
      items.forEach.bind(items, ...unknownBoundArguments, async () => save('ambiguous'))()
      items.reduce.apply(items, callbackArguments)
      const custom = { call: (receiver, callback) => callback() }
      custom.call(items, async () => save('custom'))
    `,
    { ruleId: 'local/no-async-collection-callback' },
  )

  assert.deepEqual(messages, [])
})

test('the async callback gate preserves ordinary collection operations and recursion', async () => {
  const { messages } = await lintFixture(
    `
      const sum = items.reduce((total, item) => total + item, 0)
      items.forEach(function (item) { save(item) })
      const saveItem = (item) => save(item)
      items.forEach(saveItem)
      const reduceItems = items.reduce
      reduceItems((total, item) => total + item, 0)
      const { forEach: eachItem } = items
      eachItem((item) => save(item))
      const requests = items.map(async (item) => save(item))
      const custom = (callback) => callback()
      custom(async () => save('custom'))
      function visit(node) { return node.child ? visit(node.child) : node }
    `,
    { ruleId: 'local/no-async-collection-callback' },
  )

  assert.deepEqual(messages, [])
})

test('layout-only autofix retains async callback violations for format to reject', async () => {
  const source = 'items.forEach(async(item)=>save(item))\n'
  const { output, messages } = await lintFixture(source, {
    fix: true,
    ruleId: 'local/no-async-collection-callback',
  })

  assert.match(output, /forEach\(async/)
  assert.equal(messages.length, 1)
})
