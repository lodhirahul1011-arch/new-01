function isValidTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (err) {
    return false;
  }
}

function isValidHHmm(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
}

function compareHHmm(a, b) {
  const [ah, am] = String(a || '00:00').split(':').map(Number);
  const [bh, bm] = String(b || '00:00').split(':').map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

function formatTimeLabel(value, timeZone = 'UTC') {
  if (!isValidHHmm(value)) return '';
  const [hours, minutes] = String(value).split(':').map(Number);
  const sample = new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
  return sample.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

function formatTimeWindowLabel(startTime, endTime, timeZone = 'UTC') {
  const start = formatTimeLabel(startTime, timeZone);
  const end = formatTimeLabel(endTime, timeZone);
  if (!start && !end) return '';
  return `${start} - ${end}`;
}

function formatCurrency(value, currency = 'INR', locale = 'en-IN') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch (err) {
    return `${currency} ${Number(value || 0)}`;
  }
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const token = (parts.find((part) => part.type === 'timeZoneName') || {}).value || 'GMT+0';
  const match = token.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedLocalToUtc(dateKey, timeValue, timeZone = 'UTC') {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  const offset = getTimeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60 * 1000);
}

function getLocalParts(date = new Date(), timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun',
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    dateKey: `${map.year}-${map.month}-${map.day}`,
    weekday: weekdayMap[map.weekday] || 'mon',
    time: `${map.hour}:${map.minute}`,
  };
}

function addDays(dateKey, amount) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + amount, 0, 0, 0, 0));
  return utc.toISOString().slice(0, 10);
}

module.exports = {
  isValidTimeZone,
  isValidHHmm,
  compareHHmm,
  formatTimeLabel,
  formatTimeWindowLabel,
  formatCurrency,
  zonedLocalToUtc,
  getLocalParts,
  addDays,
};
