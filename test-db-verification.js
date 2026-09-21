#!/usr/bin/env node

/**
 * MongoDB Verification Script for SMS Delivery System
 * Run: node test-db-verification.js
 * 
 * This script connects to MongoDB and checks:
 * 1. SMS Logs collection and count
 * 2. Delivery Schedules collection and count
 * 3. Delivery Company Patterns
 * 4. Sample documents for inspection
 */

const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari';

// Colors for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function verifyDatabase() {
  log(colors.cyan, '\n========================================');
  log(colors.cyan, 'MongoDB SMS Delivery System Verification');
  log(colors.cyan, '========================================\n');

  log(colors.blue, `📊 Connecting to MongoDB: ${MONGO_URI}`);

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    log(colors.green, '✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // 1. Check SMS Logs Collection
    log(colors.blue, '📋 SMS Logs Collection:');
    try {
      const smsLogsCount = await db.collection('sms_logs').countDocuments();
      log(colors.green, `   ✅ Total SMS Logs: ${smsLogsCount}`);

      if (smsLogsCount > 0) {
        const sampleSms = await db
          .collection('sms_logs')
          .find()
          .limit(3)
          .toArray();

        sampleSms.forEach((sms, idx) => {
          log(colors.gray, `\n   Sample ${idx + 1}:`);
          log(colors.gray, `   - SMS ID: ${sms._id}`);
          log(colors.gray, `   - Company: ${sms.deliveryCompany}`);
          log(colors.gray, `   - Status: ${sms.status}`);
          log(colors.gray, `   - Parsed: ${sms.parsed}`);
          log(colors.gray, `   - Confidence: ${sms.confidenceScore}%`);
          log(colors.gray, `   - Sender: ${sms.senderPhone}`);
          log(colors.gray, `   - Created: ${new Date(sms.createdAt).toLocaleString()}`);
        });
      } else {
        log(colors.yellow, '   ⚠️  No SMS logs found yet');
      }
    } catch (err) {
      log(colors.red, `   ❌ Error: ${err.message}`);
    }

    // 2. Check Delivery Schedules Collection
    log(colors.blue, '\n\n📅 Delivery Schedules Collection:');
    try {
      const schedulesCount = await db.collection('delivery_schedules').countDocuments();
      log(colors.green, `   ✅ Total Schedules: ${schedulesCount}`);

      if (schedulesCount > 0) {
        const sampleSchedules = await db
          .collection('delivery_schedules')
          .find()
          .limit(3)
          .toArray();

        sampleSchedules.forEach((schedule, idx) => {
          log(colors.gray, `\n   Sample ${idx + 1}:`);
          log(colors.gray, `   - Schedule ID: ${schedule._id}`);
          log(colors.gray, `   - Group ID: ${schedule.scheduleGroupId}`);
          log(colors.gray, `   - Current Status: ${schedule.currentStatus}`);
          log(colors.gray, `   - SMS Count: ${schedule.smsCount}`);
          log(colors.gray, `   - Company: ${schedule.deliveryCompany}`);
          log(colors.gray, `   - Expected Delivery: ${schedule.expectedDeliveryDate || 'Not set'}`);
          log(colors.gray, `   - Status History Items: ${schedule.statusHistory?.length || 0}`);
          log(colors.gray, `   - Created: ${new Date(schedule.createdAt).toLocaleString()}`);
        });
      } else {
        log(colors.yellow, '   ⚠️  No delivery schedules found yet');
      }
    } catch (err) {
      log(colors.red, `   ❌ Error: ${err.message}`);
    }

    // 3. Check Delivery Company Patterns
    log(colors.blue, '\n\n🏢 Delivery Company Patterns:');
    try {
      const patternsCount = await db
        .collection('delivery_company_patterns')
        .countDocuments();
      log(colors.green, `   ✅ Total Patterns Configured: ${patternsCount}`);

      if (patternsCount > 0) {
        const patterns = await db
          .collection('delivery_company_patterns')
          .find()
          .toArray();

        patterns.forEach(pattern => {
          log(colors.gray, `\n   - ${pattern.companyName.toUpperCase()}`);
          log(colors.gray, `     Priority: ${pattern.priority}`);
          log(colors.gray, `     Keywords: ${pattern.companyKeywords.slice(0, 3).join(', ')}...`);
          log(colors.gray, `     Regex Patterns: ${pattern.regexPatterns.length}`);
        });
      }
    } catch (err) {
      log(colors.red, `   ❌ Error: ${err.message}`);
    }

    // 4. Check User Data (verify authentication works)
    log(colors.blue, '\n\n👥 User Data Sample:');
    try {
      const usersCount = await db.collection('users').countDocuments();
      log(colors.green, `   ✅ Total Users: ${usersCount}`);

      if (usersCount > 0) {
        const sampleUser = await db.collection('users').findOne();
        log(colors.gray, `   - Sample User ID: ${sampleUser._id}`);
        log(colors.gray, `   - Home ID: ${sampleUser.homeId}`);
      }
    } catch (err) {
      log(colors.yellow, `   ⚠️  Users collection check skipped: ${err.message}`);
    }

    // Summary
    log(colors.cyan, '\n\n========================================');
    log(colors.cyan, 'Verification Summary');
    log(colors.cyan, '========================================\n');

    const smsCount = await db.collection('sms_logs').countDocuments();
    const scheduleCount = await db.collection('delivery_schedules').countDocuments();
    const patternsCount = await db.collection('delivery_company_patterns').countDocuments();

    if (smsCount === 0 && scheduleCount === 0) {
      log(colors.yellow, '⚠️  No SMS data found in database yet');
      log(colors.yellow, '\nPossible issues:');
      log(colors.yellow, '1. useSmsDeliverySync() hook not integrated in app');
      log(colors.yellow, '2. No SMS being delivered to device');
      log(colors.yellow, '3. Authentication token not configured');
      log(colors.yellow, '4. Frontend not sending SMS to backend\n');
      log(colors.yellow, 'Try manually with:\n');
      log(colors.yellow, '   node backend/test-sms-delivery.js\n');
    } else {
      log(colors.green, '✅ SMS data is being saved to database!');
      log(colors.green, `   - SMS Logs: ${smsCount}`);
      log(colors.green, `   - Schedules: ${scheduleCount}\n`);
    }

    if (patternsCount === 0) {
      log(colors.red, '❌ No patterns configured! Run pattern seeder.');
    } else {
      log(colors.green, `✅ Patterns loaded: ${patternsCount} companies configured\n`);
    }

    await mongoose.connection.close();
    log(colors.green, '\n✅ Database verification complete\n');
  } catch (err) {
    log(colors.red, `\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

// Run verification
verifyDatabase();
