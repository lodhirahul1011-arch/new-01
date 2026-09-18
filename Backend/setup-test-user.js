#!/usr/bin/env node

/**
 * Create test user for SMS testing
 * Run: node setup-test-user.js
 */

const mongoose = require('mongoose');

// Load models
const User = require('./src/models/User');
const { env } = require('./src/config/env');

const MONGO_URI = env.MONGO_URI || 'mongodb://localhost:27017/dvaari';

async function setupTestUser() {
  console.log('\n' + '='.repeat(60));
  console.log('Setting up test user for SMS testing');
  console.log('='.repeat(60) + '\n');

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Create test user
    console.log('👤 Creating test user...');
    let testUser = await User.findOne({ email: 'test@dvaari.dev' });

    if (!testUser) {
      testUser = new User({
        name: 'Test User',
        email: 'test@dvaari.dev',
        phone: '+919999999999',
        isVerified: true,
        // primaryHomeId can be optional - will use user's own _id as homeId if not set
      });
      await testUser.save();
      console.log(`✅ Created user: ${testUser._id}\n`);
    } else {
      console.log(`✅ Test user already exists: ${testUser._id}\n`);
    }

    console.log('📋 Test User Details:');
    console.log(`  User ID: ${testUser._id}`);
    console.log(`  Email: ${testUser.email}`);
    console.log(`  Phone: ${testUser.phone}\n`);

    console.log('✅ Setup complete! You can now:');
    console.log('\n1. Generate a token for this user:');
    console.log('   node generate-test-token.js\n');
    console.log('2. Use the token in API calls to test SMS saving\n');
    console.log('3. Check database:\n');
    console.log('   mongosh dvaari');
    console.log('   db.sms_logs.find()');
    console.log('   db.users.findOne({email: "test@dvaari.dev"})\n');

    await mongoose.connection.close();
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupTestUser();

