const bcrypt = require('bcryptjs');
const User = require('./user.model');
const asyncHandler = require('../../common/utils/asyncHandler');
const { getActiveBranchCodes } = require('../../common/middleware/tenantContext');

const SALT_ROUNDS = 10;

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.passwordHash;
  return obj;
}

// Phase 6.5 — validate an incoming `branchId` against the tenant's actual
// ACTIVE branch codes (same cache tenantContext.js already maintains for the
// x-branch-id header). Returns the normalized (lowercase) code, or throws a
// 400 for an unknown/inactive code. `undefined` input is left as-is — callers
// decide the default ('main' on create, unchanged on update).
async function validateBranchId(tenantId, branchId) {
  if (branchId === undefined || branchId === null || branchId === '') return undefined;

  const codes = await getActiveBranchCodes(tenantId);
  const normalized = String(branchId).toLowerCase();
  if (!codes.has(normalized)) {
    const err = new Error(`Unknown or inactive branch: ${branchId}`);
    err.status = 400;
    throw err;
  }
  return normalized;
}

// User is NOT branch-scoped by the tenantPlugin (no automatic scoping hook
// applies here), so the "All Branches" filter is applied manually: a real
// branch code filters to that branch, req.branchId === 'all' (or absent)
// returns every user tenant-wide.
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.branchId && req.branchId !== 'all') {
    filter.branchId = req.branchId;
  }
  const users = await User.find(filter).populate('role', 'name permissions').select('-passwordHash');
  res.json(users);
});

const getOne = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role', 'name permissions').select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role, active, branchId } = req.body;
  if (!password) return res.status(400).json({ message: 'password is required' });

  const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'default';
  const validatedBranchId = (await validateBranchId(tenantId, branchId)) || 'main';

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role, active, branchId: validatedBranchId });
  res.status(201).json(sanitize(user));
});

const update = asyncHandler(async (req, res) => {
  const { name, email, password, role, active, branchId } = req.body;
  const update = { name, email, role, active };

  if (branchId !== undefined) {
    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'default';
    update.branchId = await validateBranchId(tenantId, branchId);
  }

  if (password) {
    update.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  const user = await User.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).select('-passwordHash');

  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
});

module.exports = { list, getOne, create, update, remove };
