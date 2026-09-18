const mongoose = require('mongoose');

/**
 * Resolve a user's homeId.
 * - If user.primaryHomeId is set, use it.
 * - Else fallback to user._id.
 */
function resolveHomeId(user) {
  const id = user?.primaryHomeId || user?._id;
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null;
}

module.exports = { resolveHomeId };
