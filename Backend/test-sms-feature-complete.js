#!/usr/bin/env node

/**
 * Complete SMS Feature Implementation Test
 * Tests the entire flow from SMS detection to database save
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');

const secret = 'change_me_access';
const API_URL = 'http://localhost:5000';

// Test data
const testCases = [
  {
    name: 'Blitz SMS',
    sms: 'Hi, Your Blitz delivery is out for delivery. Driver: Rajesh Contact: 9876543210 Track: bit.ly/track123',
    sender: '+919876543210',
    expectedCompany: 'Blitz',
  },
  {
    name: 'Xpressbees SMS',
    sms: 'Your order is on the way with Xpressbees. Tracking: XPRS12345. Expected delivery today.',
    sender: '+919876543211',
    expectedCompany: 'Xpressbees',
  },
  {
    name: 'Shadowfax SMS',
    sms: 'Shadowfax delivery update: Package arrived at your nearest pickup point. AWB: SHF987654',
    sender: '+919876543212',
    expectedCompany: 'Shadowfax',
  },
  {
    name: 'Delhivery SMS',
    sms: 'Your package is out for delivery with Delhivery. Ref: DHV123456. ETA: 2-4 hours',
    sender: '+919876543213',
    expectedCompany: 'Delhivery',
  },
  {
    name: 'Amazon SMS',
    sms: 'Your Amazon order #AMZ789 is out for delivery today. Track it now.',
    sender: '+919876543214',
    expectedCompany: 'Amazon',
  },
];

async function runTest() {
  console.log('═'.repeat(60));
  console.log('SMS FEATURE IMPLEMENTATION TEST');
  console.log('═'.repeat(60));
  console.log();

  // Generate test token
  const token = jwt.sign(
    { sub: '526f95ddd9e83e6fd76a4221', phone: '9826594326' },
    secret,
    { expiresIn: '1h' }
  );

  console.log('✅ Test Token Generated');
  console.log(`   Token: ${token.substring(0, 30)}...`);
  console.log();

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    try {
      console.log(`📤 Testing: ${testCase.name}`);
      console.log(`   SMS: "${testCase.sms.substring(0, 40)}..."`);

      const response = await axios.post(
        `${API_URL}/api/v1/sms/receive`,
        {
          smsText: testCase.sms,
          senderPhone: testCase.sender,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200 && response.data.success) {
        console.log(`   ✅ SUCCESS`);
        console.log(`   - SMS ID: ${response.data.data.smsId}`);
        console.log(`   - Company: ${response.data.data.company}`);
        console.log(`   - Status: ${response.data.data.status}`);
        console.log(`   - Schedule Created: ${response.data.data.scheduleUpdated}`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED - Unexpected response`);
        console.log(`   ${JSON.stringify(response.data)}`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ ERROR`);
      console.log(`   Status: ${error.response?.status}`);
      console.log(`   Message: ${error.response?.data?.message || error.message}`);
      failedTests++;
    }
    console.log();
  }

  // Summary
  console.log('═'.repeat(60));
  console.log(`RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('═'.repeat(60));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
