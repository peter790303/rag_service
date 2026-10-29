import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { load as loadYaml } from 'js-yaml'

export const sourceType = 'obsidian'

const knowledgeBaseIdFor = (projectId, sourceKey) => {
  const bytes = createHash('sha256').update(`rag-service:obsidian:${projectId}:${sourceKey}`).digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const listMarkdownFiles = async (root) => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })

  return entries
    .map((entry) => ({ entry, sourcePath: relative(root, resolve(entry.parentPath, entry.name)) }))
    .filter(
      ({ entry, sourcePath }) =>
        entry.isFile() &&
        sourcePath.split(sep).every((segment) => !segment.startsWith('.')) &&
        entry.name.toLowerCase().endsWith('.md'),
    )
    .map(({ sourcePath }) => sourcePath.split(sep).join('/'))
    .sort()
}

const contextDirectories = (paths) =>
  new Set(
    paths
      .filter((sourcePath) => sourcePath.split('/').at(-1) === 'CONTEXT.md')
      .map((sourcePath) => sourcePath.split('/').slice(0, -1).join('/')),
  )

const contextProjectIdentities = async (sourceKey, directories) => {
  const identities = new Map()
  const contextFiles = []

  await [...directories].reduce(
    (previous, contextDirectory) =>
      previous.then(async () => {
        const sourcePath = [contextDirectory, 'CONTEXT.md'].filter(Boolean).join('/')
        const content = await readFile(resolve(sourceKey, sourcePath), 'utf8')
        const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)

        if (!frontmatter) {
          if (/^---(?:\r?\n|$)/.test(content)) throw new Error(`Invalid YAML frontmatter in ${sourcePath}`)

          contextFiles.push({ contextDirectory, projectId: null })

          return
        }

        const metadata = loadYaml(frontmatter[1])

        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
          throw new Error(`Invalid YAML frontmatter in ${sourcePath}`)

        if (!Object.hasOwn(metadata, 'project')) {
          contextFiles.push({ contextDirectory, projectId: null })

          return
        }

        if (typeof metadata.project !== 'string' || metadata.project.trim().length === 0)
          throw new Error(`CONTEXT.md project must be a non-empty string: ${sourcePath}`)

        contextFiles.push({ contextDirectory, projectId: metadata.project.trim() })
      }),
    Promise.resolve(),
  )

  contextFiles.forEach(({ contextDirectory, projectId }) => {
    if (projectId === null) return

    const existingDirectory = identities.get(projectId)

    if (existingDirectory !== undefined && existingDirectory !== contextDirectory) {
      throw new Error(`Duplicate CONTEXT.md project id "${projectId}" in ${existingDirectory} and ${contextDirectory}`)
    }

    identities.set(projectId, contextDirectory)
  })

  return new Map(contextFiles.map(({ contextDirectory, projectId }) => [contextDirectory, projectId]))
}

const nearestContextDirectory = (sourcePath, directories) =>
  [
    ...sourcePath
      .split('/')
      .slice(0, -1)
      .map((_, index, segments) => segments.slice(0, index + 1).join('/'))
      .reverse(),
    '',
  ].find((directory) => directories.has(directory))

const projectIdentityFor = ({ sourcePath, directories, contextProjects, projectId, projectName }) => {
  const contextDirectory = nearestContextDirectory(sourcePath, directories)

  if (contextDirectory === undefined) return { projectId, projectName }

  const canonicalProjectId = contextProjects.get(contextDirectory)

  if (canonicalProjectId) {
    return {
      projectId: canonicalProjectId,
      projectName: contextDirectory ? contextDirectory.split('/').at(-1) : projectName,
    }
  }

  const namespace = projectId.includes('/') ? projectId.slice(0, projectId.lastIndexOf('/')) : projectId
  const pathSlug = contextDirectory
    .split('/')
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))
    .filter(Boolean)
    .join('/')
  const pathHash = createHash('sha256').update(contextDirectory).digest('hex').slice(0, 16)
  const projectSlug = `${pathSlug || 'root'}-${pathHash}`

  return {
    projectId: `${namespace}/${projectSlug}`,
    projectName: contextDirectory ? contextDirectory.split('/').at(-1) : projectName,
  }
}

export const discoverMarkdownEntries = async ({
  vaultPath,
  projectId = 'worker/obsidian-worker',
  projectName = 'Worker Obsidian',
}) => {
  if (!vaultPath || !isAbsolute(vaultPath))
    throw new Error('OBSIDIAN_ROOT must be an absolute path accessible to the import process')

  const sourceKey = resolve(vaultPath)
  const paths = await listMarkdownFiles(sourceKey)
  const directories = contextDirectories(paths)
  const contextProjects = await contextProjectIdentities(sourceKey, directories)
  const discovered = paths.map((sourcePath) => {
    const identity = projectIdentityFor({ sourcePath, directories, contextProjects, projectId, projectName })

    return {
      ...identity,
      sourceType,
      knowledgeBaseId: knowledgeBaseIdFor(identity.projectId, sourceKey),
      sourceKey,
      sourcePath,
      title: sourcePath.slice(sourcePath.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
      isEntry: false,
      alwaysIncludeFullContent: false,
    }
  })

  if (paths.length === 0) throw new Error(`No Markdown files found in Obsidian vault: ${sourceKey}`)

  return discovered
}

export const isValidEntry = (entry) =>
  entry &&
  entry.sourceType === sourceType &&
  typeof entry.projectId === 'string' &&
  entry.projectId.length > 0 &&
  typeof entry.projectName === 'string' &&
  typeof entry.knowledgeBaseId === 'string' &&
  typeof entry.sourceKey === 'string' &&
  isAbsolute(entry.sourceKey) &&
  typeof entry.sourcePath === 'string' &&
  entry.sourcePath.length > 0 &&
  (entry.title === null || typeof entry.title === 'string') &&
  typeof entry.isEntry === 'boolean' &&
  typeof entry.alwaysIncludeFullContent === 'boolean'

export const resolveSourceFile = (entry) => {
  const root = resolve(entry.sourceKey)
  const file = resolve(root, entry.sourcePath)
  const fromRoot = relative(root, file)

  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Obsidian source path escapes its vault: ${entry.sourcePath}`)
  }

  return file
}

export const readSource = (entry) => readFile(resolveSourceFile(entry), 'utf8')
