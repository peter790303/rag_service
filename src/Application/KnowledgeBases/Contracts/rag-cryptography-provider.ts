export abstract class RagCryptographyProvider {
  abstract sha256(value: string): string

  abstract generateIdempotencyKey(): string

  abstract generateLeaseToken(): string
}
