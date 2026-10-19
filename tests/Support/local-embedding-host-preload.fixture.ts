import assert from 'node:assert/strict'
import { isMainThread } from 'node:worker_threads'

assert.ok(isMainThread, 'Host preload must not execute inside embedding workers')
