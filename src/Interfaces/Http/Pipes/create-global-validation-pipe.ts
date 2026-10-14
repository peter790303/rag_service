import { ValidationPipe } from '@nestjs/common'

export const createGlobalValidationPipe = (): ValidationPipe =>
  new ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: 422 })
