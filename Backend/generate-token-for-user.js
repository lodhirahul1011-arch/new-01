#!/usr/bin/env node

/**
 * Generate JWT token for a specific phone number
 * Usage: node generate-token-for-user.js <phone>
 * Example: node generate-token-for-user.js 9826594326
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { env } = require('./src/config/env');

const phone = process.argv[2] || '9826594326';

// Create a deterministic user ID based on phone (for testing)
const hash = require('crypto').createHash('md5').update(phone).digest('hex').substring(0, 24);
const testUserId = new mongoose.Types.ObjectId(hash);

const payload = {
  sub: testUserId.toString(),
  userId: testUserId.toString(),
  id: testUserId.toString(),
  email: `user_${phone}@test.local`,
  phone: phone,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
};

const token = jwt.sign(payload, env.JWT_ACCESS_SECRET);

console.log('\n' + '='.repeat(70));
console.log('JWT TOKEN FOR PHONE: ' + phone);
console.log('='.repeat(70) + '\n');

console.log('🔐 Token:');
console.log(token);
console.log('\n');

console.log('📋 Token Details:');
console.log('  Phone:', phone);
console.log('  User ID:', testUserId.toString());
console.log('  Email: user_' + phone + '@test.local');
console.log('  Expires in: 24 hours');
console.log('\n');

console.log('✅ Usage in test-sms-api.js:');
console.log(`  Replace testToken with: "${token}"`);
console.log('\n');

console.log('✅ Usage in curl:');
console.log(`  curl -X POST http://localhost:5000/api/v1/sms/receive \\`);
console.log(`    -H "Authorization: Bearer ${token}" \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{`);
console.log(`      "smsText": "Hi, your order is out for delivery with Blitz",`);
console.log(`      "senderPhone": "+919999999999",`);
console.log(`      "messageId": "test_123"`);
console.log(`    }'`);
console.log('\n');

console.log('='.repeat(70) + '\n');
