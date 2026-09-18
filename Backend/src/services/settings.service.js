const User = require('../models/User');
const Device = require('../models/Device');
const NfcCard = require('../models/NfcCard');
const SupportTicket = require('../models/SupportTicket');
const DeviceIntegration = require('../models/DeviceIntegration');
const { resolveHomeId } = require('../utils/home');

const SUPPORTED_LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'Hindi' },
  { key: 'ta', label: 'Tamil' },
  { key: 'te', label: 'Telugu' },
  { key: 'bn', label: 'Bengali' },
  { key: 'mr', label: 'Marathi' },
  { key: 'gu', label: 'Gujarati' },
  { key: 'kn', label: 'Kannada' },
  { key: 'ml', label: 'Malayalam' },
  { key: 'pa', label: 'Punjabi' },
];

const FAQS = [
  {
    id: 'faq_link_device',
    question: 'How do I set up my Dvaari device?',
    answer: 'Open Linked Devices, scan the QR shown on your device, and confirm the pairing request.',
  },
  {
    id: 'faq_notifications',
    question: 'How can I change notification preferences?',
    answer: 'Go to Notifications in Settings and toggle the alerts you want to receive.',
  },
  {
    id: 'faq_nfc',
    question: 'How do I manage my NFC card?',
    answer: 'Open NFC Card settings to activate, deactivate, or replace cards assigned to your home access.',
  },
  {
    id: 'faq_language',
    question: 'Can I change the app language?',
    answer: 'Yes. Use Change Language and choose from the supported languages list.',
  },
];

const SUPPORT_CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp Support', value: '+91-90000-00000', availability: '9 AM - 8 PM' },
  { key: 'call', label: 'Call Support', value: '+91-1800-000-000', availability: '24x7' },
  { key: 'email', label: 'Email Support', value: 'support@dvaari.com', availability: 'Replies within 24 hours' },
];

function languageLabel(key) {
  return SUPPORTED_LANGUAGES.find((x) => x.key === key)?.label || key;
}

function normalizeProfile(user) {
  return {
    id: user._id,
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    address: user.address || '',
    avatarUrl: user.avatar?.url || '',
    isVerified: !!user.isVerified,
  };
}

function mapNotificationPrefs(user) {
  const notifications = user.preferences?.notifications || {};
  return {
    doorbellAlerts: !!notifications.doorbellAlerts,
    deliveryNotifications: !!notifications.deliveryNotifications,
    visitorRecognition: !!notifications.visitorRecognition,
    securityAlerts: !!notifications.securityAlerts,
    deviceStatus: !!notifications.deviceStatus,
    weeklySummary: !!notifications.weeklySummary,
    sound: user.preferences?.sound || 'default',
    vibration: user.preferences?.vibration !== false,
  };
}

async function requireUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return user;
}

