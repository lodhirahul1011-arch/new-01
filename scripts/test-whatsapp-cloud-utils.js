const assert = require('assert');
const crypto = require('crypto');

process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
const whatsapp = require('../src/services/whatsappCloud.service');

const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
const sig = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex')}`;
assert.strictEqual(whatsapp.verifyMetaSignature(raw, sig), true);
assert.strictEqual(whatsapp.verifyMetaSignature(raw, 'sha256=bad'), false);

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        metadata: { display_phone_number: '15550001111', phone_number_id: 'PHONE_NUMBER_ID' },
        contacts: [{ profile: { name: 'Test User' }, wa_id: '919876543210' }],
        messages: [{
          from: '919876543210',
          id: 'wamid.INBOUND1',
          timestamp: '1786200000',
          type: 'text',
          text: { body: 'Amazon order AB123 arriving tomorrow by 4 PM' },
        }],
        statuses: [{
          id: 'wamid.OUTBOUND1',
          recipient_id: '919876543210',
          status: 'delivered',
          timestamp: '1786200010',
        }],
      },
    }],
  }],
};

const events = whatsapp.extractWebhookEvents(payload);
assert.strictEqual(events.length, 2);
assert.strictEqual(events[0].kind, 'message');
assert.strictEqual(events[0].message.id, 'wamid.INBOUND1');
assert.strictEqual(whatsapp.messageText(events[0].message), 'Amazon order AB123 arriving tomorrow by 4 PM');
assert.strictEqual(events[1].kind, 'status');
assert.strictEqual(events[1].status.status, 'delivered');

assert.strictEqual(whatsapp.messageText({ type: 'button', button: { text: 'Confirm' } }), 'Confirm');
assert.strictEqual(whatsapp.messageText({ type: 'image' }), '');

console.log('WhatsApp Cloud API utility tests passed');
