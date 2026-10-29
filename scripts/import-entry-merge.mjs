const sourceIdentity = (entry) => `${entry.sourceType}\0${entry.sourceKey}\0${entry.sourcePath}`

export const mergeDiscoveredEntries = (existingEntries, discoveredEntries) => {
  const existingBySource = new Map(existingEntries.map((entry) => [sourceIdentity(entry), entry]))
  const discoveredBySource = new Map(discoveredEntries.map((entry) => [sourceIdentity(entry), entry]))

  const mergedExisting = existingEntries.map((existing) => {
    const discovered = discoveredBySource.get(sourceIdentity(existing))

    if (!discovered) return existing

    return {
      ...existing,
      ...discovered,
      ...(Object.hasOwn(existing, 'title') ? { title: existing.title } : {}),
      ...(Object.hasOwn(existing, 'payload') ? { payload: existing.payload } : {}),
      isEntry: existing.isEntry,
      alwaysIncludeFullContent: existing.alwaysIncludeFullContent,
    }
  })

  const newDiscoveries = discoveredEntries.filter((discovered) => !existingBySource.has(sourceIdentity(discovered)))

  return [...mergedExisting, ...newDiscoveries]
}
