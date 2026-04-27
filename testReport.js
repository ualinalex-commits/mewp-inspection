'use strict';

// Generates public/stamp_test.pdf with dummy data to verify all stamp positions.
// Run: node testReport.js

const { buildPDF } = require('./lib/generateReport');
const fs = require('fs');
const path = require('path');

const mewp = {
  machine_ref: 'TEST-001',
  serial_number: 'SN-2024-XYZ',
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
    tue_result: i % 3 === 0 ? 'fail' : 'pass',
    wed_result: 'pass',
    thu_result: 'pass',
    fri_result: i === 7 ? 'fail' : 'pass',
    sat_result: 'pass',
    sun_result: 'pass',
  };
}
// Function checks 29-43
for (let i = 29; i <= 43; i++) {
  summaryByItem[i] = {
    mon_ground_result: 'pass', mon_platform_result: 'pass',
    tue_ground_result: 'pass', tue_platform_result: 'pass',
    wed_ground_result: 'pass', wed_platform_result: 'pass',
    thu_ground_result: 'pass', thu_platform_result: 'pass',
    fri_ground_result: i === 30 ? 'fail' : 'pass', fri_platform_result: 'pass',
    sat_ground_result: 'pass', sat_platform_result: 'pass',
    sun_ground_result: 'pass', sun_platform_result: 'pass',
  };
}

const operatorsByDay = {
  Mon: { operator_name: 'Alice Worker',  pal_card_number: 'PAL00123', daily_status: 'ok',    inspection_date: '2026-04-21', submitted_at: '2026-04-21T07:42:00Z' },
  Tue: { operator_name: 'Bob Builder',   pal_card_number: 'PAL00456', daily_status: 'fault', inspection_date: '2026-04-22', submitted_at: '2026-04-22T08:15:00Z' },
  Wed: { operator_name: 'Carol Jones',   pal_card_number: 'PAL00789', daily_status: 'ok',    inspection_date: '2026-04-23', submitted_at: '2026-04-23T07:55:00Z' },
  Thu: { operator_name: 'Dave Smith',    pal_card_number: 'PAL00321', daily_status: 'ok',    inspection_date: '2026-04-24', submitted_at: '2026-04-24T08:00:00Z' },
  Fri: { operator_name: 'Eve Taylor',    pal_card_number: 'PAL00654', daily_status: 'fault', inspection_date: '2026-04-25', submitted_at: '2026-04-25T07:30:00Z' },
  // Saturday and Sunday intentionally omitted (no inspection those days)
};

const defectsByDay = {
  Tue: [
    {
      item_number: 9,
      defect_details: 'Small oil leak observed at base of engine — marked with tape',
      status: 'open',
      inspection_date: '2026-04-22',
    },
    {
      item_number: 21,
      defect_details: 'Platform gate latch stiff, requires two hands to close securely',
      status: 'reported',
      inspection_date: '2026-04-22',
    },
  ],
  Fri: [
    {
      item_number: 7,
      defect_details: 'Fuel level low — refuelled before operation commenced',
      status: 'closed',
      inspection_date: '2026-04-25',
    },
    {
      item_number: 30,
      defect_details: 'Emergency stop button on ground controls slow to reset',
      status: 'open',
      inspection_date: '2026-04-25',
    },
    {
      item_number: 26,
      defect_details: 'Load plate partially obscured by dirt — cleaned on site',
      status: 'repaired',
      inspection_date: '2026-04-25',
    },
  ],
};

buildPDF({ mewp, sheet, summaryByItem, operatorsByDay, defectsByDay })
  .then(buf => {
    const out = path.join(__dirname, 'public', 'stamp_test.pdf');
    fs.writeFileSync(out, buf);
    console.log('Written:', out);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
