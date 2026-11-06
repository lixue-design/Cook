'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const calls = [];
let handledError = null;
const wx = {
  cloud: {
    callFunction({ name, data }) {
      calls.push({ name, data });
      if (data.payload.reason === 'fail') {
        return Promise.resolve({
          result: { ok: false, error: { code: 'UNAUTHENTICATED', message: '请先登录' } }
        });
      }
      return Promise.resolve({
        result: {
          ok: true,
          data: { id: 'request-1', status: 'cooling_off', submittedAt: '2026-07-31T12:00:00Z', scheduledDeleteAt: '2026-08-07T12:00:00Z' }
        }
      });
    }
  }
};

const filename = path.join(rootDir, 'services/compliance-api-remote.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  wx,
  Promise,
  Error,
  require(request) {
    if (request === '../config/auth-api') return { cloudFunctionName: 'cook-api' };
    if (request === './auth-state') return { handleApiError(error) { handledError = error; } };
    if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
    throw new Error(`unexpected require ${request}`);
  }
}, { filename });

async function main() {
  const request = await moduleStub.exports.createCancelRequest(' 不再使用 ');
  assert.equal(request.status, 'cooling_off');
  assert.equal(calls[0].name, 'cook-api');
  assert.equal(calls[0].data.action, 'account.cancelRequest.create');
  assert.equal(calls[0].data.payload.reason, '不再使用');
  await assert.rejects(
    () => moduleStub.exports.createCancelRequest('fail'),
    (error) => error.code === 'UNAUTHENTICATED'
  );
  assert.equal(handledError.code, 'UNAUTHENTICATED');
  console.log('compliance client verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
