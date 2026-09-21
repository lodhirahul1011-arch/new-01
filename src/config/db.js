const mongoose = require('mongoose');
const { logs } = require('../utils/logger');

async function connectDB(mongoUri) {
  if (!mongoUri) throw new Error('Mongo URI is required');

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  logs.info('[DB] MongoDB connected');
}

module.exports = { connectDB };
