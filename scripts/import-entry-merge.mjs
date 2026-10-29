const sourceIdentity = (entry) => `${entry.sourceType}\0${entry.sourceKey}\0${entry.sourcePath}`

export const mergeDiscoveredEntries = (existingEntries, discoveredEntries) => {
  const existingBySource = new Map(existingEntries.map((entry) => [sourceIdentity(entry), entry]))
  const discoveredBySource = new Map(discoveredEntries.map((entry) => [sourceIdentity(entry), entry]))
  const knowledgeBaseIdByProject = new Map()

  existingEntries.forEach((entry) => {
    const existingId = knowledgeBaseIdByProject.get(entry.projectId)

    if (existingId !== undefined && existingId !== entry.knowledgeBaseId) {
      throw new Error(`Conflicting knowledgeBaseId values for project ${entry.projectId}`)
    }

    knowledgeBaseIdByProject.set(entry.projectId, entry.knowledgeBaseId)
  })

  const mergedExisting = existingEntries.map((existing) => {
    const discovered = discoveredBySource.get(sourceIdentity(existing))

    if (!discovered) return existing

    const destinationKnowledgeBaseId = knowledgeBaseIdByProject.get(discovered.projectId)

    return {
      ...existing,
      ...discovered,
      ...(destinationKnowledgeBaseId === undefined ? {} : { knowledgeBaseId: destinationKnowledgeBaseId }),
      ...(Object.hasOwn(existing, 'title') ? { title: existing.title } : {}),
      ...(Object.hasOwn(existing, 'payload') ? { payload: existing.payload } : {}),
      isEntry: existing.isEntry,
      alwaysIncludeFullContent: existing.alwaysIncludeFullContent,
    }
  })

  const newDiscoveries = discoveredEntries
    .filter((discovered) => !existingBySource.has(sourceIdentity(discovered)))
    .map((discovered) => {
      const knowledgeBaseId = knowledgeBaseIdByProject.get(discovered.projectId)

      return knowledgeBaseId === undefined ? discovered : { ...discovered, knowledgeBaseId }
    })

  return [...mergedExisting, ...newDiscoveries]
}
