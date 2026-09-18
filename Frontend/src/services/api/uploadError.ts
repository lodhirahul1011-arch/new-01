import { logs } from '../logs';

export const IMAGE_TOO_LARGE_MESSAGE =
  'Image is too large. Please upload a smaller file.';

const UNSUPPORTED_IMAGE_MESSAGE =
  'This image format is not supported. Please choose a JPG, PNG, or WEBP image.';
const NETWORK_UPLOAD_MESSAGE =
  'Network is slow or unstable. Please keep the app open and try again.';

function getUploadStatus(error: any) {
  const status = error?.status;
  const originalStatus = error?.originalStatus;

  if (status !== undefined && Number.isFinite(Number(status))) {
    return Number(status);
  }

  if (
    originalStatus !== undefined &&
    Number.isFinite(Number(originalStatus))
  ) {
    return Number(originalStatus);
  }

  return status ?? originalStatus ?? error?.data?.status;
}

function getUploadErrorText(error: any) {
  const candidates = [
    error?.data?.message,
    error?.data?.error,
    typeof error?.data === 'string' ? error.data : '',
    error?.error,
    error?.message,
  ];

  return candidates
    .filter(value => typeof value === 'string')
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(' ');
}

export function isImageUploadTooLargeError(error: any) {
  const status = getUploadStatus(error);
  const text = getUploadErrorText(error).toLowerCase();

  return (
    Number(status) === 413 ||
    text.includes('413 request entity too large') ||
    text.includes('request entity too large') ||
    text.includes('payload too large') ||
    text.includes('content too large') ||
    text.includes('file too large') ||
    text.includes('limit_file_size')
  );
}

export function isImageFileTooLarge(
  fileSize: number | null | undefined,
  maximumBytes: number,
) {
  return typeof fileSize === 'number' && fileSize > maximumBytes;
}

function isUnsafeServerMessage(message: string) {
  const normalized = message.trim().toLowerCase();

  return (
    !normalized ||
    normalized.length > 240 ||
    normalized.startsWith('<') ||
    normalized.startsWith('{') ||
    normalized.startsWith('[') ||
    normalized.includes('<html') ||
    normalized.includes('<body') ||
    normalized.includes('nginx') ||
    normalized.includes('stack trace') ||
    normalized.includes('syntaxerror') ||
    normalized.includes('exception at')
  );
}

export function getUserFriendlyImageUploadError(
  error: any,
  fallbackMessage = 'Could not upload image. Please try again.',
) {
  const status = getUploadStatus(error);
  const text = getUploadErrorText(error);

  if (isImageUploadTooLargeError(error)) {
    logs.info('[upload] oversized image response mapped to user-friendly message', {
      status,
    });
    logs.error('[upload] image rejected because it exceeds the upload limit', {
      status,
    });
    return IMAGE_TOO_LARGE_MESSAGE;
  }

  const normalizedText = text.toLowerCase();
  if (
    normalizedText.includes('unsupported media') ||
    normalizedText.includes('invalid mime') ||
    normalizedText.includes('only image') ||
    normalizedText.includes('file type')
  ) {
    logs.info('[upload] unsupported image response mapped to user-friendly message', {
      status,
    });
    logs.error('[upload] image rejected because its format is unsupported', {
      status,
    });
    return UNSUPPORTED_IMAGE_MESSAGE;
  }

  if (
    status === 'FETCH_ERROR' ||
    status === 'TIMEOUT_ERROR' ||
    Number(status) === 408 ||
    normalizedText.includes('network') ||
    normalizedText.includes('failed to fetch') ||
    normalizedText.includes('timeout')
  ) {
    logs.info('[upload] network upload failure mapped to user-friendly message', {
      status,
    });
    logs.error('[upload] image upload failed because of network connectivity', {
      status,
    });
    return NETWORK_UPLOAD_MESSAGE;
  }

  if (
    !isUnsafeServerMessage(text) &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  ) {
    logs.info('[upload] safe validation message retained', { status });
    logs.error('[upload] image upload rejected by validation', { status });
    return text;
  }

  logs.error('[upload] raw or technical upload error replaced', { status });
  logs.info('[upload] generic user-friendly upload message selected', { status });
  return fallbackMessage;
}