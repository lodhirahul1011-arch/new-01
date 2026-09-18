
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function findUser() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dvaari');
    
    console.log('\n🔍 Searching for user with phone: 9826594326\n');
    
    const user = await User.findOne({ phone: '9826594326' });
    
    if (user) {
      console.log('✅ User found!');
      console.log('  ID:', user._id);
      console.log('  Phone:', user.phone);
      console.log('  Email:', user.email);
      console.log('  Name:', user.name);
      console.log('\n');
      
      // Now generate token for this user
      const jwt = require('jsonwebtoken');
      const payload = {
        sub: user._id.toString(),
        userId: user._id.toString(),
        id: user._id.toString(),
        email: user.email,
        phone: user.phone,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };
      
      const token = jwt.sign(payload, 'change_me_access');
      
      console.log('🔐 Generated JWT Token:');
      console.log(token);
      console.log('\n');
      console.log('✅ Use this token in test-sms-api.js\n');
    } else {
      console.log('❌ User NOT found');
      console.log('\nAvailable users:');
      const allUsers = await User.find().select('_id phone email name');
      allUsers.forEach(u => {
        console.log(`  - ${u.phone || 'no phone'} | ${u.email || 'no email'} | ${u.name || 'no name'}`);
      });
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findUser();
