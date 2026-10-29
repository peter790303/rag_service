import { rename } from 'node:fs/promises'

export const runWithDefaultManifestArchive = async (work, manifestPath, isDefaultManifest) => {
  const result = await work()

  if (isDefaultManifest) await rename(manifestPath, `${manifestPath}.completed`)

  return result
}
