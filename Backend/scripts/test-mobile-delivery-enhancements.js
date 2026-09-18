const assert = require('assert');
const mongoose = require('mongoose');

const Delivery = require('../src/models/Delivery');
const FamilyMember = require('../src/models/FamilyMember');
const deliveryService = require('../src/services/delivery.service');
const analyticsService = require('../src/services/analytics.service');
const { deliveryDashboardQuerySchema, rejectSchema, analyticsMonthQuerySchema } = require('../src/schemas/delivery.schemas');

const homeId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const memberA = new mongoose.Types.ObjectId();
const memberB = new mongoose.Types.ObjectId();

const fixtures = [
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890101'),
    homeId,
    title: 'Dell Latitude Laptop',
    orderId: 'RFK-2891',
    awbCode: 'AWB-2891',
    company: 'Flipkart',
    partnerName: 'Ramesh Kumar',
    partnerRating: 4.8,
    paymentStatus: 'prepaid',
    verificationCode: 'VRF-8492',
    status: 'upcoming',
    category: 'business',
    packageImageUrl: 'https://cdn.test/pkg-1.jpg',
    createdAt: new Date('2025-11-26T14:29:00.000Z'),
    updatedAt: new Date('2025-11-26T14:29:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890102'),
    homeId,
    title: 'Samsung Galaxy S24 Ultra',
    orderId: 'RFK-8201',
    company: 'Amazon',
    partnerName: 'Priya Sharma',
    partnerRating: 4.8,
    paymentStatus: 'prepaid',
    verificationCode: 'VRF-8201',
    status: 'delivered',
    category: 'personal',
    deliveredAt: new Date('2025-11-25T14:34:00.000Z'),
    approvedByMemberId: memberA,
    createdAt: new Date('2025-11-25T14:29:00.000Z'),
    updatedAt: new Date('2025-11-25T14:34:00.000Z'),
    rating: { score: 4, comment: 'Good' },
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890103'),
    homeId,
    title: 'Wrong Item - PlayStation 5',
    orderId: 'RFK-7654',
    company: 'Amazon',
    paymentStatus: 'cod',
    status: 'rejected',
    category: 'household',
    rejectedAt: new Date('2025-11-19T14:34:00.000Z'),
    rejectedByMemberId: memberB,
    rejectionReason: 'Wrong item delivered',
    createdAt: new Date('2025-11-19T14:29:00.000Z'),
    updatedAt: new Date('2025-11-19T14:34:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890105'),
    homeId,
    title: 'Household groceries',
    orderId: 'RFK-5555',
    company: 'Blinkit',
    paymentStatus: 'prepaid',
    status: 'upcoming',
    category: 'household',
    createdAt: new Date('2025-11-27T10:00:00.000Z'),
    updatedAt: new Date('2025-11-27T10:00:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890104'),
    homeId,
    title: 'Business Papers',
    orderId: 'RFK-1111',
    company: 'Delhivery',
    paymentStatus: 'prepaid',
    status: 'delivered',
    category: 'business',
    deliveredAt: new Date('2025-10-15T14:34:00.000Z'),
    approvedByMemberId: memberA,
    createdAt: new Date('2025-10-15T14:29:00.000Z'),
    updatedAt: new Date('2025-10-15T14:34:00.000Z'),
  },
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeId(value) {
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value && typeof value === 'object' && value._bsontype === 'ObjectId') return String(value);
  return value;
}
function compareScalar(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  return String(normalizeId(actual)) === String(normalizeId(expected));
}
function matchCondition(row, key, condition) {
  const actual = row[key];
  if (condition instanceof RegExp) return compareScalar(actual, condition);
  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !(condition instanceof mongoose.Types.ObjectId)) {
    if ('$in' in condition) return condition.$in.some((entry) => compareScalar(actual, entry));
    if ('$gte' in condition || '$lt' in condition || '$ne' in condition) {
      if ('$ne' in condition && compareScalar(actual, condition.$ne)) return false;
      if ('$gte' in condition && !(new Date(actual).getTime() >= new Date(condition.$gte).getTime())) return false;
      if ('$lt' in condition && !(new Date(actual).getTime() < new Date(condition.$lt).getTime())) return false;
      return true;
    }
  }
  return compareScalar(actual, condition);
}
function matches(row, query) {
  if (!query || Object.keys(query).length === 0) return true;
  if (query.$and) return query.$and.every((part) => matches(row, part));
  if (query.$or) return query.$or.some((part) => matches(row, part));
  return Object.entries(query).every(([key, condition]) => matchCondition(row, key, condition));
}
function chain(rows) {
  const state = { rows: [...rows] };
  return {
    sort(spec) {
      const entries = Object.entries(spec || {});
      state.rows.sort((a, b) => {
        for (const [field, direction] of entries) {
          const av = a[field];
          const bv = b[field];
          const aValue = av instanceof Date ? av.getTime() : String(normalizeId(av) || '');
          const bValue = bv instanceof Date ? bv.getTime() : String(normalizeId(bv) || '');
          if (aValue < bValue) return direction === -1 ? 1 : -1;
          if (aValue > bValue) return direction === -1 ? -1 : 1;
        }
        return 0;
      });
      return this;
    },
    limit(count) { state.rows = state.rows.slice(0, count); return this; },
    skip(count) { state.rows = state.rows.slice(count); return this; },
    async lean() { return clone(state.rows); },
  };
}

