#!/usr/bin/env node

/**
 * Quick SMS Delivery System Test
 * Run: node test-sms-delivery.js
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000';

// Sample test SMS messages
const testSmsMessages = [
  {
    name: 'Blitz SMS',
    text: 'Hi SHEENA YADAV. Your order from ZARA with ID ITX32221219914700100 is Out for Delivery with Blitz and will reach you before 9 PM today. Share the delivery code OTP to receive the order.',
    phone: '+919876543210',
  },
  {
    name: 'Xpressbees SMS',
    text: 'Hi, I\'m VINAY, your delivery agent (8860493390). I\'ll be delivering your order from AJIO (AWB: 13670518872065). Your Delivery Code: 500894. Please share this code before receiving.',
    phone: '+918888888888',
  },
  {
    name: 'Shadowfax SMS',
    text: 'Dear Devika dawar, This is regarding the delivery of your order of Trendyol from Myntra. Tracking id of the order is SF2025823664F. Please provide OTP - 5799 with rider to accept the delivery.',
    phone: '+919999999999',
  },
  {
    name: 'Non-Delivery SMS (should skip)',
    text: 'Hello, this is your bank calling about your account balance.',
    phone: '+917777777777',
  },
];

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testSmsDelivery() {
  log(colors.cyan, '\n========================================');
  log(colors.cyan, 'SMS Delivery System - Verification Test');
  log(colors.cyan, '========================================\n');

  // Get token (using a test token - will fail with 401 if not authenticated)
  const testToken = process.env.TEST_TOKEN || 'your_auth_token_here';

  log(colors.yellow, '⚠️  Note: This test requires a valid authentication token');
  log(colors.yellow, '   Set env variable: TEST_TOKEN=your_token\n');

  for (const testSms of testSmsMessages) {
    log(colors.blue, `\n📧 Testing: ${testSms.name}`);
    log(colors.blue, `   Message: "${testSms.text.substring(0, 60)}..."`);
    log(colors.blue, `   Phone: ${testSms.phone}`);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/sms/receive`,
        {
          smsText: testSms.text,
          senderPhone: testSms.phone,
          messageId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        {
          headers: {
            'Authorization': `Bearer ${testToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        log(colors.green, '   ✅ SUCCESS');
        log(colors.green, `   - SMS ID: ${response.data.data.smsId}`);
        log(colors.green, `   - Company: ${response.data.data.company}`);
        log(colors.green, `   - Status: ${response.data.data.status}`);
        log(colors.green, `   - Confidence: ${response.data.data.confidence}%`);
        log(colors.green, `   - Schedule Updated: ${response.data.data.scheduleUpdated}`);
        if (response.data.data.scheduleId) {
          log(colors.green, `   - Schedule ID: ${response.data.data.scheduleId}`);
        }
      } else {
        log(colors.red, '   ❌ FAILED - Response not successful');
        log(colors.red, `   Message: ${response.data.message}`);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        log(colors.red, '   ❌ FAILED - Authentication Error (401)');
        log(colors.red, '   Please provide valid authorization token');
      } else if (error.response?.status === 500) {
        log(colors.red, '   ❌ FAILED - Server Error (500)');
        log(colors.red, `   ${error.response.data?.message || error.message}`);
      } else if (error.code === 'ECONNREFUSED') {
        log(colors.red, '   ❌ FAILED - Cannot connect to server');
        log(colors.red, `   Make sure backend is running on ${API_BASE_URL}`);
        break;
      } else {
        log(colors.red, `   ❌ FAILED - ${error.message}`);
      }
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  log(colors.cyan, '\n\n========================================');
  log(colors.cyan, 'Test Complete');
  log(colors.cyan, '========================================\n');

  log(colors.yellow, 'Next steps to verify:');
  log(colors.yellow, '1. Check MongoDB for sms_logs documents');
  log(colors.yellow, '2. Check MongoDB for delivery_schedules documents');
  log(colors.yellow, '3. Test GET /api/v1/sms/deliveries/upcoming endpoint');
  log(colors.yellow, '4. Verify frontend integration with useSmsDeliverySync()\n');
}

// Run test
testSmsDelivery().catch(err => {
  log(colors.red, 'Error running test:', err.message);
  process.exit(1);
});