async function getSettingsOverview(userId) {
  const user = await requireUser(userId);
  const homeId = resolveHomeId(user);
  const [linkedDevices, linkedTablets, activeCards, pendingTickets, connectedIntegrations, activeNfcCard] = await Promise.all([
    Device.countDocuments({ ownerUserId: userId, isLinked: true }),
    Device.countDocuments({ linkedHomeId: homeId, isLinked: true, type: 'tablet' }),
    NfcCard.countDocuments({ homeId, status: 'active' }),
    SupportTicket.countDocuments({ userId, status: { $in: ['open', 'in_progress'] } }),
    DeviceIntegration.countDocuments({ userId, status: 'connected' }),
    NfcCard.findOne({ homeId, status: 'active' }).sort({ registeredAt: -1, createdAt: -1 }).select('label status lastUsedAt'),
  ]);

  const lastUsedLabel = activeNfcCard?.lastUsedAt
    ? new Date(activeNfcCard.lastUsedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return {
    profile: normalizeProfile(user),
    summary: {
      linkedDevices,
      linkedTablets,
      activeNfcCards: activeCards,
      connectedApps: connectedIntegrations,
      openSupportRequests: pendingTickets,
      homeId,
    },
    preferences: {
      language: {
        key: user.preferences?.language || 'en',
        label: languageLabel(user.preferences?.language || 'en'),
      },
      notifications: mapNotificationPrefs(user),
      mode: user.preferences?.mode || 'active',
    },
    nfcCard: {
      enabled: true,
      hasRegisteredCard: !!activeNfcCard,
      status: activeNfcCard?.status || 'inactive',
      label: activeNfcCard?.label || '',
      lastUsedLabel: activeNfcCard?.lastUsedAt ? `Today, ${lastUsedLabel}` : 'Never used',
      route: '/api/v1/nfc/cards/overview',
    },
    menu: [
      { key: 'edit_profile', label: 'Edit Profile', route: '/api/v1/users/me' },
      { key: 'linked_devices', label: 'Linked Devices', route: '/api/v1/devices/linked/summary', badge: linkedDevices },
      { key: 'tablets', label: 'Tablet Devices', route: '/api/v1/tablet/devices', badge: linkedTablets },
      { key: 'device_management', label: 'Device Management', route: '/api/v1/devices/wallpapers', badge: connectedIntegrations },
      { key: 'notifications', label: 'Notifications', route: '/api/v1/settings/notifications' },
      { key: 'nfc_cards', label: 'NFC Card', route: '/api/v1/nfc/cards/overview', badge: activeCards },
      { key: 'language', label: 'Language', route: '/api/v1/settings/language', value: languageLabel(user.preferences?.language || 'en') },
      { key: 'help_support', label: 'Help & Support', route: '/api/v1/settings/help', badge: pendingTickets },
    ],
  };
}

async function getNotificationSettings(userId) {
  const user = await requireUser(userId);
  return {
    settings: mapNotificationPrefs(user),
    sections: [
      { key: 'alerts', label: 'Alerts' },
      { key: 'sound_vibration', label: 'Sound & Vibration' },
    ],
  };
}

async function updateNotificationSettings(userId, patch) {
  const user = await requireUser(userId);
  user.preferences = user.preferences || {};
  user.preferences.notifications = {
    ...(user.preferences.notifications || {}),
    doorbellAlerts:
      patch.doorbellAlerts !== undefined ? patch.doorbellAlerts : user.preferences.notifications?.doorbellAlerts,
    deliveryNotifications:
      patch.deliveryNotifications !== undefined ? patch.deliveryNotifications : user.preferences.notifications?.deliveryNotifications,
    visitorRecognition:
      patch.visitorRecognition !== undefined ? patch.visitorRecognition : user.preferences.notifications?.visitorRecognition,
    securityAlerts:
      patch.securityAlerts !== undefined ? patch.securityAlerts : user.preferences.notifications?.securityAlerts,
    deviceStatus: patch.deviceStatus !== undefined ? patch.deviceStatus : user.preferences.notifications?.deviceStatus,
    weeklySummary:
      patch.weeklySummary !== undefined ? patch.weeklySummary : user.preferences.notifications?.weeklySummary,
  };
  if (patch.sound !== undefined) user.preferences.sound = patch.sound;
  if (patch.vibration !== undefined) user.preferences.vibration = patch.vibration;
  await user.save();
  return getNotificationSettings(userId);
}

async function getLanguageSettings(userId) {
  const user = await requireUser(userId);
  const current = user.preferences?.language || 'en';
  return {
    current: { key: current, label: languageLabel(current) },
    supported: SUPPORTED_LANGUAGES,
  };
}

async function updateLanguage(userId, language) {
  const user = await requireUser(userId);
  const supported = SUPPORTED_LANGUAGES.some((x) => x.key === language);
  if (!supported) {
    const err = new Error('Language not supported');
    err.status = 400;
    err.code = 'LANGUAGE_NOT_SUPPORTED';
    throw err;
  }
  user.preferences = user.preferences || {};
  user.preferences.language = language;
  await user.save();
  return getLanguageSettings(userId);
}

async function getHelpSupport(userId) {
  await requireUser(userId);
  const recentTickets = await SupportTicket.find({ userId }).sort({ createdAt: -1 }).limit(5).select('subject category channel status createdAt');
  return {
    channels: SUPPORT_CHANNELS,
    faqs: FAQS,
    recentTickets,
  };
}

async function createSupportTicket(userId, payload) {
  const user = await requireUser(userId);
  const homeId = resolveHomeId(user);
  const ticket = await SupportTicket.create({
    userId,
    homeId,
    channel: payload.channel,
    category: payload.category,
    subject: payload.subject,
    message: payload.message,
    priority: payload.priority || 'normal',
    meta: {
      appVersion: payload.appVersion,
      devicePlatform: payload.devicePlatform,
    },
  });
  return {
    id: ticket._id,
    status: ticket.status,
    subject: ticket.subject,
    category: ticket.category,
    channel: ticket.channel,
    createdAt: ticket.createdAt,
  };
}

module.exports = {
  getSettingsOverview,
  getNotificationSettings,
  updateNotificationSettings,
  getLanguageSettings,
  updateLanguage,
  getHelpSupport,
  createSupportTicket,
};
