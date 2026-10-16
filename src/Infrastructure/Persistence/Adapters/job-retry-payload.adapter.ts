type JobRetryPayload = {
  input: Record<string, unknown>
  executionState: Record<string, unknown> | null
}

export class JobRetryPayloadAdapter {
  static toExecutionRetryPayload(storedJobRetryPayload: Record<string, unknown>): JobRetryPayload {
    const retryInput = storedJobRetryPayload.input

    if (
      storedJobRetryPayload.format !== 'rag-v1' ||
      !retryInput ||
      typeof retryInput !== 'object' ||
      Array.isArray(retryInput)
    ) {
      return { input: storedJobRetryPayload, executionState: null }
    }

    const storedExecutionState = storedJobRetryPayload.executionState
    let executionState: Record<string, unknown> | null = null

    if (storedExecutionState && typeof storedExecutionState === 'object' && !Array.isArray(storedExecutionState)) {
      executionState = storedExecutionState as Record<string, unknown>
    }

    return { input: retryInput as Record<string, unknown>, executionState }
  }
}
