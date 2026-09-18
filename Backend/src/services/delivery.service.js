const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Delivery = require('../models/Delivery');
const FamilyMember = require('../models/FamilyMember');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { generateOtp } = require('../utils/otp');
const { safeLog } = require('../utils/logger');

const HISTORY_STATUSES = ['delivered', 'rejected'];
const DELIVERY_REJECTION_REASONS = [
  { code: 'wrong_item', label: 'Wrong item delivered', description: 'The parcel contents do not match the expected order.' },
  { code: 'damaged', label: 'Package is damaged', description: 'The outer package or product appears damaged.' },
  { code: 'suspicious', label: 'Delivery person seems suspicious', description: 'The delivery attempt feels unsafe or suspicious.' },
  { code: 'unexpected', label: 'Not expecting this delivery', description: 'No one at home is expecting this package.' },
  { code: 'opened', label: 'Package already opened', description: 'The package appears tampered with or already opened.' },
  { code: 'other', label: 'Other reason', description: 'Any other rejection reason supplied by the resident.' },
];

const MOBILE_VERIFICATION_METHODS = [
  { key: 'nfc', label: 'Tap NFC Card', subtitle: 'Quick & secure', icon: 'card' },
  { key: 'app', label: 'Approve via App', subtitle: 'Remote approval', icon: 'phone' },
];

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function assertDeliveryId(deliveryId) {
  const objectId = toObjectId(deliveryId);
  if (!objectId) {
    throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  }
  return objectId;
}

function buildAccessWindow(scheduledFor, minutes) {
  const center = new Date(scheduledFor);
  const accessStartAt = new Date(center.getTime() - minutes * 60 * 1000);
  const accessEndAt = new Date(center.getTime() + minutes * 60 * 1000);
  return { accessStartAt, accessEndAt };
}

function makeProofUrl(id) {
  return `/api/v1/deliveries/${id}/proof`;
}

function makeRecordingEndpointUrl(id) {
  return `/api/v1/deliveries/${id}/recording`;
}

function isImageRecording(item) {
  const mime = String(item.recordingMimeType || '').toLowerCase();
  const url = String(item.recordingUrl || '').toLowerCase().split('?')[0];
  return (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(url)
  );
}

function getRecordingFileType(item) {
  if (isImageRecording(item)) {
    const mime = String(item.recordingMimeType || '').toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('heic')) return 'heic';
    return 'jpg';
  }
  return 'mp4';
}

