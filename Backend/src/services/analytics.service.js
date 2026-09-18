const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Delivery = require('../models/Delivery');
const DeliverySchedule = require('../models/DeliverySchedule');
const FamilyMember = require('../models/FamilyMember');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { safeLog, logs } = require('../utils/logger');

async function getHome(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    const err = new Error('Invalid user');
    err.status = 401;
    throw err;
  }
  if (!user.primaryHomeId) {
    await User.updateOne({ _id: user._id }, { $set: { primaryHomeId: homeId } });
    user.primaryHomeId = homeId;
  }
  return homeId;
}

function resolveMonthBounds(monthArg) {
  const now = new Date();
  const monthStr =
    monthArg ||
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const prevStart = new Date(Date.UTC(y, m - 2, 1, 0, 0, 0, 0));
  return { monthStr, start, end, prevStart, prevEnd: start };
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthChipLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const short = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${short === 'Sep' ? 'Sept' : short} ${y}`;
}

function buildWhatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function appendQuery(url, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    doc.on('data', d => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.end();
  });
}

function percentage(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function chooseDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function inferCategoryFromText(...parts) {
  const text = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('sample') ||
    text.includes('supply') ||
    text.includes('fabric') ||
    text.includes('textile') ||
    text.includes('office') ||
    text.includes('business')
  ) {
    return 'business';
  }

  if (
    text.includes('grocery') ||
    text.includes('kitchen') ||
    text.includes('clean') ||
    text.includes('household') ||
    text.includes('home')
  ) {
    return 'household';
  }

  if (text) return 'personal';
  return 'other';
}

function mapLegacyDelivery(doc) {
  const eventDate = chooseDate(doc.deliveredAt, doc.rejectedAt, doc.createdAt, doc.updatedAt);
  const status = doc.status === 'rejected' ? 'rejected' : doc.status === 'delivered' ? 'delivered' : 'upcoming';
  return {
    source: 'legacy',
    id: String(doc._id),
    dedupeKey: `legacy:${String(doc._id)}`,
    eventDate,
    status,
    category: doc.category || 'other',
    memberName: '',
    approvedByMemberId: doc.approvedByMemberId ? String(doc.approvedByMemberId) : '',
    rejectedByMemberId: doc.rejectedByMemberId ? String(doc.rejectedByMemberId) : '',
    paymentStatus: doc.paymentStatus || 'unknown',
    recordingSaved: doc.recordingSaved !== false,
    title: doc.title || 'Delivery',
    orderId: doc.orderId || '',
    awbNumber: '',
    referenceId: doc.orderId || '',
    company: doc.company || '',
    partnerName: doc.partnerName || '',
    verificationCode: doc.verificationCode || '',
    rating: doc.rating?.score ?? doc.partnerRating ?? null,
    rawText: [doc.title, doc.orderId, doc.company, doc.partnerName].filter(Boolean).join(' '),
  };
}

function mapScheduleDelivery(doc) {
  const eventDate = chooseDate(doc.completedAt, doc.updatedAt, doc.createdAt);
  const memberName = String(doc.customerName || '').trim();
  const referenceId = String(doc.referenceId || '').trim();
  const company = String(doc.deliveryCompany || '').trim().toLowerCase();
  const rawText = [
    doc.productSummary,
    doc.sellerName,
    doc.orderHint,
    referenceId,
    doc.latestSmsId?.rawText,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    source: 'sms_schedule',
    id: String(doc._id),
    dedupeKey: [referenceId || String(doc._id), company || 'unknown', eventDate?.toISOString().slice(0, 10) || '']
      .join('|'),
    eventDate,
    status: doc.currentStatus === 'failed' ? 'rejected' : doc.currentStatus,
    category: inferCategoryFromText(
      doc.productSummary,
      doc.sellerName,
      doc.orderHint,
      doc.latestSmsId?.rawText,
    ),
    memberName,
    approvedByMemberId: '',
    rejectedByMemberId: '',
    paymentStatus:
      /(?:cash on delivery|\bcod\b)/i.test(rawText) ? 'cod' : 'unknown',
    recordingSaved: true,
    title: doc.productSummary || doc.sellerName || 'Delivery',
    orderId: doc.orderHint || '',
    awbNumber: doc.awbNumber || doc.latestSmsId?.extractedData?.awbNumber || '',
    referenceId,
    company: doc.deliveryCompany || '',
    partnerName: doc.riderName || doc.latestSmsId?.extractedData?.riderName || '',
    verificationCode: doc.otpCode || doc.latestSmsId?.extractedData?.otpCode || '',
    rating: typeof doc.rating === 'number' ? doc.rating : null,
    rawText,
  };
}

function formatReportDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function statusLabel(status) {
  if (status === 'rejected') return 'Rejected';
  if (status === 'delivered') return 'Received';
  return 'Pending';
}

function buildDeliveryDetails(deliveries) {
  return deliveries
    .slice()
    .sort((a, b) => (b.eventDate?.getTime?.() || 0) - (a.eventDate?.getTime?.() || 0))
    .map(item => ({
      id: item.id,
      date: item.eventDate ? item.eventDate.toISOString() : '',
      dateLabel: formatReportDate(item.eventDate),
      status: item.status,
      statusLabel: statusLabel(item.status),
      category: item.category,
      title: item.title || 'Delivery',
      orderId: item.orderId || '',
      awbNumber: item.awbNumber || '',
      referenceId: item.referenceId || '',
      company: item.company || '',
      customerName: item.memberName || '',
      partnerName: item.partnerName || '',
      verificationCode: item.verificationCode || '',
      paymentStatus: item.paymentStatus || 'unknown',
      rating: item.rating,
    }));
}

function mergeAnalyticsDeliveries(legacyDocs, scheduleDocs) {
  const merged = new Map();

  scheduleDocs.forEach(doc => {
    const item = mapScheduleDelivery(doc);
    merged.set(item.dedupeKey, item);
  });

  legacyDocs.forEach(doc => {
    const item = mapLegacyDelivery(doc);
    if (!merged.has(item.dedupeKey)) {
      merged.set(item.dedupeKey, item);
    }
  });

  return Array.from(merged.values());
}

function buildAvailableMonths(user) {
  const createdAt = user?.createdAt ? new Date(user.createdAt) : new Date();
  const start = Number.isNaN(createdAt.getTime())
    ? new Date()
    : new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), 1));
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const months = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: monthChipLabel(key),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function buildFamilyMemberBreakdown(deliveries, members) {
  if (members.length === 1) {
    const onlyMember = members[0];
    return [
      {
        memberId: String(onlyMember._id),
        name: onlyMember.name,
        count: deliveries.length,
      },
    ];
  }

  const memberMap = new Map(
    members.map(member => [
      String(member._id),
      {
        memberId: String(member._id),
        name: member.name,
        count: 0,
      },
    ]),
  );

  const nameToId = new Map(
    members.map(member => [normalizeKey(member.name), String(member._id)]),
  );

  const otherBuckets = new Map();

  deliveries.forEach(item => {
    const explicitMemberId = item.approvedByMemberId || item.rejectedByMemberId;
    if (explicitMemberId && memberMap.has(explicitMemberId)) {
      memberMap.get(explicitMemberId).count += 1;
      return;
    }

    const memberNameKey = normalizeKey(item.memberName);
    const matchedMemberId = memberNameKey ? nameToId.get(memberNameKey) : null;
    if (matchedMemberId && memberMap.has(matchedMemberId)) {
      memberMap.get(matchedMemberId).count += 1;
      return;
    }

    const fallbackName = item.memberName || 'Others';
    const existing = otherBuckets.get(fallbackName) || {
      memberId: `other:${fallbackName}`,
      name: fallbackName,
      count: 0,
    };
    existing.count += 1;
    otherBuckets.set(fallbackName, existing);
  });

  return [...memberMap.values(), ...otherBuckets.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

async function buildReport(user, monthArg, category) {
  const homeId = await getHome(user);
  const { monthStr, start, end, prevStart, prevEnd } = resolveMonthBounds(monthArg);

  const [
    legacyMonthDeliveries,
    legacyPreviousMonthDeliveries,
    scheduleMonthDeliveries,
    schedulePreviousMonthDeliveries,
    members,
  ] = await Promise.all([
    Delivery.find({ homeId, createdAt: { $gte: start, $lt: end } }).lean(),
    Delivery.find({ homeId, createdAt: { $gte: prevStart, $lt: prevEnd } }).lean(),
    DeliverySchedule.find({
      homeId,
      currentStatus: { $in: ['delivered', 'failed'] },
      $or: [
        { completedAt: { $gte: start, $lt: end } },
        { updatedAt: { $gte: start, $lt: end } },
        { createdAt: { $gte: start, $lt: end } },
      ],
    })
      .populate('latestSmsId', 'rawText extractedData')
      .lean(),
    DeliverySchedule.find({
      homeId,
      currentStatus: { $in: ['delivered', 'failed'] },
      $or: [
        { completedAt: { $gte: prevStart, $lt: prevEnd } },
        { updatedAt: { $gte: prevStart, $lt: prevEnd } },
        { createdAt: { $gte: prevStart, $lt: prevEnd } },
      ],
    })
      .populate('latestSmsId', 'rawText extractedData')
      .lean(),
    FamilyMember.find({ homeId, status: 'active' }).lean(),
  ]);

  const allMonthDeliveries = mergeAnalyticsDeliveries(
    legacyMonthDeliveries,
    scheduleMonthDeliveries,
  );
  const previousMonthDeliveries = mergeAnalyticsDeliveries(
    legacyPreviousMonthDeliveries,
    schedulePreviousMonthDeliveries,
  );

  const deliveries =
    category && category !== 'all'
      ? allMonthDeliveries.filter(item => item.category === category)
      : allMonthDeliveries;
  const comparisonDeliveries =
    category && category !== 'all'
      ? previousMonthDeliveries.filter(item => item.category === category)
      : previousMonthDeliveries;

  const totalDeliveries = deliveries.length;
  const successful = deliveries.filter(d => d.status === 'delivered').length;
  const rejected = deliveries.filter(d => d.status === 'rejected').length;
  const previousTotal = comparisonDeliveries.length;
  const changeCount = totalDeliveries - previousTotal;
  const changePercentage = previousTotal
    ? Math.round((changeCount / previousTotal) * 100)
    : totalDeliveries
      ? 100
      : 0;

  const categoryBase = [
    { key: 'business', label: 'Business Deliveries' },
    { key: 'household', label: 'Household' },
    { key: 'personal', label: 'Personal' },
    { key: 'other', label: 'Other' },
  ];

  const categories = categoryBase.map(c => {
    const count = allMonthDeliveries.filter(d => d.category === c.key).length;
    return {
      key: c.key,
      label: c.label,
      count,
      percentage: percentage(count, allMonthDeliveries.length),
    };
  });

  const byFamilyMember = buildFamilyMemberBreakdown(deliveries, members);

  const securityInsights = {
    approvedDeliveries: successful,
    videoRecordingsSaved: deliveries.filter(d => d.recordingSaved !== false).length,
    codPaymentsTracked: deliveries.filter(d => d.paymentStatus === 'cod').length,
    businessReceiptsGenerated: deliveries.filter(d => d.category === 'business').length,
  };

  const deliveryDetails = buildDeliveryDetails(deliveries);
  const categoryQuery = category && category !== 'all' ? { category } : {};
  const whatsappText = `Dvaari report for ${monthLabel(monthStr)}${category && category !== 'all' ? ` (${category})` : ''}: total ${totalDeliveries}, received ${successful}, rejected ${rejected}.`;

  const report = {
    month: monthStr,
    monthLabel: monthLabel(monthStr),
    availableMonths: buildAvailableMonths(user),
    selectedCategory: category || 'all',
    totalDeliveries,
    successful,
    rejected,
    comparison: {
      previousMonth: new Date(prevStart).toISOString().slice(0, 7),
      previousMonthLabel: monthLabel(new Date(prevStart).toISOString().slice(0, 7)),
      previousTotal,
      changeCount,
      changePercentage,
    },
    categories,
    filters: {
      availableCategories: [{ key: 'all', label: 'Filter' }, ...categoryBase],
    },
    byFamilyMember,
    securityInsights,
    deliveryDetails,
    expenseReports: {
      pdfUrl: appendQuery('/api/v1/analytics/export/pdf', { month: monthStr, ...categoryQuery }),
      excelUrl: appendQuery('/api/v1/analytics/export/excel', { month: monthStr, ...categoryQuery }),
      whatsappShareUrl: appendQuery('/api/v1/analytics/share/whatsapp', { month: monthStr, ...categoryQuery }),
      whatsappText,
      whatsappDeepLink: buildWhatsappUrl(whatsappText),
    },
  };

  safeLog('[ANALYTICS][MONTHLY]', 'built monthly report', {
    user: String(user._id),
    home: String(homeId),
    month: monthStr,
    category: category || 'all',
    totalDeliveries,
    successful,
    rejected,
    legacyCount: legacyMonthDeliveries.length,
    scheduleCount: scheduleMonthDeliveries.length,
  });

  return report;
}

async function getMonthlyReport(user, monthArg, category) {
  return buildReport(user, monthArg, category);
}

const PDF_THEME = Object.freeze({
  navy: '#163A70',
  blue: '#2563EB',
  blueLight: '#EAF2FF',
  green: '#159B62',
  greenLight: '#E9F8F1',
  red: '#D84A4A',
  redLight: '#FDEEEE',
  amber: '#B7791F',
  amberLight: '#FFF7E6',
  ink: '#172033',
  muted: '#64748B',
  border: '#DCE4EF',
  surface: '#F7F9FC',
  white: '#FFFFFF',
});

function pdfContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pdfPageBottom(doc) {
  return doc.page.height - doc.page.margins.bottom - 18;
}

function formatPdfValue(value, fallback = '-') {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return fallback;
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}

function formatPdfMetricLabel(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function drawPdfBrandHeader(doc, report, continuation = false) {
  const left = doc.page.margins.left;
  const width = pdfContentWidth(doc);
  const top = continuation ? 28 : 34;
  const height = continuation ? 48 : 78;

  doc.save();
  doc.roundedRect(left, top, width, height, 12).fill(PDF_THEME.navy);

  const markSize = continuation ? 30 : 42;
  const markX = left + 16;
  const markY = top + (height - markSize) / 2;
  doc.roundedRect(markX, markY, markSize, markSize, 9).fill(PDF_THEME.blue);
  doc
    .font('Helvetica-Bold')
    .fontSize(continuation ? 16 : 22)
    .fillColor(PDF_THEME.white)
    .text('D', markX, markY + (continuation ? 6 : 9), {
      width: markSize,
      align: 'center',
      lineBreak: false,
    });

  const brandX = markX + markSize + 12;
  doc
    .font('Helvetica-Bold')
    .fontSize(continuation ? 14 : 19)
    .fillColor(PDF_THEME.white)
    .text('DVAARI', brandX, top + (continuation ? 10 : 17), {
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(continuation ? 8 : 10)
    .fillColor('#D9E7FF')
    .text(
      continuation ? 'Monthly report' : 'Smart delivery insights',
      brandX,
      top + (continuation ? 28 : 43),
      { lineBreak: false },
    );

  doc
    .font('Helvetica-Bold')
    .fontSize(continuation ? 10 : 13)
    .fillColor(PDF_THEME.white)
    .text(report.monthLabel, left + width - 190, top + (continuation ? 11 : 20), {
      width: 170,
      align: 'right',
      lineBreak: false,
    });
  if (!continuation) {
    const filterLabel =
      report.selectedCategory === 'all'
        ? 'All delivery categories'
        : `${formatPdfMetricLabel(report.selectedCategory)} deliveries`;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#D9E7FF')
      .text(filterLabel, left + width - 190, top + 43, {
        width: 170,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.restore();
  doc.x = left;
  doc.y = top + height + (continuation ? 18 : 24);
}

function ensurePdfSpace(doc, report, requiredHeight) {
  if (doc.y + requiredHeight <= pdfPageBottom(doc)) return false;
  doc.addPage();
  drawPdfBrandHeader(doc, report, true);
  return true;
}

function drawPdfSectionTitle(doc, report, title, subtitle) {
  ensurePdfSpace(doc, report, subtitle ? 46 : 32);
  const left = doc.page.margins.left;
  const top = doc.y;
  doc.save();
  doc.roundedRect(left, top + 1, 4, 19, 2).fill(PDF_THEME.blue);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(PDF_THEME.ink)
    .text(title, left + 12, top, { lineBreak: false });
  if (subtitle) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_THEME.muted)
      .text(subtitle, left + 12, top + 21, {
        width: pdfContentWidth(doc) - 12,
      });
  }
  doc.restore();
  doc.x = left;
  doc.y = top + (subtitle ? 43 : 29);
}

function drawPdfMetricCards(doc, report) {
  ensurePdfSpace(doc, report, 80);
  const left = doc.page.margins.left;
  const top = doc.y;
  const gap = 9;
  const width = (pdfContentWidth(doc) - gap * 3) / 4;
  const change = Number(report.comparison.changePercentage || 0);
  const metrics = [
    {
      label: 'Total deliveries',
      value: report.totalDeliveries,
      color: PDF_THEME.blue,
      background: PDF_THEME.blueLight,
    },
    {
      label: 'Received',
      value: report.successful,
      color: PDF_THEME.green,
      background: PDF_THEME.greenLight,
    },
    {
      label: 'Rejected',
      value: report.rejected,
      color: PDF_THEME.red,
      background: PDF_THEME.redLight,
    },
    {
      label: 'Vs previous month',
      value: `${change > 0 ? '+' : ''}${change}%`,
      color: PDF_THEME.amber,
      background: PDF_THEME.amberLight,
    },
  ];

  doc.save();
  metrics.forEach((metric, index) => {
    const x = left + index * (width + gap);
    doc.roundedRect(x, top, width, 68, 10).fill(metric.background);
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(metric.color)
      .text(String(metric.value), x + 12, top + 12, {
        width: width - 24,
        lineBreak: false,
      });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PDF_THEME.muted)
      .text(metric.label, x + 12, top + 42, {
        width: width - 24,
        lineBreak: false,
      });
  });
  doc.restore();
  doc.x = left;
  doc.y = top + 84;
}

function pdfTableRowHeight(doc, columns, row) {
  doc.font('Helvetica').fontSize(8);
  return Math.max(
    27,
    ...columns.map(column =>
      doc.heightOfString(formatPdfValue(row[column.key]), {
        width: column.width - 12,
        lineGap: 1,
      }) + 12,
    ),
  );
}

function drawPdfTableHeader(doc, columns, top) {
  const left = doc.page.margins.left;
  const height = 26;
  let x = left;
  doc.save();
  doc.roundedRect(left, top, pdfContentWidth(doc), height, 6).fill(PDF_THEME.navy);
  columns.forEach(column => {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(PDF_THEME.white)
      .text(column.label, x + 6, top + 8, {
        width: column.width - 12,
        align: column.align || 'left',
        lineBreak: false,
      });
    x += column.width;
  });
  doc.restore();
  doc.y = top + height;
}

function drawPdfTable(doc, report, columns, rows) {
  ensurePdfSpace(doc, report, 54);
  drawPdfTableHeader(doc, columns, doc.y);

  rows.forEach((row, rowIndex) => {
    const rowHeight = pdfTableRowHeight(doc, columns, row);
    if (doc.y + rowHeight > pdfPageBottom(doc)) {
      doc.addPage();
      drawPdfBrandHeader(doc, report, true);
      drawPdfTableHeader(doc, columns, doc.y);
    }

    const top = doc.y;
    const left = doc.page.margins.left;
    let x = left;
    doc.save();
    doc
      .rect(left, top, pdfContentWidth(doc), rowHeight)
      .fill(rowIndex % 2 === 0 ? PDF_THEME.surface : PDF_THEME.white);
    doc
      .moveTo(left, top + rowHeight)
      .lineTo(left + pdfContentWidth(doc), top + rowHeight)
      .strokeColor(PDF_THEME.border)
      .lineWidth(0.5)
      .stroke();
    columns.forEach(column => {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(PDF_THEME.ink)
        .text(formatPdfValue(row[column.key]), x + 6, top + 6, {
          width: column.width - 12,
          align: column.align || 'left',
          lineGap: 1,
        });
      x += column.width;
    });
    doc.restore();
    doc.x = left;
    doc.y = top + rowHeight;
  });
  doc.y += 18;
}

function addPdfFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    const left = doc.page.margins.left;
    const width = pdfContentWidth(doc);
    const top = doc.page.height - 33;
    doc.save();
    doc
      .moveTo(left, top - 7)
      .lineTo(left + width, top - 7)
      .strokeColor(PDF_THEME.border)
      .lineWidth(0.5)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PDF_THEME.muted)
      .text('Generated securely by Dvaari', left, top, {
        lineBreak: false,
      });
    doc.text(`Page ${pageIndex + 1} of ${range.count}`, left, top, {
      width,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
  }
}

async function exportMonthlyPdf(user, monthArg, category) {
  try {
    const report = await buildReport(user, monthArg, category);
    logs.info('[ANALYTICS][PDF] rendering branded monthly report', {
      month: report.month,
      category: report.selectedCategory,
      deliveryCount: report.deliveryDetails.length,
    });

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 42, bottom: 50, left: 42 },
      bufferPages: true,
      info: {
        Title: `Dvaari Monthly Report - ${report.monthLabel}`,
        Author: 'Dvaari',
        Subject: 'Monthly delivery analytics report',
      },
    });
    const contentWidth = pdfContentWidth(doc);

    drawPdfBrandHeader(doc, report);
    drawPdfSectionTitle(
      doc,
      report,
      'Monthly delivery overview',
      `A concise summary of delivery activity for ${report.monthLabel}.`,
    );
    drawPdfMetricCards(doc, report);

    drawPdfSectionTitle(doc, report, 'Delivery categories');
    drawPdfTable(
      doc,
      report,
      [
        { key: 'label', label: 'Category', width: contentWidth * 0.58 },
        { key: 'count', label: 'Deliveries', width: contentWidth * 0.2, align: 'right' },
        { key: 'percentageLabel', label: 'Share', width: contentWidth * 0.22, align: 'right' },
      ],
      report.categories.map(item => ({
        ...item,
        percentageLabel: `${item.percentage}%`,
      })),
    );

    drawPdfSectionTitle(doc, report, 'By family member');
    drawPdfTable(
      doc,
      report,
      [
        { key: 'name', label: 'Family member', width: contentWidth * 0.72 },
        { key: 'count', label: 'Deliveries', width: contentWidth * 0.28, align: 'right' },
      ],
      report.byFamilyMember.length
        ? report.byFamilyMember
        : [{ name: 'No family member activity', count: 0 }],
    );

    drawPdfSectionTitle(doc, report, 'Security insights');
    drawPdfTable(
      doc,
      report,
      [
        { key: 'label', label: 'Metric', width: contentWidth * 0.72 },
        { key: 'value', label: 'Count', width: contentWidth * 0.28, align: 'right' },
      ],
      Object.entries(report.securityInsights).map(([key, value]) => ({
        label: formatPdfMetricLabel(key),
        value,
      })),
    );

    drawPdfSectionTitle(
      doc,
      report,
      'Delivery details',
      'Received and rejected deliveries included in this report.',
    );
    if (!report.deliveryDetails.length) {
      ensurePdfSpace(doc, report, 58);
      const top = doc.y;
      doc
        .roundedRect(doc.page.margins.left, top, contentWidth, 48, 8)
        .fill(PDF_THEME.surface);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(PDF_THEME.muted)
        .text('No received or rejected deliveries were found for this filter.', doc.page.margins.left + 14, top + 17, {
          width: contentWidth - 28,
          align: 'center',
        });
      doc.y = top + 64;
    } else {
      drawPdfTable(
        doc,
        report,
        [
          { key: 'date', label: 'Date', width: 70 },
          { key: 'status', label: 'Status', width: 56 },
          { key: 'delivery', label: 'Delivery', width: 112 },
          { key: 'company', label: 'Company', width: 76 },
          { key: 'reference', label: 'Order / AWB', width: 126 },
          { key: 'verification', label: 'Verification', width: contentWidth - 440 },
        ],
        report.deliveryDetails.map(item => ({
          date: item.dateLabel,
          status: item.statusLabel,
          delivery: item.title || 'Delivery',
          company: item.company,
          reference: `Order: ${formatPdfValue(item.orderId || item.referenceId)}\nAWB: ${formatPdfValue(item.awbNumber)}`,
          verification: item.verificationCode || '-',
        })),
      );
    }

    addPdfFooters(doc);
    const buffer = await pdfToBuffer(doc);
    logs.info('[ANALYTICS][PDF] branded monthly report rendered', {
      month: report.month,
      bytes: buffer.length,
    });
    return { filename: `dvaari-monthly-report-${report.month}.pdf`, buffer };
  } catch (error) {
    logs.error('[ANALYTICS][PDF] failed to render monthly report', {
      month: monthArg || null,
      category: category || 'all',
      error: error?.message || String(error),
    });
    throw error;
  }
}

async function exportMonthlyExcel(user, monthArg, category) {
  const report = await buildReport(user, monthArg, category);
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary');
  summary.addRow(['Month', report.monthLabel]);
  summary.addRow(['Category Filter', report.selectedCategory]);
  summary.addRow(['Total Deliveries', report.totalDeliveries]);
  summary.addRow(['Successful', report.successful]);
  summary.addRow(['Rejected', report.rejected]);
  summary.addRow(['Previous Month Total', report.comparison.previousTotal]);
  summary.addRow(['Change %', report.comparison.changePercentage]);

  const categories = wb.addWorksheet('Categories');
  categories.addRow(['Category', 'Count', 'Percentage']);
  report.categories.forEach(item =>
    categories.addRow([item.label, item.count, item.percentage]),
  );

  const membersWs = wb.addWorksheet('Family Members');
  membersWs.addRow(['Member', 'Deliveries']);
  report.byFamilyMember.forEach(item =>
    membersWs.addRow([item.name, item.count]),
  );

  const security = wb.addWorksheet('Security');
  security.addRow(['Metric', 'Count']);
  Object.entries(report.securityInsights).forEach(([key, value]) =>
    security.addRow([key, value]),
  );

  const details = wb.addWorksheet('Delivery Details');
  details.addRow([
    'Date',
    'Status',
    'Category',
    'Title',
    'Company',
    'Order ID',
    'AWB',
    'Reference ID',
    'Customer',
    'Partner',
    'Verification Code',
    'Payment Status',
    'Rating',
  ]);
  report.deliveryDetails.forEach(item => {
    details.addRow([
      item.dateLabel,
      item.statusLabel,
      item.category,
      item.title,
      item.company,
      item.orderId,
      item.awbNumber,
      item.referenceId,
      item.customerName,
      item.partnerName,
      item.verificationCode,
      item.paymentStatus,
      item.rating ?? '',
    ]);
  });

  [summary, categories, membersWs, security, details].forEach(ws => {
    ws.columns.forEach(column => {
      column.width = 18;
    });
    ws.getRow(1).font = { bold: true };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return { filename: `dvaari-monthly-report-${report.month}.xlsx`, buffer };
}

async function getSharePayload(user, monthArg, category) {
  const report = await buildReport(user, monthArg, category);
  return {
    whatsappText: report.expenseReports.whatsappText,
    whatsappDeepLink: report.expenseReports.whatsappDeepLink,
    summary: report,
  };
}

module.exports = {
  getMonthlyReport,
  exportMonthlyPdf,
  exportMonthlyExcel,
  getSharePayload,
};
