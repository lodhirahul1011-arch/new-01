const assert = require('assert');
const mongoose = require('mongoose');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari-test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.BACKUP_ACCESS_VALIDITY_HOURS = process.env.BACKUP_ACCESS_VALIDITY_HOURS || '24';

const app = require('../src/app');
const AwayModeSetting = require('../src/models/AwayModeSetting');
const AwayModeEvent = require('../src/models/AwayModeEvent');
const BackupAssignment = require('../src/models/BackupAssignment');
const FamilyMember = require('../src/models/FamilyMember');
const User = require('../src/models/User');
const Delivery = require('../src/models/Delivery');
const AuditLog = require('../src/models/AuditLog');
const awayModeService = require('../src/services/awayMode.service');
const backupService = require('../src/services/backup.service');
const {
  toggleAwayModeSchema,
  updateAwayModeScheduleSchema,
  generateTemporaryCodeSchema,
} = require('../src/schemas/awayMode.schemas');
const {
  assignBackupSchema,
  listBackupAssignmentsQuerySchema,
} = require('../src/schemas/backup.schemas');

const homeId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const memberId = new mongoose.Types.ObjectId();

const awayStore = [];
const awayEvents = [];
const backupStore = [];
const auditStore = [];
const memberStore = [
  {
    _id: memberId,
    homeId,
    userId,
    name: 'Owner User',
    role: 'owner',
    accessLevel: 'full',
    status: 'active',
  },
];
const deliveryStore = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeId(value) {
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value && typeof value === 'object' && value._bsontype === 'ObjectId') return String(value);
  return value;
}

function getByPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj, path, value) {
  const keys = String(path).split('.');
  let cursor = obj;
  while (keys.length > 1) {
    const key = keys.shift();
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[0]] = value;
}

function compareScalar(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (actual instanceof Date || expected instanceof Date) {
    return new Date(actual).getTime() === new Date(expected).getTime();
  }
  return String(normalizeId(actual)) === String(normalizeId(expected));
}

function matchCondition(row, key, condition) {
  const actual = getByPath(row, key);

  if (condition instanceof RegExp) return compareScalar(actual, condition);
  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !(condition instanceof mongoose.Types.ObjectId)) {
    if ('$in' in condition) return condition.$in.some((entry) => compareScalar(actual, entry));
    if ('$exists' in condition) {
      const exists = actual !== undefined;
      if (exists !== Boolean(condition.$exists)) return false;
    }
    if ('$ne' in condition && compareScalar(actual, condition.$ne)) return false;
    if ('$eq' in condition && !compareScalar(actual, condition.$eq)) return false;
    if ('$gte' in condition && !(new Date(actual).getTime() >= new Date(condition.$gte).getTime())) return false;
    if ('$gt' in condition && !(new Date(actual).getTime() > new Date(condition.$gt).getTime())) return false;
    if ('$lt' in condition && !(new Date(actual).getTime() < new Date(condition.$lt).getTime())) return false;
    if ('$lte' in condition && !(new Date(actual).getTime() <= new Date(condition.$lte).getTime())) return false;
    return true;
  }

  return compareScalar(actual, condition);
}

function matches(row, query) {
  if (!query || Object.keys(query).length === 0) return true;
  if (query.$and) return query.$and.every((part) => matches(row, part));
  if (query.$or) return query.$or.some((part) => matches(row, part));
  return Object.entries(query).every(([key, condition]) => matchCondition(row, key, condition));
}

function wrapDoc(store, row) {
  if (!row) return null;
  const doc = row;
  doc.toObject = () => clone(doc);
  doc.save = async () => {
    doc.updatedAt = new Date();
    return doc;
  };
  return doc;
}

function buildFindOne(store, query) {
  const found = store.find((row) => matches(row, query)) || null;
  const chain = {
    select() {
      return this;
    },
    async lean() {
      return found ? clone(found) : null;
    },
    then(resolve, reject) {
      return Promise.resolve(found ? wrapDoc(store, found) : null).then(resolve, reject);
    },
  };
  return chain;
}

