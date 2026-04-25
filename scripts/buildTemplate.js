'use strict';

const { createTemplate } = require('../lib/createTemplate');

createTemplate().catch(err => { console.error(err); process.exit(1); });
