const bcrypt = require('bcryptjs');
const User = require('./user.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const SALT_ROUNDS = 10;

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.passwordHash;
  return obj;
}

const list = asyncHandler(async (req, res) => {
  const users = await User.find().populate('role', 'name permissions').select('-passwordHash');
  res.json(users);
});

const getOne = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role', 'name permissions').select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role, active } = req.body;
  if (!password) return res.status(400).json({ message: 'password is required' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role, active });
  res.status(201).json(sanitize(user));
});

const update = asyncHandler(async (req, res) => {
  const { name, email, password, role, active } = req.body;
  const update = { name, email, role, active };

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
