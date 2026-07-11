const Shift = require('./shift.model');
const Payment = require('../payments/payment.model');
const { nextShiftNumber } = require('../../common/utils/shiftNumber');
const auditService = require('../audit/audit.service');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function cashSalesSum(from, to, branchId) {
  const match = {
    method: 'CASH',
    status: 'SUCCESS',
    createdAt: { $gte: from, $lte: to },
  };
  if (branchId) match.branchId = branchId;

  const [agg] = await Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  return agg ? agg.total : 0;
}

function movementsSum(movements, type) {
  return (movements || []).filter((m) => m.type === type).reduce((sum, m) => sum + m.amount, 0);
}

async function cashBreakdown(shift) {
  const to = shift.status === 'CLOSED' && shift.closedAt ? shift.closedAt : new Date();
  const cashSales = round2(await cashSalesSum(shift.openedAt, to, shift.branchId));
  const movementsIn = round2(movementsSum(shift.movements, 'IN'));
  const movementsOut = round2(movementsSum(shift.movements, 'OUT'));
  const expectedCash = round2(shift.openingFloat + cashSales + movementsIn - movementsOut);

  return {
    openingFloat: shift.openingFloat,
    cashSales,
    movementsIn,
    movementsOut,
    expectedCash,
    declaredCash: shift.declaredCash,
    variance: shift.variance,
  };
}

async function openShift({ openingFloat }, user, branchId) {
  const floatNum = Number(openingFloat);
  if (!(floatNum >= 0)) throw badRequest('openingFloat must be a non-negative number');

  const existing = await Shift.findOne({ status: 'OPEN', branchId });
  if (existing) {
    const err = new Error('A shift is already open for this branch');
    err.status = 409;
    throw err;
  }

  const shiftNumber = await nextShiftNumber();

  const shift = await Shift.create({
    shiftNumber,
    status: 'OPEN',
    openedBy: { id: user.id, name: user.name },
    openedAt: new Date(),
    openingFloat: floatNum,
    movements: [],
  });

  auditService.log({ user, action: 'shift.open', entity: 'Shift', entityId: shift._id, meta: { shiftNumber, openingFloat: floatNum } });

  return shift;
}

async function getCurrentShift(branchId) {
  const shift = await Shift.findOne({ status: 'OPEN', branchId });
  if (!shift) throw notFound('No shift is currently open');

  const summary = await cashBreakdown(shift);
  return { shift, cashSummary: summary };
}

async function addMovement(id, payload, user) {
  const shift = await Shift.findById(id);
  if (!shift) throw notFound('Shift not found');
  if (shift.status !== 'OPEN') throw badRequest('Movements can only be added to an OPEN shift');

  const { type, amount, reason } = payload;
  if (!['IN', 'OUT'].includes(type)) throw badRequest('type must be IN or OUT');
  const amountNum = Number(amount);
  if (!(amountNum > 0)) throw badRequest('amount must be a positive number');
  if (!reason) throw badRequest('reason is required');

  shift.movements.push({ type, amount: amountNum, reason, by: { id: user.id, name: user.name }, at: new Date() });
  await shift.save();

  auditService.log({ user, action: 'shift.movement', entity: 'Shift', entityId: shift._id, meta: { type, amount: amountNum, reason } });

  return shift;
}

async function closeShift(id, payload, user) {
  const shift = await Shift.findById(id);
  if (!shift) throw notFound('Shift not found');
  if (shift.status !== 'OPEN') throw badRequest('Shift is already closed');

  const { declaredCash, note } = payload;
  const declaredNum = Number(declaredCash);
  if (!(declaredNum >= 0)) throw badRequest('declaredCash must be a non-negative number');

  const now = new Date();
  const cashSales = round2(await cashSalesSum(shift.openedAt, now, shift.branchId));
  const movementsIn = round2(movementsSum(shift.movements, 'IN'));
  const movementsOut = round2(movementsSum(shift.movements, 'OUT'));
  const expectedCash = round2(shift.openingFloat + cashSales + movementsIn - movementsOut);
  const variance = round2(declaredNum - expectedCash);

  shift.status = 'CLOSED';
  shift.closedBy = { id: user.id, name: user.name };
  shift.closedAt = now;
  shift.expectedCash = expectedCash;
  shift.declaredCash = declaredNum;
  shift.variance = variance;
  if (note !== undefined) shift.note = note;

  await shift.save();

  auditService.log({
    user,
    action: 'shift.close',
    entity: 'Shift',
    entityId: shift._id,
    meta: { expectedCash, declaredCash: declaredNum, variance },
  });

  return shift;
}

async function listShifts(query, branchId) {
  const { page = 1, limit = 20 } = query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const filter = branchId ? { branchId } : {};

  const [items, total] = await Promise.all([
    Shift.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Shift.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getShift(id) {
  const shift = await Shift.findById(id);
  if (!shift) throw notFound('Shift not found');

  const summary = await cashBreakdown(shift);
  return { shift, cashSummary: summary };
}

module.exports = { openShift, getCurrentShift, addMovement, closeShift, listShifts, getShift };
