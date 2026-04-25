'use strict';

// Generates public/stamp_test.pdf with dummy data to verify all stamp positions.
// Run: node testReport.js

const { buildPDF } = require('./lib/generateReport');
const fs = require('fs');
const path = require('path');

const mewp = {
  machine_ref: 'TEST-001',
};

const sheet = {
  week_commencing: '2026-04-21',
  supervisor_signoff_1_date: '2026-04-27',
  supervisor_signoff_1_name: 'J. Smith',
};

// Visual checks 1-28: all pass on Mon, all fail on Sat
const summaryByItem = {};
for (let i = 1; i <= 28; i++) {
  summaryByItem[i] = { mon_result: 'pass', sat_result: 'fail' };
}
// Function checks 29-43: pass ground / fail platform for Mon; fail both for Sat
for (let i = 29; i <= 43; i++) {
  summaryByItem[i] = {
    mon_ground_result: 'pass',
    mon_platform_result: 'fail',
    sat_ground_result: 'fail',
    sat_platform_result: 'pass',
  };
}

const operatorsByDay = {
  Mon: { operator_name: 'Alice Worker', daily_status: 'ok' },
  Sat: { operator_name: 'Bob Builder', daily_status: 'fault' },
};

buildPDF({ mewp, sheet, summaryByItem, operatorsByDay })
  .then(buf => {
    const out = path.join(__dirname, 'public', 'stamp_test.pdf');
    fs.writeFileSync(out, buf);
    console.log('Written:', out);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
