import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'

test('preserves pipeline compatibility profiles when moving Markdown format conversion', () => {
  assert.equal(CHUNKING_PROFILE_VERSION, 'markdown-grounded-v2')
  assert.equal(RELATION_PROFILE_VERSION, 'markdown-links-anchored-v3-source-types')
})