function buildFindMany(store, query) {
  const state = { rows: store.filter((row) => matches(row, query)).map((row) => wrapDoc(store, row)) };
  return {
    sort(spec) {
      const entries = Object.entries(spec || {});
      state.rows.sort((a, b) => {
        for (const [field, direction] of entries) {
          const av = getByPath(a, field);
          const bv = getByPath(b, field);
          const aValue = av instanceof Date ? av.getTime() : String(normalizeId(av) || '');
          const bValue = bv instanceof Date ? bv.getTime() : String(normalizeId(bv) || '');
          if (aValue < bValue) return direction === -1 ? 1 : -1;
          if (aValue > bValue) return direction === -1 ? -1 : 1;
        }
        return 0;
      });
      return this;
    },
    skip(count) {
      state.rows = state.rows.slice(count);
      return this;
    },
    limit(count) {
      state.rows = state.rows.slice(0, count);
      return this;
    },
    async lean() {
      return clone(state.rows);
    },
  };
}

AwayModeSetting.findOne = (query) => buildFindOne(awayStore, query);
AwayModeSetting.create = async (payload) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    ...clone(payload),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  awayStore.push(doc);
  return wrapDoc(awayStore, doc);
};
AwayModeSetting.updateOne = async (query, update) => {
  const row = awayStore.find((entry) => matches(entry, query));
  if (!row) return { modifiedCount: 0 };
  Object.entries(update.$set || {}).forEach(([key, value]) => setByPath(row, key, value));
  row.updatedAt = new Date();
  return { modifiedCount: 1 };
};

AwayModeEvent.create = async (payload) => {
  awayEvents.push(clone(payload));
  return payload;
};

BackupAssignment.findOne = (query) => buildFindOne(backupStore, query);
BackupAssignment.find = (query) => buildFindMany(backupStore, query);
BackupAssignment.countDocuments = async (query) => backupStore.filter((row) => matches(row, query)).length;
BackupAssignment.create = async (payload) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    ...clone(payload),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  backupStore.push(doc);
  return wrapDoc(backupStore, doc);
};
BackupAssignment.updateMany = async (query, update) => {
  let modifiedCount = 0;
  for (const row of backupStore) {
    if (matches(row, query)) {
      Object.entries(update.$set || {}).forEach(([key, value]) => setByPath(row, key, value));
      row.updatedAt = new Date();
      modifiedCount += 1;
    }
  }
  return { modifiedCount };
};
BackupAssignment.updateOne = async (query, update) => {
  const row = backupStore.find((entry) => matches(row, query));
  if (!row) return { modifiedCount: 0 };
  Object.entries(update.$set || {}).forEach(([key, value]) => setByPath(row, key, value));
  row.updatedAt = new Date();
  return { modifiedCount: 1 };
};

FamilyMember.findOne = (query) => buildFindOne(memberStore, query);
FamilyMember.create = async (payload) => {
  const doc = { _id: new mongoose.Types.ObjectId(), ...clone(payload), createdAt: new Date(), updatedAt: new Date() };
  memberStore.push(doc);
  return wrapDoc(memberStore, doc);
};

User.updateOne = async () => ({ modifiedCount: 1 });
Delivery.findOne = (query) => buildFindOne(deliveryStore, query);
AuditLog.create = async (payload) => {
  auditStore.push(clone(payload));
  return payload;
};

