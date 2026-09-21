#!/usr/bin/env node

/**
 * Test SMS API with curl
 * This sends a test SMS to the backend API
 */

const http = require('http');
const querystring = require('querystring');

// Test token for phone 9826594326
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1MjY0Zjk1ZGQ5ZTgzZTZmZDc2NDQyMTciLCJwaG9uZSI6Ijk4MjY1OTQzMjYiLCJleHAiOjE3NzUyMTI4MDQsImlhdCI6MTc3NTEyNjQwNH0.cwBLezxJ4axGQt8dNwRY3UG98WiUFI95goEbtF_yH9A';

const smsTestData = {
  smsText: "Hi SHEENA YADAV. Your order from ZARA with ID ITX32221219914700100 is Out for Delivery with Blitz and will reach you before 9 PM today.",
  senderPhone: "+919876543210",
  messageId: "test_" + Date.now()
};

const postData = JSON.stringify(smsTestData);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/sms/receive',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${testToken}`
  }
};

console.log('\n' + '='.repeat(60));
console.log('Testing SMS API');
console.log('='.repeat(60) + '\n');

console.log('📤 Sending test SMS to: http://localhost:5000/api/v1/sms/receive\n');
console.log('📝 Request Details:');
console.log('  Method: POST');
console.log('  URL: /api/v1/sms/receive');
console.log('  Token:', testToken.substring(0, 50) + '...');
console.log('  Data:', smsTestData);
console.log('\n');

const req = http.request(options, res => {
  let data = '';

  res.on('data', chunk => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📊 Response:');
    console.log(`  Status: ${res.statusCode}`);
    console.log(`  Headers: ${JSON.stringify(res.headers)}`);
    console.log('\n');
    
    try {
      const parsed = JSON.parse(data);
      console.log('📄 Response Body:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('📄 Response Body (raw):');
      console.log(data);
    }

    console.log('\n' + '='.repeat(60));
    
    if (res.statusCode === 200 || (res.statusCode === 201)) {
      console.log('✅ SUCCESS - SMS was processed!');
      console.log('\nNext steps:');
      console.log('1. Check MongoDB:\n   db.sms_logs.find()');
      console.log('2. Check analytics screen in app');
    } else if (res.statusCode === 401) {
      console.log('❌ AUTH ERROR - Token invalid or user not found');
      console.log('\nFix: Create a test user in database');
      console.log('  node setup-test-user.js');
    } else {
      console.log('❌ ERROR - Check response above');
    }
    console.log('='.repeat(60) + '\n');
  });
});

req.on('error', error => {
  console.error('❌ Request Error:', error.message);
  console.log('\nMake sure:');
  console.log('1. Backend is running: cd backend && npm start');
  console.log('2. MongoDB is running');
  console.log('3. Port 5000 is not blocked');
});

req.write(postData);
req.end();
