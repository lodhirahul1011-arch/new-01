const assert = require('assert');
const mongoose = require('mongoose');

const Delivery = require('../src/models/Delivery');
const FamilyMember = require('../src/models/FamilyMember');
const User = require('../src/models/User');
const NfcCard = require('../src/models/NfcCard');
const DropZone = require('../src/models/DropZone');
const deliveryService = require('../src/services/delivery.service');
const accessService = require('../src/services/deliveryAccess.service');

const homeId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const zoneId = new mongoose.Types.ObjectId('6711a9e2c3a1234567890999');
const deliveryId = new mongoose.Types.ObjectId('6711a9e2c3a1234567890111');

const fixtures = [
  {
    _id: deliveryId,
    homeId,
    title: 'Mobile Phone Case',
    orderId: 'AMZ-3013-Amazon',
    company: 'Amazon',
    verificationCode: '0987',
    otp: '9055',
    status: 'delivered',
    category: 'personal',
    recordingUrl: 'https://cdn.example.com/rec.mp4',
    recordingThumbnailUrl: 'https://cdn.example.com/thumb.png',
    recordingDurationSeconds: 145,
    recordingSizeBytes: 987654321,
    recordingSaved: true,
    createdAt: new Date('2025-11-26T15:30:00.000Z'),
    deliveredAt: new Date('2025-11-26T15:31:00.000Z'),
    updatedAt: new Date('2025-11-26T15:31:00.000Z'),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890112'),
    homeId,
    title: 'Fashion Accessories',
    orderId: 'AMZ-2023-Amazon',
    company: 'Amazon',
    verificationCode: '1122',
    status: 'pending',
    recordingUrl: 'https://cdn.example.com/rec2.mp4',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: new mongoose.Types.ObjectId('6711a9e2c3a1234567890113'),
    homeId,
    title: 'Reject Package',
    orderId: 'AMZ-9999',
    company: 'Amazon',
    verificationCode: '2233',
    status: 'rejected',
    recordingUrl: 'https://cdn.example.com/rec3.mp4',
    createdAt: new Date(),
    rejectedAt: new Date(),
    updatedAt: new Date(),
  },
];
const zones = [{ _id: zoneId, homeId, name: 'Zone Three', type: 'locker', locationDescription: 'Near Lobby', accessCodeRequired: true, accessCodeLast4: '9999', status: 'active', usageCount: 2, isDefault: false, createdAt: new Date(), updatedAt: new Date() }];

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function match(row, q) {
  return Object.entries(q || {}).every(([k, val]) => {
    if (val && typeof val === 'object' && '$ne' in val) return String(row[k] || '') !== String(val.$ne);
    if (val && typeof val === 'object' && '$gte' in val) return new Date(row[k]).getTime() >= new Date(val.$gte).getTime();
    return String(row[k]) === String(val);
  });
}

Delivery.findOne = (q) => ({
  async lean() { return clone(fixtures.find((r) => match(r, q)) || null); },
  then(resolve) {
    const found = fixtures.find((r) => match(r, q));
    resolve(found ? {
      ...found,
      save: async function save() { Object.assign(found, this); return this; },
      toObject: () => clone(found),
    } : null);
  },
});
Delivery.find = (q) => ({
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  async lean() { return clone(fixtures.filter((r) => (!q.homeId || String(r.homeId) === String(q.homeId)) && (!q.recordingUrl || String(r.recordingUrl || '') !== String(q.recordingUrl.$ne || '')))); },
});
Delivery.countDocuments = async (q) => fixtures.filter((r) => (!q.homeId || String(r.homeId) === String(q.homeId))).length;
DropZone.findOne = (q) => ({
  async lean() { const found = zones.find((z) => match(z, q)); return found ? clone(found) : null; },
  then(resolve) { const found = zones.find((z) => match(z, q)); resolve(found ? { ...found, save: async function save() { Object.assign(found, this); return this; } } : null); },
});
DropZone.find = () => ({ sort() { return this; }, async lean() { return clone(zones); } });
DropZone.create = async (payload) => ({ _id: zoneId, ...payload, createdAt: new Date(), updatedAt: new Date() });
DropZone.updateMany = async () => ({ acknowledged: true });
DropZone.updateOne = async () => ({ acknowledged: true });
FamilyMember.findOne = async () => ({ _id: new mongoose.Types.ObjectId(), role: 'owner', accessLevel: 'full' });
NfcCard.findOne = () => ({ select: async () => ({ _id: new mongoose.Types.ObjectId() }) });
User.updateOne = async () => ({ acknowledged: true });

async function run() {
  const user = { _id: userId, primaryHomeId: homeId };
  const methods = await accessService.methods(user);
  assert.ok(methods.items.some((i) => i.key === 'nfc'));
  const context = await accessService.verifyContext(user, String(deliveryId));
  assert.strictEqual(context.orderId, 'AMZ-3013-Amazon');
  const zoneList = await accessService.listZones(user, { status: 'active' });
  assert.ok(zoneList.items.length >= 1);
  const selected = await accessService.selectZone(user, String(deliveryId), { zoneId: String(zoneId) });
  assert.strictEqual(selected.zoneName, 'Zone Three');
  const method = await accessService.selectVerificationMethod(user, String(deliveryId), { method: 'approve_in_app' });
  assert.strictEqual(method.method, 'approve_in_app');
  const status = await accessService.getZoneStatus(user, String(zoneId));
  assert.strictEqual(status.name, 'Zone Three');
  const recordings = await deliveryService.listRecordings(user, { status: 'all', days: 30 });
  assert.ok(recordings.summary.totalRecordings >= 1);
  const detail = await deliveryService.getRecordingDetail(user, String(deliveryId));
  assert.strictEqual(detail.deliveryInformation.otp, '9055');
  const share = await deliveryService.getRecordingSharePayload(user, String(deliveryId));
  assert.ok(share.whatsappDeepLink.includes('wa.me'));
  console.log('Mobile delivery access and recordings tests passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
