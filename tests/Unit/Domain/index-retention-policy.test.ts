import assert from 'node:assert/strict'
import test from 'node:test'

import { IndexRetentionPolicy } from '../../../src/Domain/Knowledge/ValueObjects/index-retention-policy.js'

test('collects only indexes with no membership, job, or failed-job references', () => {
  assert.equal(IndexRetentionPolicy.mayCollect({ hasMembership: false, hasJob: false, hasFailedJob: false }), true)
  assert.equal(IndexRetentionPolicy.mayCollect({ hasMembership: true, hasJob: false, hasFailedJob: false }), false)
  assert.equal(IndexRetentionPolicy.mayCollect({ hasMembership: false, hasJob: true, hasFailedJob: false }), false)
  assert.equal(IndexRetentionPolicy.mayCollect({ hasMembership: false, hasJob: false, hasFailedJob: true }), false)
})
