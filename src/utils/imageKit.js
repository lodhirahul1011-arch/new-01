const axios = require('axios');
const FormData = require('form-data');

function getConfig() {
  const privateKey = process.env.IMAGE_KIT_PRIVATE_KEY || process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGE_KIT_URL_ENDPOINT || process.env.IMAGEKIT_URL_ENDPOINT;

  if (!privateKey || !urlEndpoint) {
    const err = new Error('ImageKit credentials are not configured');
    err.status = 500;
    err.code = 'IMAGEKIT_CONFIG_MISSING';
    throw err;
  }

  return {
    privateKey,
    urlEndpoint: urlEndpoint.replace(/\/+$/, ''),
  };
}

function authHeader(privateKey) {
  return `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  const status = error.response?.status;
  return !status || status === 429 || status >= 500;
}

async function uploadImage({ buffer, fileName, folder, contentType, tags = [] }) {
  const { privateKey } = getConfig();
  const resolvedFileName = fileName || `image-${Date.now()}.jpg`;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData();
    form.append('file', buffer, {
      filename: resolvedFileName,
      contentType: contentType || 'image/jpeg',
    });
    form.append('fileName', resolvedFileName);
    form.append('useUniqueFileName', 'true');
    if (folder) form.append('folder', folder);
    if (tags.length) form.append('tags', tags.join(','));

    try {
      const response = await axios.post('https://upload.imagekit.io/api/v1/files/upload', form, {
        headers: {
          ...form.getHeaders(),
          Authorization: authHeader(privateKey),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000,
      });

      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !shouldRetry(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }

  const message = lastError?.response?.data?.message || lastError?.message || 'ImageKit upload failed';
  const err = new Error(message);
  err.status = lastError?.response?.status || 502;
  err.code = 'IMAGEKIT_UPLOAD_FAILED';
  throw err;
}

async function deleteImage(fileId) {
  if (!fileId) return;
  const { privateKey } = getConfig();

  try {
    await axios.delete(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      headers: {
        Authorization: authHeader(privateKey),
      },
    });
  } catch (error) {
    if (error.response?.status === 404) return;
    throw error;
  }
}

async function listImages({ path = '/', limit = 100 } = {}) {
  const { privateKey } = getConfig();

  try {
    const response = await axios.get('https://api.imagekit.io/v1/files', {
      headers: {
        Authorization: authHeader(privateKey),
      },
      params: {
        path,
        limit,
        fileType: 'image',
      },
    });

    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'ImageKit list failed';
    const err = new Error(message);
    err.status = error.response?.status || 502;
    err.code = 'IMAGEKIT_LIST_FAILED';
    throw err;
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  listImages,
};
