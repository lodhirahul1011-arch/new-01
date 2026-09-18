const assert = require('assert');
const mongoose = require('mongoose');

const Delivery = require('../src/models/Delivery');
const deliveryService = require('../src/services/delivery.service');
const { historyQuerySchema, historySummaryQuerySchema } = require('../src/schemas/delivery.schemas');

const homeId = new mongoose.Types.ObjectId();
const memberA = new mongoose.Types.ObjectId();
const memberB = new mongoose.Types.ObjectId();

const fixtures = [
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890001'),
    homeId,
    title: 'Dell Latitude Laptop',
    orderId: 'RFK-2891',
    company: 'Flipkart',
    partnerName: 'Ramesh Kumar',
    paymentStatus: 'prepaid',
    verificationCode: 'VRF-8492',
    status: 'delivered',
    deliveredAt: new Date('2025-11-26T14:34:00.000Z'),
    proofGeneratedAt: new Date('2025-11-26T14:34:00.000Z'),
    packageImageUrl: 'https://cdn.test/rfk-2891-thumb.jpg',
    recordingThumbnailUrl: 'https://cdn.test/rfk-2891-recording-thumb.jpg',
    partnerRating: 4.8,
    price: null,
    currency: 'INR',
    recordingUrl: 'https://cdn.test/rfk-2891.mp4',
    recordingSaved: true,
    approvedByMemberId: memberA,
    rating: { score: 5, comment: 'Smooth handoff' },
    createdAt: new Date('2025-11-26T14:29:00.000Z'),
    updatedAt: new Date('2025-11-26T14:34:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890002'),
    homeId,
    title: 'Wrong Item - PlayStation 5',
    orderId: 'RFK-7654',
    company: 'Amazon',
    partnerName: '',
    paymentStatus: 'cod',
    verificationCode: '',
    status: 'rejected',
    rejectedAt: new Date('2025-11-19T14:34:00.000Z'),
    proofGeneratedAt: new Date('2025-11-19T14:34:00.000Z'),
    packageImageUrl: '',
    recordingThumbnailUrl: '',
    price: 24999,
    currency: 'INR',
    recordingUrl: 'https://cdn.test/rfk-7654.mp4',
    recordingSaved: true,
    rejectedByMemberId: memberB,
    rejectionReason: 'wrong item delivered',
    createdAt: new Date('2025-11-19T14:29:00.000Z'),
    updatedAt: new Date('2025-11-19T14:34:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890003'),
    homeId,
    title: 'Office Documents',
    orderId: 'RFK-8899',
    company: 'Flipkart',
    partnerName: 'Mahesh',
    paymentStatus: 'unknown',
    verificationCode: 'VRF-7777',
    status: 'delivered',
    deliveredAt: new Date('2025-11-02T08:15:00.000Z'),
    proofGeneratedAt: new Date('2025-11-02T08:15:00.000Z'),
    packageImageUrl: '',
    recordingUrl: '',
    recordingSaved: false,
    approvedByMemberId: memberA,
    rating: null,
    createdAt: new Date('2025-11-02T08:10:00.000Z'),
    updatedAt: new Date('2025-11-02T08:15:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890004'),
    homeId,
    title: 'October Delivery',
    orderId: 'RFK-1010',
    company: 'Amazon',
    partnerName: 'Naresh',
    paymentStatus: 'prepaid',
    verificationCode: 'VRF-1010',
    status: 'delivered',
    deliveredAt: new Date('2025-10-12T11:00:00.000Z'),
    proofGeneratedAt: new Date('2025-10-12T11:00:00.000Z'),
    packageImageUrl: '',
    recordingUrl: '',
    recordingSaved: false,
    approvedByMemberId: memberA,
    rating: { score: 4, comment: '' },
    createdAt: new Date('2025-10-12T10:45:00.000Z'),
    updatedAt: new Date('2025-10-12T11:00:00.000Z'),
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

Delivery.countDocuments = async (query) => fixtures.filter((row) => matches(row, query)).length;
Delivery.find = (query) => chain(fixtures.filter((row) => matches(row, query)));
Delivery.findOne = (query) => ({
  async lean() {
    const found = fixtures.find((row) => matches(row, query));
    return found ? clone(found) : null;
  },
});

async function run() {
  const parsedHistory = historyQuerySchema.parse({ status: 'all', page: '1', limit: '2', month: '2025-11', search: '' });
  assert.strictEqual(parsedHistory.limit, 2);
  assert.strictEqual(parsedHistory.page, 1);
  assert.strictEqual(parsedHistory.month, '2025-11');
  assert.throws(() => historyQuerySchema.parse({ month: '2025-13' }));

  const parsedSummary = historySummaryQuerySchema.parse({ month: '2025-11', company: 'Flipkart' });
  assert.strictEqual(parsedSummary.company, 'Flipkart');

  const user = { _id: new mongoose.Types.ObjectId(), primaryHomeId: homeId };

  const summary = await deliveryService.getHistorySummary(user, { month: '2025-11' });
  assert.deepStrictEqual(summary, {
    total: 3,
    successful: 2,
    delivered: 2,
    rejected: 1,
  });

  const history = await deliveryService.getHistory(user, { status: 'all', page: 1, limit: 2, month: '2025-11', search: '' });
  assert.strictEqual(history.items.length, 2);
  assert.strictEqual(history.pagination.totalItems, 3);
  assert.strictEqual(history.summary.successful, 2);
  assert.strictEqual(history.items[0].statusLabel, 'Delivered');
  assert.strictEqual(history.items[0].proof.available, true);

  const rejectedDetail = await deliveryService.getHistoryDetail(user, '6711a9e2c3a1234567890002');
  assert.strictEqual(rejectedDetail.rejection.reason, 'wrong item delivered');
  assert.strictEqual(rejectedDetail.timeline[rejectedDetail.timeline.length - 1].key, 'rejected');

  const proof = await deliveryService.getProof(user, '6711a9e2c3a1234567890001');
  assert.strictEqual(proof.available, true);
  assert.ok(proof.downloadUrl.includes('download=1'));
  assert.ok(proof.metadataUrl.endsWith('/proof'));

  const proofDownload = await deliveryService.getProofDownload(user, '6711a9e2c3a1234567890001');
  assert.ok(Buffer.isBuffer(proofDownload.buffer));
  assert.ok(proofDownload.filename.endsWith('.pdf'));

  const recording = await deliveryService.getRecording(user, '6711a9e2c3a1234567890001');
  assert.strictEqual(recording.available, true);
  assert.ok(recording.viewUrl.includes('view=1'));
  assert.ok(recording.metadataUrl.endsWith('/recording'));

  const filters = await deliveryService.getHistoryFilters(user, { limitMonths: 12 });
  assert.strictEqual(filters.statuses.length, 3);
  assert.ok(filters.months.some((entry) => entry.key === '2025-11'));
  assert.ok(filters.companies.some((entry) => entry.label === 'Flipkart'));

  console.log('Delivery history contract tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
