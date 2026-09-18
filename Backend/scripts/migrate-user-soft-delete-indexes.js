require('dotenv').config();

const mongoose = require('mongoose');

const { env } = require('../src/config/env');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');
const { logs } = require('../src/utils/logger');

async function dropIndexIfExists(collection, indexName) {
  const indexes = await collection.indexes();
  const exists = indexes.some(index => index.name === indexName);
  if (!exists) {
    logs.info('[MIGRATION][USER_SOFT_DELETE_INDEXES] index missing, skipping drop', { indexName });
    return;
  }

  await collection.dropIndex(indexName);
  logs.info('[MIGRATION][USER_SOFT_DELETE_INDEXES] dropped index', { indexName });
}

async function releaseExistingSoftDeletedCredentials() {
  const deletedUsers = await User.find({
    isDeleted: true,
    $or: [
      { email: { $type: 'string', $ne: '' } },
      { phone: { $type: 'string', $ne: '' } },
    ],
  }).select('_id email phone deletedEmail deletedPhone');

  for (const user of deletedUsers) {
    const tombstone = `deleted-${String(user._id)}-${Date.now()}`;
    const hadEmail = Boolean(user.email);
    const hadPhone = Boolean(user.phone);
    user.deletedEmail = user.deletedEmail || user.email || '';
    user.deletedPhone = user.deletedPhone || user.phone || '';
    user.email = hadEmail ? `${tombstone}@deleted.local` : '';
    user.phone = hadPhone ? `${tombstone}-${String(user.phone).replace(/[^\d+]/g, '')}` : '';
    await user.save();
  }

  logs.info('[MIGRATION][USER_SOFT_DELETE_INDEXES] released existing soft-deleted credentials', {
    count: deletedUsers.length,
  });
}

async function run() {
  try {
    await connectDB(env.MONGO_URI);
    const collection = User.collection;

    await releaseExistingSoftDeletedCredentials();
    await dropIndexIfExists(collection, 'email_1');
    await dropIndexIfExists(collection, 'phone_1');

    await User.createIndexes();
    logs.info('[MIGRATION][USER_SOFT_DELETE_INDEXES] active-user unique indexes created');
  } catch (error) {
    logs.error('[MIGRATION][USER_SOFT_DELETE_INDEXES] failed', {
      message: error.message,
      code: error.code,
    });
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
