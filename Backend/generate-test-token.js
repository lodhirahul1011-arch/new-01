#!/usr/bin/env node

/**
 * Generate test JWT token for development/testing
 * Run: node generate-test-token.js
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { env } = require('./src/config/env');

// Create a test user ID (valid MongoDB ObjectId)
const testUserId = new mongoose.Types.ObjectId();

const payload = {
  sub: testUserId.toString(),
  userId: testUserId.toString(),
  id: testUserId.toString(),
  email: 'test@example.com',
  phone: '+919999999999',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
};

const token = jwt.sign(payload, env.JWT_ACCESS_SECRET);

console.log('\n' + '='.repeat(60));
console.log('TEST JWT TOKEN GENERATED');
console.log('='.repeat(60) + '\n');

console.log('Token:');
console.log(token);
console.log('\n');

console.log('Token Details:');
console.log('  User ID:', testUserId.toString());
console.log('  Email: test@example.com');
console.log('  Phone: +919999999999');
console.log('  Expires in: 24 hours');
console.log('  Secret used: ' + env.JWT_ACCESS_SECRET);
console.log('\n');

console.log('Usage in API requests:');
console.log('  Header: Authorization: Bearer ' + token);
console.log('\n');

console.log('Usage in test scripts:');
console.log(`  const testToken = "${token}";`);
console.log('\n');

console.log('='.repeat(60) + '\n');

