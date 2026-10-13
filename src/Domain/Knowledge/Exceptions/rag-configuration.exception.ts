export class RagConfigurationException extends Error {
  constructor() {
    super('The RAG service is not configured correctly')
    this.name = 'RagConfigurationException'
  }
}