function makeHistoryDetailUrl(id) {
  return `/api/v1/deliveries/history/${id}`;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveMonthBounds(monthArg) {
  if (!monthArg) return null;
  const [year, month] = String(monthArg).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function formatDateLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTimeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatMonthKey(value) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getHistoryEventAt(item) {
  if (item.status === 'delivered') return item.deliveredAt || item.updatedAt || item.createdAt || null;
  if (item.status === 'rejected') return item.rejectedAt || item.updatedAt || item.createdAt || null;
  return item.updatedAt || item.createdAt || null;
}

function getStatusLabel(status) {
  if (status === 'delivered') return 'Delivered';
  if (status === 'rejected') return 'Rejected';
  return 'Upcoming';
}

function getStatusColor(status) {
  if (status === 'delivered') return 'green';
  if (status === 'rejected') return 'red';
  return 'orange';
}

function getRatingValue(item) {
  return item?.rating?.score ?? null;
}

function getPartner(item) {
  const rating = item.partnerRating ?? getRatingValue(item);
  const hasPartner = Boolean(item.partnerName || item.company || rating !== null);
  if (!hasPartner) return null;
  return {
    name: item.partnerName || '',
    company: item.company || '',
    rating,
    roleLabel: 'Delivery',
  };
}


function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch (err) {
    return `${currency || 'INR'} ${Number(amount)}`;
  }
}

function getPaymentStatusLabel(status) {
  if (status === 'prepaid') return 'Already Paid';
  if (status === 'cod') return 'Cash on Delivery';
  return 'Payment status unknown';
}

function buildVerificationMethods(item) {
  return MOBILE_VERIFICATION_METHODS.map((method) => ({
    ...method,
    enabled: item.status === 'upcoming',
    selected: item.verificationMethod === method.key,
  }));
}

function buildActionState(item) {
  const canAct = item.status === 'upcoming';
  return {
    canApprove: canAct,
    canReject: canAct,
    approved: item.status === 'delivered',
    rejected: item.status === 'rejected',
  };
}

function buildOrderSummary(item) {
  return {
    title: item.title || item.orderId || 'Delivery',
    otp: item.otp || null,
    orderId: item.orderId,
    awbCode: item.awbCode || '',
    verificationCode: item.verificationCode || null,
    otp: item.otp || null,
    date: getHistoryEventAt(item) || item.scheduledFor || item.createdAt || null,
    dateLabel: formatDateLabel(getHistoryEventAt(item) || item.scheduledFor || item.createdAt),
    timeLabel: formatTimeLabel(getHistoryEventAt(item) || item.scheduledFor || item.createdAt),
    paymentStatus: item.paymentStatus || 'unknown',
    paymentStatusLabel: getPaymentStatusLabel(item.paymentStatus),
    price: item.price ?? null,
    priceLabel: formatCurrency(item.price, item.currency),
    currency: item.currency || 'INR',
    company: item.company || '',
    companyName: item.company || '',
    scheduledFor: item.scheduledFor || null,
    scheduleStatus: item.scheduleStatus || 'none',
    packageImageUrl: item.packageImageUrl || '',
    packageImage: item.packageImageUrl || '',
    selectedZone: item.selectedZoneId ? {
      zoneId: String(item.selectedZoneId),
      name: item.selectedZoneSnapshot?.name || '',
      type: item.selectedZoneSnapshot?.type || '',
      locationDescription: item.selectedZoneSnapshot?.locationDescription || '',
    } : null,
  };
}

function buildRatingPayload(item) {
  const score = getRatingValue(item);
  return {
    available: score !== null,
    score,
    comment: item?.rating?.comment || '',
    ratedAt: item?.rating?.ratedAt || null,
  };
}

function buildStatusBanner(item) {
  if (item.status === 'delivered') {
    return {
      tone: 'success',
      title: 'Delivery Approved!',
      message: 'Your package has been successfully verified.',
    };
  }
  if (item.status === 'rejected') {
    return {
      tone: 'danger',
      title: 'Reject Delivery',
      message: item.rejectionReason || 'Delivery was rejected by a family member.',
    };
  }
  return {
    tone: 'warning',
    title: 'Upcoming delivery',
    message: 'Please confirm receipt of your package.',
  };
}

function buildRejectionDialog(item) {
  return {
    title: 'Reject Delivery',
    subtitle: 'Please provide a reason for rejection',
    orderTitle: item.title || item.orderId || 'Delivery',
    orderId: item.orderId,
    selectedReason: item.rejectionReason || '',
    reasons: DELIVERY_REJECTION_REASONS,
    importantNote: 'Rejecting this delivery will initiate a return process. The delivery person will take the package back and you should wait for the proceeding with a TV or business delivery.',
    confirmationLabel: 'Confirm Rejection',
  };
}

function normalizeRejectionReason(payload) {
  const rawReason = String(payload?.reason || '').trim();
  const rawCode = String(payload?.code || '').trim().toLowerCase();
  const customMessage = String(payload?.message || '').trim();
  if (rawReason) return rawReason;
  const matched = DELIVERY_REJECTION_REASONS.find((item) => item.code === rawCode);
  if (matched && matched.code !== 'other') return matched.label;
  if (customMessage) return customMessage;
  if (matched && matched.code === 'other') return matched.label;
  return 'Other reason';
}

function buildRejectionPayload(item) {
  if (item.status !== 'rejected') return null;
  const reason = item.rejectionReason || '';
  return {
    reason,
    reasonLabel: reason ? `Reason - ${reason}` : 'Reason - not provided',
    screenMessage: reason ? `Order ${item.orderId || ''} rejected: ${reason}`.trim() : 'Order rejected',
  };
}

function isDefaultProofEndpoint(item) {
  const defaultUrl = makeProofUrl(item._id);
  return !item.proofUrl || item.proofUrl === defaultUrl || item.proofUrl.startsWith(`${defaultUrl}?`);
}

function resolveProofDownloadUrl(item) {
  if (!item) return '';
  return makeProofUrl(item._id);
}

function resolveProofDirectDownloadUrl(item) {
  if (!item) return '';
  if (item.proofUrl && !isDefaultProofEndpoint(item)) {
    return item.proofUrl;
  }
  return `${makeProofUrl(item._id)}?download=1`;
}

function resolveRecordingViewUrl(item) {
  if (!item.recordingUrl) return '';
  return makeRecordingEndpointUrl(item._id);
}

function resolveRecordingDirectViewUrl(item) {
  if (!item.recordingUrl) return '';
  return `${makeRecordingEndpointUrl(item._id)}?view=1`;
}

function isProofAvailable(item) {
  return Boolean(item.proofGeneratedAt || HISTORY_STATUSES.includes(item.status));
}

function buildProofPayload(item) {
  const available = isProofAvailable(item);
  return {
    available,
    fileName: `${sanitizeFilenamePart(item.orderId || item._id)}-proof.pdf`,
    downloadUrl: available ? resolveProofDownloadUrl(item) : '',
    directDownloadUrl: available ? resolveProofDirectDownloadUrl(item) : '',
  };
}

function buildRecordingPayload(item) {
  const available = Boolean(item.recordingUrl);
  const image = isImageRecording(item);
  return {
    available,
    type: image ? 'image' : 'video',
    viewUrl: available ? resolveRecordingViewUrl(item) : '',
    directViewUrl: available ? resolveRecordingDirectViewUrl(item) : '',
    streamUrl: item.recordingUrl || '',
    thumbnailUrl: item.recordingThumbnailUrl || item.packageImageUrl || '',
    durationSeconds: item.recordingDurationSeconds ?? null,
    recordingSaved: item.recordingSaved !== false,
    fileType: getRecordingFileType(item),
    mimeType: item.recordingMimeType || (image ? 'image/jpeg' : 'video/mp4'),
  };
}

function historyProjection(item) {
  const eventAt = getHistoryEventAt(item);
  const proof = buildProofPayload(item);
  const recording = buildRecordingPayload(item);
  const orderSummary = buildOrderSummary(item);
  const rating = buildRatingPayload(item);
  return {
    _id: item._id,
    id: String(item._id),
    detailUrl: makeHistoryDetailUrl(item._id),
    title: item.title || item.orderId || 'Delivery',
    orderId: item.orderId,
    awbCode: item.awbCode || '',
    priceStatus: item.paymentStatus,
    paymentStatus: item.paymentStatus,
    paymentStatusLabel: getPaymentStatusLabel(item.paymentStatus),
    price: item.price ?? null,
    priceLabel: formatCurrency(item.price, item.currency),
    currency: item.currency || 'INR',
    company: item.company || '',
    partnerName: item.partnerName || '',
    status: item.status,
    statusLabel: getStatusLabel(item.status),
    statusColor: getStatusColor(item.status),
    verificationCode: item.verificationCode || null,
    otp: item.otp || null,
    verificationMethod: item.verificationMethod || 'none',
    verificationStatus: item.verificationStatus || (item.status === 'delivered' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'not_started'),
    deliveredAt: item.deliveredAt || null,
    rejectedAt: item.rejectedAt || null,
    scheduledFor: item.scheduledFor || null,
    eventAt,
    date: eventAt ? new Date(eventAt).toISOString().slice(0, 10) : null,
    dateLabel: formatDateLabel(eventAt || item.scheduledFor || item.createdAt),
    timeLabel: formatTimeLabel(eventAt || item.scheduledFor || item.createdAt),
    rejectionReason: item.rejectionReason || '',
    rejectionCode: item.rejectionCode || '',
    rejection: buildRejectionPayload(item),
    rejectionDialog: buildRejectionDialog(item),
    proofUrl: proof.downloadUrl,
    proofDirectDownloadUrl: proof.directDownloadUrl,
    proof,
    recordingUrl: item.recordingUrl || '',
    recordingDirectViewUrl: recording.directViewUrl,
    recording,
    packageImageUrl: item.packageImageUrl || '',
    thumbnailUrl: item.packageImageUrl || '',
    recordingThumbnailUrl: item.recordingThumbnailUrl || item.packageImageUrl || '',
    rating: rating.score,
    ratingComment: rating.comment,
    ratingMeta: rating,
    partner: getPartner(item),
    orderSummary,
    packageDetails: orderSummary,
    selectedZone: orderSummary.selectedZone,
    verificationMethods: buildVerificationMethods(item),
    actions: buildActionState(item),
    statusBanner: buildStatusBanner(item),
  };
}

function buildTimeline(item) {
  const timeline = [];

  if (item.createdAt) {
    timeline.push({ key: 'created', label: 'Delivery created', at: item.createdAt });
  }
  if (item.scheduledFor) {
    timeline.push({ key: 'scheduled', label: 'Scheduled delivery', at: item.scheduledFor });
  }
  if (item.rescheduledAt) {
    timeline.push({ key: 'rescheduled', label: 'Delivery rescheduled', at: item.rescheduledAt });
  }
  if (item.deliveredAt) {
    timeline.push({
      key: item.verificationMethod === 'nfc' ? 'delivered_nfc' : 'approved',
      label: item.verificationMethod === 'nfc' ? 'Delivered via NFC' : 'Approved by member',
      at: item.deliveredAt,
    });
  }
  if (item.rejectedAt) {
    timeline.push({
      key: 'rejected',
      label: item.rejectionReason ? `Rejected - ${item.rejectionReason}` : 'Rejected by member',
      at: item.rejectedAt,
    });
  }

  return timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function decorateDeliveryDetail(item) {
  const ui = historyProjection(item);
  return {
    ...item,
    ...ui,
    proof: {
      ...ui.proof,
      proofUrl: ui.proof.downloadUrl,
    },
    recording: {
      ...ui.recording,
      recordingUrl: ui.recording.streamUrl,
    },
    timeline: buildTimeline(item),
  };
}

function sanitizeFilenamePart(value) {
  return String(value || 'delivery').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'delivery';
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    doc.on('data', (d) => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.end();
  });
}

async function renderProofPdf(item) {
  const doc = new PDFDocument({ margin: 40 });
  const eventAt = getHistoryEventAt(item);
  doc.fontSize(20).text('Dvaari Delivery Proof');
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Order ID: ${item.orderId || '-'}`);
  doc.text(`Title: ${item.title || '-'}`);
  doc.text(`Status: ${getStatusLabel(item.status)}`);
  doc.text(`Company: ${item.company || '-'}`);
  doc.text(`Partner: ${item.partnerName || '-'}`);
  doc.text(`Verification Code: ${item.verificationCode || '-'}`);
  doc.text(`Payment Status: ${item.paymentStatus || '-'}`);
  doc.text(`Generated At: ${eventAt ? new Date(eventAt).toISOString() : '-'}`);
  if (item.rejectionReason) {
    doc.text(`Rejection Reason: ${item.rejectionReason}`);
  }
  doc.moveDown();
  doc.fontSize(10).text(`Delivery ID: ${item._id}`);
  doc.text(`Generated by Dvaari backend on ${new Date().toISOString()}`);
  return pdfToBuffer(doc);
}

async function getOrEnsureHome(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    throw createHttpError(401, 'INVALID_USER', 'Invalid user');
  }
  if (!user.primaryHomeId) {
    await User.updateOne({ _id: user._id }, { $set: { primaryHomeId: homeId } });
    user.primaryHomeId = homeId;
  }
  return homeId;
}

async function getActorMember(user, homeId) {
  let actor = await FamilyMember.findOne({ homeId, userId: user._id, status: 'active' });
  if (!actor) {
    actor = await FamilyMember.create({
      homeId,
      userId: user._id,
      name: user.name || 'Owner',
      phone: user.phone || '',
      email: user.email || '',
      role: 'owner',
      accessLevel: 'full',
      status: 'active',
    });
  }
  return actor;
}

function requireDeliveryPermission(actor) {
  if (actor.role === 'owner' || actor.role === 'admin') return;
  if (actor.accessLevel === 'nfc_only') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
}

function applyCursor(query, cursor) {
  const objectId = toObjectId(cursor);
  if (!objectId) return;
  if (Array.isArray(query.$and)) {
    query.$and.push({ _id: { $lt: objectId } });
    return;
  }
  query._id = { $lt: objectId };
}

function buildHistoryMonthCondition(status, monthBounds) {
  if (!monthBounds) return null;
  const range = { $gte: monthBounds.start, $lt: monthBounds.end };

  if (status === 'delivered') {
    return {
      $or: [
        { deliveredAt: range },
        { deliveredAt: null, createdAt: range },
      ],
    };
  }

  if (status === 'rejected') {
    return {
      $or: [
        { rejectedAt: range },
        { rejectedAt: null, createdAt: range },
      ],
    };
  }

  return {
    $or: [
      {
        $and: [
          { status: 'delivered' },
          {
            $or: [
              { deliveredAt: range },
              { deliveredAt: null, createdAt: range },
            ],
          },
        ],
      },
      {
        $and: [
          { status: 'rejected' },
          {
            $or: [
              { rejectedAt: range },
              { rejectedAt: null, createdAt: range },
            ],
          },
        ],
      },
    ],
  };
}

function buildHistoryQuery(homeId, filters = {}, { includeSelectedStatus = true } = {}) {
  const normalizedStatus = includeSelectedStatus && filters.status && filters.status !== 'all'
    ? filters.status
    : 'all';

  const conditions = [{ homeId }];
  if (normalizedStatus === 'all') {
    conditions.push({ status: { $in: HISTORY_STATUSES } });
  } else {
    conditions.push({ status: normalizedStatus });
  }

  const monthCondition = buildHistoryMonthCondition(normalizedStatus, resolveMonthBounds(filters.month));
  if (monthCondition) conditions.push(monthCondition);

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), 'i');
    conditions.push({
      $or: [
        { title: regex },
        { orderId: regex },
        { company: regex },
        { partnerName: regex },
        { verificationCode: regex },
        { rejectionReason: regex },
      ],
    });
  }

  if (filters.company) {
    conditions.push({ company: new RegExp(`^${escapeRegex(filters.company)}$`, 'i') });
  }

  if (filters.memberId) {
    const memberId = toObjectId(filters.memberId);
    if (memberId) {
      conditions.push({
        $or: [
          { approvedByMemberId: memberId },
          { rejectedByMemberId: memberId },
        ],
      });
    }
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

async function getAccessibleDelivery(user, deliveryId, { lean = true } = {}) {
  const homeId = await getOrEnsureHome(user);
  const objectId = assertDeliveryId(deliveryId);
  const query = { _id: objectId, homeId };
  const found = lean ? await Delivery.findOne(query).lean() : await Delivery.findOne(query);
  if (!found) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  return found;
}

async function buildHistorySummary(homeId, filters = {}) {
  const baseFilters = { ...filters, status: 'all' };
  const deliveredQuery = buildHistoryQuery(homeId, { ...baseFilters, status: 'delivered' });
  const rejectedQuery = buildHistoryQuery(homeId, { ...baseFilters, status: 'rejected' });

  const [successful, rejected] = await Promise.all([
    Delivery.countDocuments(deliveredQuery),
    Delivery.countDocuments(rejectedQuery),
  ]);

  return {
    total: successful + rejected,
    successful,
    delivered: successful,
    rejected,
  };
}

async function getSummary(user) {
  const homeId = await getOrEnsureHome(user);
  const [total, delivered, rejected] = await Promise.all([
    Delivery.countDocuments({ homeId }),
    Delivery.countDocuments({ homeId, status: 'delivered' }),
    Delivery.countDocuments({ homeId, status: 'rejected' }),
  ]);
  const upcoming = total - delivered - rejected;
  safeLog('[DELIVERY_HISTORY][SUMMARY]', 'fetched aggregate summary', {
    user: String(user._id),
    home: String(homeId),
    total,
    delivered,
    rejected,
  });
  return { total, upcoming, delivered, successful: delivered, rejected };
}

async function getHistorySummary(user, filters = {}) {
  const homeId = await getOrEnsureHome(user);
  const summary = await buildHistorySummary(homeId, filters);
  safeLog('[DELIVERY_HISTORY][SUMMARY]', 'fetched history summary', {
    user: String(user._id),
    home: String(homeId),
    month: filters.month || 'all',
    company: filters.company || '',
    memberId: filters.memberId || '',
  });
  return summary;
}

async function listDeliveries(user, { status, limit, cursor, search = '', category = '' }) {
  const homeId = await getOrEnsureHome(user);
  const q = { homeId };
  if (status) q.status = status;
  if (category) q.category = category;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    q.$or = [
      { title: regex },
      { orderId: regex },
      { company: regex },
      { partnerName: regex },
      { verificationCode: regex },
    ];
  }
  applyCursor(q, cursor);
  const items = await Delivery.find(q).sort({ _id: -1 }).limit(limit).lean();
  const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
  const summary = await getSummary(user);
  safeLog('[DELIVERY][UPCOMING]', 'fetched upcoming list', {
    user: String(user._id),
    home: String(homeId),
    status: status || 'all',
    limit,
    category: category || 'all',
    search,
  });
  return {
    summary,
    cards: [
      { key: 'total', label: 'Total', value: summary.total },
      { key: 'successful', label: 'Successful', value: summary.successful },
      { key: 'rejected', label: 'Rejected', value: summary.rejected },
    ],
    items,
    mobileItems: items.map((item) => historyProjection(item)),
    nextCursor,
    filters: { status: status || 'all', search, category: category || 'all' },
  };
}


async function getDashboard(user, filters = {}) {
  const summary = await getSummary(user);
  const list = await listDeliveries(user, {
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    limit: Number(filters.limit || 20),
    cursor: filters.cursor,
    search: filters.search || '',
    category: filters.category || '',
  });
  return {
    summary,
    cards: list.cards,
    filters: list.filters,
    items: list.mobileItems,
    rawItems: list.items,
    nextCursor: list.nextCursor,
  };
}

async function getHistory(user, filters = {}) {
  const homeId = await getOrEnsureHome(user);
  const page = Number(filters.page || 1);
  const limit = Number(filters.limit || 20);
  const listQuery = buildHistoryQuery(homeId, filters);
  if (filters.cursor) {
    applyCursor(listQuery, filters.cursor);
  }
  const summaryFilters = {
    month: filters.month,
    search: filters.search,
    memberId: filters.memberId,
    company: filters.company,
  };

  const totalItemsPromise = Delivery.countDocuments(listQuery);
  const summaryPromise = buildHistorySummary(homeId, summaryFilters);

  const query = Delivery.find(listQuery).sort({ _id: -1 });
  if (!filters.cursor) {
    query.skip((page - 1) * limit);
  }
  query.limit(limit);

  const items = await query.lean();
  const totalItems = await totalItemsPromise;
  const summary = await summaryPromise;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
  const hasNextPage = filters.cursor ? items.length === limit : page < totalPages;
  const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;

  safeLog('[DELIVERY_HISTORY][LIST]', 'fetched history list', {
    user: String(user._id),
    home: String(homeId),
    status: filters.status || 'all',
    page,
    limit,
    month: filters.month || 'all',
  });

  return {
    summary,
    filters: {
      selectedStatus: filters.status || 'all',
      selectedMonth: filters.month || null,
      selectedSearch: filters.search || '',
      selectedMemberId: filters.memberId || '',
      selectedCompany: filters.company || '',
    },
    items: items.map(historyProjection),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage,
      nextCursor,
    },
    nextCursor,
  };
}

async function getOne(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  safeLog('[DELIVERY][DETAIL]', 'fetched delivery detail', { delivery: String(item._id), orderId: item.orderId, status: item.status });
  return decorateDeliveryDetail(item);
}

async function getHistoryDetail(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  if (!HISTORY_STATUSES.includes(item.status)) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  safeLog('[DELIVERY_HISTORY][DETAIL]', 'fetched history detail', { delivery: String(item._id) });
  return decorateDeliveryDetail(item);
}

async function notifyArrival(device, body) {
  const homeId = device.ownerUserId || (body.homeId && mongoose.Types.ObjectId.isValid(body.homeId) ? new mongoose.Types.ObjectId(body.homeId) : null);
  if (!homeId) {
    throw createHttpError(400, 'DEVICE_HOME_MISSING', 'Device is not linked to a home');
  }

  const verificationCode = generateOtp(4);
  const payload = {
    homeId,
    createdByDeviceId: device._id,
    title: body.title || '',
    orderId: body.orderId,
    awbCode: body.awbCode || '',
    company: body.company || '',
    partnerName: body.partnerName || '',
    paymentStatus: body.paymentStatus || 'unknown',
    price: body.price ?? null,
    currency: body.currency || 'INR',
    otp: body.otp || '',
    verificationCode,
    status: 'upcoming',
    packageImageUrl: body.packageImageUrl || '',
    category: body.category || 'other',
    partnerRating: body.partnerRating ?? 0,
    specialInstruction: body.specialInstruction || '',
    recordingUrl: body.recordingUrl || '',
  };

  if (body.scheduledFor) {
    payload.scheduledFor = new Date(body.scheduledFor);
    payload.scheduleStatus = 'confirmed';
    const { accessStartAt, accessEndAt } = buildAccessWindow(payload.scheduledFor, 30);
    payload.accessStartAt = accessStartAt;
    payload.accessEndAt = accessEndAt;
  }

  const doc = await Delivery.create(payload);
  await Delivery.updateOne({ _id: doc._id }, { $set: { proofUrl: makeProofUrl(doc._id) } });

  safeLog('[DELIVERY]', 'arrival notified', { home: String(homeId), orderId: body.orderId, awbCode: body.awbCode || '', category: payload.category, device: String(device._id) });
  return { id: doc._id, status: doc.status, verificationCode, scheduleStatus: payload.scheduleStatus || 'none', awbCode: payload.awbCode, price: payload.price, currency: payload.currency };
}

async function approve(user, deliveryId) {
  const homeId = await getOrEnsureHome(user);
  const actor = await getActorMember(user, homeId);
  requireDeliveryPermission(actor);

  const delivery = await Delivery.findOne({ _id: assertDeliveryId(deliveryId), homeId });
  if (!delivery) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  if (delivery.status !== 'upcoming') {
    throw createHttpError(400, 'DELIVERY_ALREADY_PROCESSED', 'Delivery already processed');
  }

  delivery.status = 'delivered';
  delivery.deliveredAt = new Date();
  delivery.verificationMethod = 'app';
  delivery.verificationStatus = 'approved';
  delivery.approvedByMemberId = actor._id;
  delivery.proofGeneratedAt = new Date();
  delivery.proofUrl = makeProofUrl(delivery._id);
  await delivery.save();

  safeLog('[DELIVERY][APPROVE]', 'delivery approved from mobile app', { user: String(user._id), delivery: String(delivery._id), orderId: delivery.orderId, method: 'app' });
  return decorateDeliveryDetail(delivery.toObject());
}

async function reject(user, deliveryId, payload) {
  const homeId = await getOrEnsureHome(user);
  const actor = await getActorMember(user, homeId);
  requireDeliveryPermission(actor);

  const delivery = await Delivery.findOne({ _id: assertDeliveryId(deliveryId), homeId });
  if (!delivery) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  if (delivery.status !== 'upcoming') {
    throw createHttpError(400, 'DELIVERY_ALREADY_PROCESSED', 'Delivery already processed');
  }

  const reason = normalizeRejectionReason(payload);
  delivery.status = 'rejected';
  delivery.rejectedAt = new Date();
  delivery.rejectionReason = reason;
  delivery.rejectionCode = String(payload?.code || 'other').trim().toLowerCase() || 'other';
  delivery.verificationStatus = 'rejected';
  delivery.rejectedByMemberId = actor._id;
  delivery.proofGeneratedAt = new Date();
  delivery.proofUrl = makeProofUrl(delivery._id);
  await delivery.save();

  safeLog('[DELIVERY][REJECT]', 'delivery rejected from mobile app', { user: String(user._id), delivery: String(delivery._id), orderId: delivery.orderId, reason });
  return decorateDeliveryDetail(delivery.toObject());
}

async function verifyNfc(device, { orderId }) {
  const homeId = device.ownerUserId;
  if (!homeId) {
    throw createHttpError(400, 'DEVICE_HOME_MISSING', 'Device is not linked to a home');
  }
  const delivery = await Delivery.findOne({ homeId, orderId });
  if (!delivery) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  if (delivery.status !== 'upcoming') {
    throw createHttpError(400, 'DELIVERY_ALREADY_PROCESSED', 'Delivery already processed');
  }
  delivery.status = 'delivered';
  delivery.deliveredAt = new Date();
  delivery.verificationMethod = 'nfc';
  delivery.verificationStatus = 'approved';
  delivery.proofGeneratedAt = new Date();
  delivery.proofUrl = makeProofUrl(delivery._id);
  await delivery.save();
  safeLog('[DELIVERY][NFC]', 'delivery verified using nfc', { device: String(device._id), delivery: String(delivery._id), orderId: delivery.orderId });
  return decorateDeliveryDetail(delivery.toObject());
}

async function listScheduled(user) {
  const homeId = await getOrEnsureHome(user);
  const items = await Delivery.find({
    homeId,
    status: 'upcoming',
    scheduleStatus: { $in: ['confirmed', 'rescheduled'] },
    scheduledFor: { $ne: null },
  })
    .sort({ scheduledFor: 1, _id: -1 })
    .lean();
  return items;
}

async function rescheduleDelivery(user, deliveryId, { scheduledFor, specialInstruction = '', autoAccessWindowMinutes = 30 }) {
  const homeId = await getOrEnsureHome(user);
  const actor = await getActorMember(user, homeId);
  requireDeliveryPermission(actor);

  const delivery = await Delivery.findOne({ _id: assertDeliveryId(deliveryId), homeId, status: 'upcoming' });
  if (!delivery) {
    throw createHttpError(404, 'UPCOMING_DELIVERY_NOT_FOUND', 'Upcoming delivery not found');
  }

  const nextTime = new Date(scheduledFor);
  if (Number.isNaN(nextTime.getTime()) || nextTime.getTime() <= Date.now()) {
    throw createHttpError(400, 'INVALID_SCHEDULED_FOR', 'scheduledFor must be a valid future datetime');
  }

  const { accessStartAt, accessEndAt } = buildAccessWindow(nextTime, autoAccessWindowMinutes);
  delivery.scheduledFor = nextTime;
  delivery.specialInstruction = specialInstruction;
  delivery.autoAccessWindowMinutes = autoAccessWindowMinutes;
  delivery.accessStartAt = accessStartAt;
  delivery.accessEndAt = accessEndAt;
  delivery.scheduleStatus = delivery.scheduleStatus === 'none' ? 'confirmed' : 'rescheduled';
  delivery.rescheduledAt = new Date();
  await delivery.save();

  return {
    id: delivery._id,
    status: delivery.status,
    scheduleStatus: delivery.scheduleStatus,
    scheduledFor: delivery.scheduledFor,
    accessStartAt: delivery.accessStartAt,
    accessEndAt: delivery.accessEndAt,
    specialInstruction: delivery.specialInstruction,
  };
}

async function rateDelivery(user, deliveryId, { score, comment = '' }) {
  const homeId = await getOrEnsureHome(user);
  const actor = await getActorMember(user, homeId);
  const delivery = await Delivery.findOne({ _id: assertDeliveryId(deliveryId), homeId, status: 'delivered' });
  if (!delivery) {
    throw createHttpError(404, 'DELIVERED_ITEM_NOT_FOUND', 'Delivered item not found');
  }
  delivery.rating = {
    score,
    comment,
    ratedByMemberId: actor._id,
    ratedAt: new Date(),
  };
  await delivery.save();
  return delivery.rating.toObject ? delivery.rating.toObject() : delivery.rating;
}

async function getProof(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const proof = buildProofPayload(item);

  safeLog('[DELIVERY_HISTORY][PROOF]', 'fetched proof metadata', { delivery: String(item._id) });

  return {
    id: String(item._id),
    title: item.title,
    orderId: item.orderId,
    verificationCode: item.verificationCode || null,
    otp: item.otp || null,
    status: item.status,
    generatedAt: item.proofGeneratedAt || item.updatedAt,
    partnerName: item.partnerName || '',
    paymentStatus: item.paymentStatus,
    available: proof.available,
    fileName: proof.fileName,
    downloadUrl: proof.directDownloadUrl || proof.downloadUrl,
    metadataUrl: proof.downloadUrl,
    proofUrl: proof.downloadUrl,
    proofDirectDownloadUrl: proof.directDownloadUrl,
  };
}

async function getProofDownload(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const proof = buildProofPayload(item);
  if (!proof.available) {
    throw createHttpError(404, 'PROOF_NOT_FOUND', 'Proof file not available');
  }

  if (item.proofUrl && !isDefaultProofEndpoint(item)) {
    return {
      redirectUrl: item.proofUrl,
      filename: proof.fileName,
    };
  }

  const buffer = await renderProofPdf(item);
  return {
    filename: proof.fileName,
    buffer,
  };
}

async function getRecording(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const recording = buildRecordingPayload(item);

  safeLog('[DELIVERY_HISTORY][RECORDING]', 'fetched recording metadata', { delivery: String(item._id) });

  return {
    id: String(item._id),
    available: recording.available,
    type: recording.type,
    viewUrl: recording.directViewUrl || recording.viewUrl,
    metadataUrl: recording.viewUrl,
    streamUrl: recording.streamUrl,
    recordingUrl: recording.streamUrl,
    thumbnailUrl: recording.thumbnailUrl,
    durationSeconds: recording.durationSeconds,
    recordingSaved: recording.recordingSaved,
  };
}


function resolveRecordingStatus(item) {
  if (item.status === 'delivered') return 'completed';
  if (item.status === 'rejected') return 'rejected';
  return 'pending';
}

function buildRecordingCard(item) {
  const eventAt = getHistoryEventAt(item) || item.createdAt;
  const fileType = getRecordingFileType(item);
  return {
    id: String(item._id),
    title: item.title || item.orderId || 'Delivery recording',
    orderId: item.orderId,
    company: item.company || '',
    dateLabel: formatDateLabel(eventAt),
    timeLabel: formatTimeLabel(eventAt),
    status: resolveRecordingStatus(item),
    thumbnailUrl: item.recordingThumbnailUrl || item.packageImageUrl || '',
    viewUrl: makeRecordingEndpointUrl(item._id),
    downloadUrl: `${makeRecordingEndpointUrl(item._id)}?download=1`,
    shareUrl: `/api/v1/deliveries/${item._id}/recording/share`,
    fileType,
    durationSeconds: item.recordingDurationSeconds ?? null,
    sizeBytes: item.recordingSizeBytes ?? null,
  };
}

async function listRecordings(user, { status = 'all', search = '', days = '', page = 1, limit = 20 } = {}) {
  const homeId = await getOrEnsureHome(user);
  const q = { homeId, recordingUrl: { $ne: '' } };
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    q.$or = [{ title: regex }, { orderId: regex }, { company: regex }, { verificationCode: regex }];
  }
  const dayInt = Number(days || 0);
  if ([7, 15, 30].includes(dayInt)) {
    const from = new Date(Date.now() - dayInt * 24 * 60 * 60 * 1000);
    q.createdAt = { $gte: from };
  }
  const items = await Delivery.find(q).sort({ _id: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean();
  let rows = items;
  if (status && status !== 'all') rows = rows.filter((item) => resolveRecordingStatus(item) === status);
  const total = await Delivery.countDocuments(q);
  const totalStorageBytes = rows.reduce((sum, item) => sum + Number(item.recordingSizeBytes || 0), 0);
  return {
    summary: {
      totalRecordings: total,
      totalStorageBytes,
      totalStorageLabel: `${(totalStorageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
      thisMonth: rows.filter((item) => formatMonthKey(item.createdAt || new Date()) === formatMonthKey(new Date())).length,
    },
    filters: { status, search, days: dayInt || null, quickRanges: [7, 15, 30] },
    items: rows.map(buildRecordingCard),
  };
}

async function getRecordingDownload(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const recording = buildRecordingPayload(item);
  if (!recording.available || !recording.streamUrl) throw createHttpError(404, 'RECORDING_NOT_FOUND', 'Recording not available');
  return {
    redirectUrl: recording.streamUrl,
    filename: `${sanitizeFilenamePart(item.orderId || item._id)}.${recording.fileType || 'mp4'}`,
  };
}

async function getRecordingSharePayload(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const recording = buildRecordingPayload(item);
  if (!recording.available || !recording.streamUrl) throw createHttpError(404, 'RECORDING_NOT_FOUND', 'Recording not available');
  const text = `Delivery recording for order ${item.orderId} on ${formatDateLabel(getHistoryEventAt(item) || item.createdAt)} at ${formatTimeLabel(getHistoryEventAt(item) || item.createdAt)}.`;
  return {
    orderId: item.orderId,
    url: recording.directViewUrl || recording.streamUrl,
    whatsappDeepLink: `https://wa.me/?text=${encodeURIComponent(text + ' ' + (recording.directViewUrl || recording.streamUrl))}`,
    shareText: text,
    fileType: recording.fileType || getRecordingFileType(item),
  };
}

async function getRecordingDetail(user, deliveryId) {
  const item = await getAccessibleDelivery(user, deliveryId, { lean: true });
  const recording = buildRecordingPayload(item);
  return {
    id: String(item._id),
    orderId: item.orderId,
    title: item.title || item.orderId || 'Recording',
    company: item.company || '',
    dateLabel: formatDateLabel(getHistoryEventAt(item) || item.createdAt),
    timeLabel: formatTimeLabel(getHistoryEventAt(item) || item.createdAt),
    status: item.status,
    verificationCode: item.verificationCode || null,
    otp: item.otp || null,
    recordingDetails: {
      quality: item.recordingQuality || 'HD',
      durationSeconds: recording.durationSeconds,
      sizeBytes: item.recordingSizeBytes ?? null,
      fileType: recording.fileType || getRecordingFileType(item),
      type: recording.type,
      mimeType: recording.mimeType,
      recordingSaved: recording.recordingSaved,
      thumbnailUrl: recording.thumbnailUrl,
      streamUrl: recording.streamUrl,
    },
    deliveryInformation: {
      orderId: item.orderId,
      company: item.company || '',
      date: formatDateLabel(getHistoryEventAt(item) || item.createdAt),
      time: formatTimeLabel(getHistoryEventAt(item) || item.createdAt),
      otp: item.otp || null,
      verificationCode: item.verificationCode || null,
      status: item.status,
    },
    actions: {
      downloadUrl: `${makeRecordingEndpointUrl(item._id)}?download=1`,
      shareUrl: `/api/v1/deliveries/${item._id}/recording/share`,
      backUrl: '/api/v1/deliveries/recordings',
    },
  };
}


async function getHistoryFilters(user, { limitMonths = 12 } = {}) {
  const homeId = await getOrEnsureHome(user);
  const items = await Delivery.find({ homeId, status: { $in: HISTORY_STATUSES } })
    .sort({ _id: -1 })
    .limit(200)
    .lean();

  const monthMap = new Map();
  const companyMap = new Map();

  items.forEach((item) => {
    const eventAt = getHistoryEventAt(item);
    if (eventAt) {
      const monthKey = formatMonthKey(eventAt);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { key: monthKey, label: formatMonthLabel(monthKey) });
      }
    }
    if (item.company) {
      const companyKey = String(item.company).trim().toLowerCase();
      if (companyKey && !companyMap.has(companyKey)) {
        companyMap.set(companyKey, { key: companyKey, label: item.company });
      }
    }
  });

  safeLog('[DELIVERY_HISTORY][FILTERS]', 'fetched history filter metadata', {
    user: String(user._id),
    home: String(homeId),
    months: monthMap.size,
    companies: companyMap.size,
  });

  return {
    statuses: [
      { key: 'all', label: 'ALL' },
      { key: 'delivered', label: 'Delivered' },
      { key: 'rejected', label: 'Rejected' },
    ],
    months: [...monthMap.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, limitMonths),
    companies: [...companyMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

async function getRejectionReasons() {
  return DELIVERY_REJECTION_REASONS;
}

module.exports = {
  getSummary,
  getDashboard,
  getHistorySummary,
  getHistoryFilters,
  listDeliveries,
  getRejectionReasons,
  getHistory,
  getOne,
  getHistoryDetail,
  notifyArrival,
  approve,
  reject,
  verifyNfc,
  listScheduled,
  rescheduleDelivery,
  rateDelivery,
  getProof,
  getProofDownload,
  getRecording,
  getRecordingDetail,
  getRecordingDownload,
  getRecordingSharePayload,
  listRecordings,
};
