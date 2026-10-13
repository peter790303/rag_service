type RetryPayload = {
  input: Record<string, unknown>
  executionState: Record<string, unknown> | null
}

/** Keep reusable progress separate from the original indexing input in the failed-job archive. */
export const packRetryPayload = (
  input: Record<string, unknown>,
  executionState: Record<string, unknown> | null,
): Record<string, unknown> => ({ format: 'rag-v1', input, executionState })

export const unpackRetryPayload = (payload: Record<string, unknown>): RetryPayload => {
  if (
    payload.format !== 'rag-v1' ||
    !payload.input ||
    typeof payload.input !== 'object' ||
    Array.isArray(payload.input)
  )
    return { input: payload, executionState: null }

  const state = payload.executionState

  return {
    input: payload.input as Record<string, unknown>,
    executionState:
      state && typeof state === 'object' && !Array.isArray(state) ? (state as Record<string, unknown>) : null,
  }
}
