const familyService = require('../services/family.service');

async function list(req, res, next) {
  try {
    const items = await familyService.listMembers(req.user);
    return res.json({ ok: true, data: items });
  } catch (err) {
    return next(err);
  }
}

async function invite(req, res, next) {
  try {
    const data = await familyService.inviteMember(req.user, req.body);
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const data = await familyService.acceptInvite(req.user, req.body);
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function patchMember(req, res, next) {
  try {
    const data = await familyService.updateMember(req.user, req.params.memberId, req.body);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const data = await familyService.removeMember(req.user, req.params.memberId);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function roles(req, res) {
  return res.json({
    ok: true,
    data: {
      roles: [
        { key: 'owner', label: 'Owner', capabilities: ['manage_family', 'manage_settings', 'approve_delivery', 'reject_delivery'] },
        { key: 'admin', label: 'Admin', capabilities: ['manage_family', 'approve_delivery', 'reject_delivery'] },
        { key: 'member', label: 'Member', capabilities: ['approve_delivery', 'reject_delivery'] },
      ],
      accessLevels: [
        { key: 'full', label: 'Full Access', description: 'Can receive deliveries and manage home settings.' },
        { key: 'simple', label: 'Simple Mode', description: 'Can receive deliveries with limited controls.' },
        { key: 'nfc_only', label: 'NFC Only', description: 'App approval disabled. NFC card required.' },
      ],
    },
  });
}

module.exports = { list, roles, invite, acceptInvite, patchMember, remove };
