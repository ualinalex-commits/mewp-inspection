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

// Visual checks 1-28: rotate through pass/fail across all 7 days
const summaryByItem = {};
for (let i = 1; i <= 28; i++) {
  summaryByItem[i] = {
    mon_result: 'pass',
    tue_result: 'fail',
    wed_result: 'pass',
    thu_result: 'fail',
    fri_result: 'pass',
    sat_result: 'fail',
    sun_result: 'pass',
  };
}
// Function checks 29-43: alternating ground/platform results across all 7 days
for (let i = 29; i <= 43; i++) {
  summaryByItem[i] = {
    mon_ground_result: 'pass', mon_platform_result: 'fail',
    tue_ground_result: 'fail', tue_platform_result: 'pass',
    wed_ground_result: 'pass', wed_platform_result: 'pass',
    thu_ground_result: 'fail', thu_platform_result: 'fail',
    fri_ground_result: 'pass', fri_platform_result: 'fail',
    sat_ground_result: 'fail', sat_platform_result: 'pass',
    sun_ground_result: 'pass', sun_platform_result: 'pass',
  };
}

const operatorsByDay = {
  Mon: { operator_name: 'Alice Worker',  daily_status: 'ok' },
  Tue: { operator_name: 'Bob Builder',   daily_status: 'fault' },
  Wed: { operator_name: 'Carol Jones',   daily_status: 'ok' },
  Thu: { operator_name: 'Dave Smith',    daily_status: 'ok' },
  Fri: { operator_name: 'Eve Taylor',    daily_status: 'fault' },
  Sat: { operator_name: 'Frank Brown',   daily_status: 'ok' },
  Sun: { operator_name: 'Grace Wilson',  daily_status: 'ok' },
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
