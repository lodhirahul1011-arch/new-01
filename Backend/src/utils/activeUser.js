function activeUserFilter(extra = {}) {
  return {
    ...extra,
    isDeleted: { $ne: true },
  };
}

function isUserDeleted(user) {
  return Boolean(user && user.isDeleted === true);
}

module.exports = {
  activeUserFilter,
  isUserDeleted,
};
