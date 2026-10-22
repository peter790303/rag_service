import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'

test('invalidates old chunk plans for semantic concept boundaries without changing link extraction', () => {
  assert.equal(CHUNKING_PROFILE_VERSION, 'markdown-semantic-concepts-v3')
  assert.equal(RELATION_PROFILE_VERSION, 'markdown-links-anchored-v3-source-types')
})
