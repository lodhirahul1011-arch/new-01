const assert = require('assert');
const mongoose = require('mongoose');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari-test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const app = require('../src/app');
const Authorization = require('../src/models/Authorization');
const FamilyMember = require('../src/models/FamilyMember');
const User = require('../src/models/User');
const Delivery = require('../src/models/Delivery');
const AuditLog = require('../src/models/AuditLog');
const authorizationService = require('../src/services/authorization.service');
const {
  createAuthorizationSchema,
  listAuthorizationsQuerySchema,
  authorizationSummaryQuerySchema,
  markAuthorizationUsedSchema,
} = require('../src/schemas/authorization.schemas');

const homeId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const memberId = new mongoose.Types.ObjectId();
const deliveryId = new mongoose.Types.ObjectId();

const authStore = [];
const deliveryStore = [
  {
    _id: deliveryId,
    homeId,
    title: 'Amazon Delivery',
  },
];
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
  doc.save = async () => doc;
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

Authorization.findOne = (query) => buildFindOne(authStore, query);
Authorization.find = (query) => buildFindMany(authStore, query);
Authorization.countDocuments = async (query) => authStore.filter((row) => matches(row, query)).length;
Authorization.create = async (payload) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    ...clone(payload),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  authStore.push(doc);
  return wrapDoc(authStore, doc);
};
Authorization.updateMany = async (query, update) => {
  let modifiedCount = 0;
  for (const row of authStore) {
    if (matches(row, query)) {
      Object.entries(update.$set || {}).forEach(([key, value]) => setByPath(row, key, value));
      row.updatedAt = new Date();
      modifiedCount += 1;
    }
  }
  return { modifiedCount };
};
Authorization.updateOne = async (query, update) => {
  const row = authStore.find((entry) => matches(entry, query));
  if (!row) return { modifiedCount: 0 };
  Object.entries(update.$set || {}).forEach(([key, value]) => setByPath(row, key, value));
  row.updatedAt = new Date();
  return { modifiedCount: 1 };
};

FamilyMember.findOne = async (query) => {
  const found = memberStore.find((row) => matches(row, query));
  return found ? wrapDoc(memberStore, found) : null;
};
FamilyMember.create = async (payload) => {
  const doc = { _id: new mongoose.Types.ObjectId(), ...clone(payload), createdAt: new Date(), updatedAt: new Date() };
  memberStore.push(doc);
  return wrapDoc(memberStore, doc);
};

User.updateOne = async () => ({ modifiedCount: 1 });

Delivery.findOne = (query) => buildFindOne(deliveryStore, query);

AuditLog.create = async () => ({ ok: true });

async function run() {
  assert.ok(app);
  const routerLayers = app._router && app._router.stack ? app._router.stack.map((layer) => String(layer.regexp || '')) : [];
  assert.ok(routerLayers.some((value) => value.includes('authorizations')));

  const createParsed = createAuthorizationSchema.parse({
    name: 'Amazon Delivery',
    scheduleType: 'today',
    startTime: '14:00',
    endTime: '18:00',
    startDate: '2099-02-19',
    endDate: '2099-02-19',
    linkedDeliveryId: String(deliveryId),
  });
  assert.strictEqual(createParsed.scheduleType, 'TODAY');

  const listParsed = listAuthorizationsQuerySchema.parse({ status: 'active', page: '1', limit: '10', search: '' });
  assert.strictEqual(listParsed.status, 'ACTIVE');
  assert.strictEqual(listParsed.page, 1);

  const summaryParsed = authorizationSummaryQuerySchema.parse({ month: '2026-02' });
  assert.strictEqual(summaryParsed.month, '2026-02');

  const markUsedParsed = markAuthorizationUsedSchema.parse({ otpVerified: true, verificationMethod: 'otp' });
  assert.strictEqual(markUsedParsed.otpVerified, true);
  assert.strictEqual(markUsedParsed.verificationMethod, 'otp');

  const user = {
    _id: userId,
    primaryHomeId: homeId,
    name: 'Owner User',
    email: 'owner@example.com',
    phone: '+919999999999',
  };

  const todayKey = new Date().toISOString().slice(0, 10);

  const created = await authorizationService.createAuthorization(user, {
    name: 'Amazon Delivery',
    accessCode: '2536',
    scheduleType: 'TODAY',
    startDate: todayKey,
    endDate: todayKey,
    startTime: '00:00',
    endTime: '23:59',
    linkedDeliveryId: String(deliveryId),
    company: 'Amazon',
    purpose: 'delivery',
  });

  assert.strictEqual(created.name, 'Amazon Delivery');
  assert.strictEqual(created.accessCode, '2536');
  assert.strictEqual(created.status, 'ACTIVE');
  assert.strictEqual(created.scheduleType, 'TODAY');
  assert.strictEqual(created.validTimeWindow, '12:00 AM - 11:59 PM');
  assert.strictEqual(created.canRevoke, true);

  const codePreview = await authorizationService.previewAccessCode(user);
  assert.ok(/^\d{4}$/.test(codePreview.accessCode));

  const listed = await authorizationService.listAuthorizations(user, { status: 'ALL', page: 1, limit: 10, search: '', sortOrder: 'DESC' });
  assert.strictEqual(listed.items.length, 1);
  assert.strictEqual(listed.summary.total, 1);
  assert.strictEqual(listed.summary.active, 1);

  const summary = await authorizationService.getAuthorizationSummary(user, { month: undefined, search: '' });
  assert.strictEqual(summary.total, 1);
  assert.strictEqual(summary.active, 1);

  const detail = await authorizationService.getAuthorizationById(user, created.id);
  assert.strictEqual(detail.accessCode, '2536');
  assert.strictEqual(detail.statusLabel, 'Active');

  const used = await authorizationService.markAuthorizationUsed(user, created.id, {
    otpVerified: true,
    verificationMethod: 'otp',
    deliveryPersonName: 'Amazon Delivery Partner',
    linkedDeliveryId: String(deliveryId),
  });
  assert.strictEqual(used.status, 'USED');
  assert.strictEqual(used.statusLabel, 'Completed');
  assert.strictEqual(used.otpVerificationStatus, 'verified');
  assert.strictEqual(used.deliveryPersonName, 'Amazon Delivery Partner');

  const secondCreated = await authorizationService.createAuthorization(user, {
    name: 'Milk Vendor',
    accessCode: '6789',
    scheduleType: 'DAILY',
    startDate: '2099-02-19',
    startTime: '06:00',
    endTime: '08:00',
    company: 'Local Vendor',
    purpose: 'service',
    singleUse: false,
    maxUses: 3,
  });
  assert.strictEqual(secondCreated.scheduleType, 'DAILY');
  assert.strictEqual(secondCreated.usage.singleUse, false);

  const revoked = await authorizationService.revokeAuthorization(user, secondCreated.id, { reason: 'no_longer_required' });
  assert.strictEqual(revoked.status, 'CANCELLED');
  assert.strictEqual(revoked.canRevoke, false);

  const activity = await authorizationService.getActivityLog(user, { status: 'ALL', page: 1, limit: 10, search: '', sortOrder: 'DESC' });
  assert.strictEqual(activity.items.length, 2);
  assert.ok(activity.items.some((item) => item.status === 'USED'));
  assert.ok(activity.items.some((item) => item.status === 'CANCELLED'));

  console.log('Authorization module contract tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
