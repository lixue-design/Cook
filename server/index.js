'use strict';

// CloudBase cloud-function entry. Build TypeScript before packaging and use
// handler `index.main`.
module.exports = require('./dist/src/cloud-function.js');