Delivery.countDocuments = async (query) => fixtures.filter((row) => matches(row, query)).length;
Delivery.find = (query) => chain(fixtures.filter((row) => matches(row, query)));
Delivery.findOne = (query) => {
  const found = fixtures.find((row) => {
    const idOk = !query._id || String(normalizeId(row._id)) === String(normalizeId(query._id));
    const homeOk = !query.homeId || String(normalizeId(row.homeId)) === String(normalizeId(query.homeId));
    const statusOk = !query.status || row.status === query.status;
    return idOk && homeOk && statusOk;
  });
  return {
    async lean() { return found ? clone(found) : null; },
    then(resolve) {
      resolve(found ? {
        ...clone(found),
        async save() {
          Object.assign(found, this, { updatedAt: new Date() });
          return this;
        },
        toObject() { return clone(found); },
      } : null);
    },
  };
};
FamilyMember.find = () => ({
  async lean() {
    return [
      { _id: memberA, name: 'Rajesh Kumar', homeId, status: 'active' },
      { _id: memberB, name: 'Meena', homeId, status: 'active' },
    ];
  },
});
FamilyMember.findOne = async ({ userId }) => ({ _id: memberA, userId, role: 'owner', accessLevel: 'full' });
FamilyMember.create = async (payload) => payload;

async function run() {
  const user = { _id: ownerId, primaryHomeId: homeId };

  const parsedDash = deliveryDashboardQuerySchema.parse({ status: 'all', limit: '10', search: 'Dell' });
  assert.strictEqual(parsedDash.limit, 10);
  const parsedReject = rejectSchema.parse({ code: 'wrong_item' });
  assert.strictEqual(parsedReject.code, 'wrong_item');
  const parsedMonth = analyticsMonthQuerySchema.parse({ month: '2025-11', category: 'business' });
  assert.strictEqual(parsedMonth.category, 'business');

  const dashboard = await deliveryService.getDashboard(user, { status: 'all', limit: 10 });
  assert.strictEqual(dashboard.summary.total, 5);
  assert.strictEqual(dashboard.cards[1].value, 2);
  assert.ok(dashboard.items[0].verificationMethods.length === 2);

  const detail = await deliveryService.getOne(user, '6711a9e2c3a1234567890102');
  assert.strictEqual(detail.orderSummary.verificationCode, 'VRF-8201');
  assert.strictEqual(detail.ratingMeta.score, 4);

  const rejected = await deliveryService.reject(user, '6711a9e2c3a1234567890101', { code: 'damaged' });
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.rejectionReason, 'Package is damaged');
  assert.ok(rejected.rejection.screenMessage.includes('rejected'));

  const approved = await deliveryService.approve(user, '6711a9e2c3a1234567890105');
  assert.strictEqual(approved.status, 'delivered');
  assert.strictEqual(approved.verificationMethod, 'app');

  const report = await analyticsService.getMonthlyReport(user, '2025-11');
  assert.strictEqual(report.totalDeliveries, 4);
  assert.ok(report.categories.some((item) => item.key === 'business'));
  assert.ok(report.byFamilyMember.some((item) => item.name === 'Rajesh Kumar'));
  assert.ok(report.expenseReports.whatsappDeepLink.includes('wa.me'));

  const pdf = await analyticsService.exportMonthlyPdf(user, '2025-11');
  assert.ok(Buffer.isBuffer(pdf.buffer));
  const excel = await analyticsService.exportMonthlyExcel(user, '2025-11');
  assert.ok(excel.filename.endsWith('.xlsx'));

  console.log('Mobile delivery enhancement tests passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
