export const parseImportOptions = (args) => {
  const manifestIndex = args.indexOf('--manifest')
  const sourceIndex = args.indexOf('--source')
  const positionalSource =
    args.find(
      (argument, index) =>
        (manifestIndex < 0 || index !== manifestIndex + 1) &&
        (sourceIndex < 0 || index !== sourceIndex + 1) &&
        !argument.startsWith('--'),
    ) ?? ''
  const flaggedSource = sourceIndex >= 0 ? args[sourceIndex + 1] : ''
  const sourceType = positionalSource || flaggedSource
  const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null

  if (
    !sourceType ||
    sourceType.startsWith('--') ||
    (flaggedSource && positionalSource && flaggedSource !== positionalSource) ||
    (sourceIndex >= 0 && (!flaggedSource || flaggedSource.startsWith('--'))) ||
    (manifestIndex >= 0 && (!manifestPath || manifestPath.startsWith('--')))
  ) {
    throw new Error('Usage: npm run import -- <sourceType> [--manifest <path>]')
  }

  return { sourceType, manifestPath }
}

export const shouldDiscoverVault = ({ sourceType, configuredRoot, explicitManifest }) =>
  sourceType === 'obsidian' && Boolean(configuredRoot) && !explicitManifest
