#!/usr/bin/env node
const jwt = require('jsonwebtoken');
const axios = require('axios');

const secret = 'change_me_access';
const token = jwt.sign(
  { sub: '526f95ddd9e83e6fd76a4221', phone: '9826594326' },
  secret,
  { expiresIn: '1h' }
);

const testSms = 'Hi, Your Blitz delivery is out for delivery. Driver: Rajesh Contact: 9876543210 Track: bit.ly/track123';

console.log('[Test] Sending SMS to backend...');
console.log('[Test] Token:', token.substring(0, 20) + '...');

axios.post('http://localhost:5000/api/v1/sms/receive', 
  { smsText: testSms, senderPhone: '+919876543210' },
  { headers: { Authorization: `Bearer ${token}` } }
)
.then(res => {
  console.log('✅ Success!');
  console.log(JSON.stringify(res.data, null, 2));
})
.catch(err => {
  console.log('❌ Error:', err.response?.status);
  console.log(JSON.stringify(err.response?.data || { error: err.message }, null, 2));
  process.exit(1);
});