async function run() {
  assert.ok(app);
  const routerLayers = app._router && app._router.stack ? app._router.stack.map((layer) => String(layer.regexp || '')) : [];
  assert.ok(routerLayers.some((value) => value.includes('away-mode')));
  assert.ok(routerLayers.some((value) => value.includes('backup')));

  const schedulePayload = updateAwayModeScheduleSchema.parse({
    timezone: 'UTC',
    startTime: '00:00',
    endTime: '23:59',
    repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    preset: 'custom',
  });
  assert.strictEqual(schedulePayload.timezone, 'UTC');
  assert.throws(() => updateAwayModeScheduleSchema.parse({ timezone: 'UTC', startTime: '10:00', endTime: '09:00', repeatDays: ['mon'], preset: 'custom' }));

  const togglePayload = toggleAwayModeSchema.parse({ enabled: true });
  assert.strictEqual(togglePayload.enabled, true);

  const tempPayload = generateTemporaryCodeSchema.parse({ forceRegenerate: false });
  assert.strictEqual(tempPayload.forceRegenerate, false);

  const assignPayload = assignBackupSchema.parse({ guestName: 'Manasvi Rastogi' });
  assert.strictEqual(assignPayload.guestName, 'Manasvi Rastogi');

  const listPayload = listBackupAssignmentsQuerySchema.parse({ status: 'all', page: '1', limit: '10' });
  assert.strictEqual(listPayload.page, 1);
  assert.strictEqual(listPayload.limit, 10);

  const user = {
    _id: userId,
    primaryHomeId: homeId,
    name: 'Owner User',
    email: 'owner@example.com',
    phone: '+911234567890',
  };

  const firstOverview = await awayModeService.getOverview(user);
  assert.strictEqual(firstOverview.enabled, false);
  assert.strictEqual(firstOverview.schedule.startTime, '08:30');
  assert.strictEqual(firstOverview.temporaryCode.available, false);

  const savedSchedule = await awayModeService.saveSchedule(user, schedulePayload);
  assert.strictEqual(savedSchedule.scheduleLabel, '12:00 AM - 11:59 PM');

  const toggled = await awayModeService.toggleAwayMode(user, { enabled: true });
  assert.strictEqual(toggled.enabled, true);
  assert.strictEqual(toggled.modeStatus, 'active');

  const generatedCode = await awayModeService.generateTemporaryCodeForUser(user, { forceRegenerate: false });
  assert.match(generatedCode.code, /^\d{4}$/);
  assert.strictEqual(generatedCode.status, 'active');

  const awayOverview = await awayModeService.getOverview(user);
  assert.strictEqual(awayOverview.enabled, true);
  assert.strictEqual(awayOverview.modeStatus, 'active');
  assert.strictEqual(awayOverview.temporaryCode.available, true);
  assert.strictEqual(awayOverview.cards.videoRecording.value, 'Active');

  const backupOverview = await backupService.getOverview(user, {});
  assert.strictEqual(backupOverview.otp.code, generatedCode.code);
  assert.strictEqual(backupOverview.config.defaultValidityHours, 24);
  assert.strictEqual(Array.isArray(backupOverview.assignedBackupPersons), true);

  const assignment = await backupService.assignBackup(user, { guestName: 'Manasvi Rastogi' });
  assert.strictEqual(assignment.status, 'active');
  assert.strictEqual(assignment.guestName, 'Manasvi Rastogi');
  assert.strictEqual(backupStore.length, 1);

  let duplicateError = null;
  try {
    await backupService.assignBackup(user, { guestName: 'Manasvi Rastogi' });
  } catch (err) {
    duplicateError = err;
  }
  assert.ok(duplicateError);
  assert.strictEqual(duplicateError.code, 'BACKUP_ALREADY_ASSIGNED');

  const list = await backupService.listAssignments(user, { status: 'all', page: 1, limit: 10 });
  assert.strictEqual(list.items.length, 1);
  assert.strictEqual(list.pagination.totalItems, 1);
  assert.strictEqual(list.items[0].statusLabel, 'Active');

  const revoked = await backupService.revokeAssignment(user, String(assignment._id));
  assert.strictEqual(revoked.status, 'revoked');
  assert.strictEqual(revoked.statusLabel, 'Revoked');

  const afterRevoke = await awayModeService.getOverview(user);
  assert.strictEqual(afterRevoke.cards.backupPerson.available, false);

  assert.ok(awayEvents.length >= 1);
  assert.ok(auditStore.length >= 1);

  console.log('away-backup-tests: ok');
}

run().catch((err) => {
  console.error('away-backup-tests: failed');
  console.error(err);
  process.exit(1);
});
