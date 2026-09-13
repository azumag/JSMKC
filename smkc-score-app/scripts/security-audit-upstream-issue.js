'use strict';

const singlePass = require('./security-audit-upstream-issue-single-pass');
const consistency = require('./security-audit-upstream-issue-consistency');

if (require.main === module) {
  consistency.main();
}

module.exports = {
  ...singlePass,
  ...consistency,
};
