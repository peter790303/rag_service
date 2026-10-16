export class ServiceConfigurationException extends Error {
  readonly code = 'SERVICE_CONFIGURATION_INVALID'

  constructor() {
    super('The RAG service is not configured correctly')
    this.name = 'ServiceConfigurationException'
  }
}
