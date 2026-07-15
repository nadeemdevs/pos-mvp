const Reservation = require('./reservation.model');
const Table = require('../tables/table.model');
const customersService = require('../customers/customers.service');
const ordersService = require('../orders/orders.service');
const reservationMachine = require('./reservation.machine');
const { nextReservationNumber } = require('../../common/utils/reservationNumber');
const eventBus = require('../../common/eventBus');
const auditService = require('../audit/audit.service');

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

function reservationSummary(reservation) {
  return {
    _id: reservation._id,
    reservationNumber: reservation.reservationNumber,
    customer: reservation.customer,
    partySize: reservation.partySize,
    scheduledAt: reservation.scheduledAt,
    tableId: reservation.tableId,
    tableName: reservation.tableName,
    status: reservation.status,
    orderId: reservation.orderId,
  };
}

function publishUpdate(reservation) {
  eventBus.publish('reservation.updated', reservationSummary(reservation));
}

// Same local-day boundary logic as reports.controller's localDay, applied to
// scheduledAt rather than createdAt.
function localDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

async function createReservation(payload, user) {
  const { customer, partySize = 2, scheduledAt, tableId, note } = payload;

  if (!customer || !customer.phone || !customer.name) {
    throw badRequest('customer.name and customer.phone are required');
  }
  if (!scheduledAt) throw badRequest('scheduledAt is required');

  const customerDoc = await customersService.upsertByPhone(customer);

  let tableName;
  if (tableId) {
    const table = await Table.findById(tableId);
    if (!table) throw badRequest('Table not found');
    tableName = table.name;
  }

  const reservationNumber = await nextReservationNumber();

  const reservation = await Reservation.create({
    reservationNumber,
    customerId: customerDoc ? customerDoc._id : null,
    customer: { name: customer.name, phone: customer.phone },
    partySize,
    scheduledAt: new Date(scheduledAt),
    tableId: tableId || undefined,
    tableName,
    note,
    status: 'BOOKED',
  });

  publishUpdate(reservation);
  auditService.log({ user, action: 'reservation.create', entity: 'Reservation', entityId: reservation._id, meta: { reservationNumber } });

  return reservation;
}

async function listReservations(query) {
  const { date, status, page = 1, limit = 20 } = query;
  const filter = {};

  if (status) filter.status = status;
  if (date) {
    const { start, end } = localDay(date);
    filter.scheduledAt = { $gte: start, $lte: end };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .sort({ scheduledAt: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Reservation.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getReservation(id) {
  const reservation = await Reservation.findById(id);
  if (!reservation) throw notFound('Reservation not found');
  return reservation;
}

async function updateReservation(id, payload) {
  const reservation = await getReservation(id);
  if (reservation.status !== 'BOOKED') {
    throw badRequest('Only BOOKED reservations can be edited');
  }

  const { partySize, scheduledAt, tableId, note, customer } = payload;

  if (partySize !== undefined) reservation.partySize = partySize;
  if (scheduledAt !== undefined) reservation.scheduledAt = new Date(scheduledAt);
  if (note !== undefined) reservation.note = note;
  if (customer !== undefined) reservation.customer = { name: customer.name, phone: customer.phone };

  if (tableId !== undefined) {
    if (tableId) {
      const table = await Table.findById(tableId);
      if (!table) throw badRequest('Table not found');
      reservation.tableId = table._id;
      reservation.tableName = table.name;
    } else {
      reservation.tableId = undefined;
      reservation.tableName = undefined;
    }
  }

  await reservation.save();
  publishUpdate(reservation);
  return reservation;
}

async function seatReservation(id, payload, user) {
  const reservation = await getReservation(id);
  reservationMachine.assertTransition(reservation.status, 'SEATED');

  const { tableId } = payload;
  if (!tableId) throw badRequest('tableId is required');

  const table = await Table.findById(tableId);
  if (!table) throw badRequest('Table not found');
  if (table.status !== 'FREE') throw badRequest('Table is not free');

  const order = await ordersService.createOrder(
    { tableId: table._id, guestCount: reservation.partySize, type: 'DINE_IN' },
    user
  );

  reservation.status = 'SEATED';
  reservation.orderId = order._id;
  reservation.tableId = table._id;
  reservation.tableName = table.name;
  await reservation.save();

  publishUpdate(reservation);
  auditService.log({ user, action: 'reservation.seat', entity: 'Reservation', entityId: reservation._id, meta: { orderId: order._id, tableId: table._id } });

  return { reservation, order };
}

async function cancelReservation(id, user) {
  const reservation = await getReservation(id);
  reservationMachine.assertTransition(reservation.status, 'CANCELLED');
  reservation.status = 'CANCELLED';
  await reservation.save();

  publishUpdate(reservation);
  auditService.log({ user, action: 'reservation.cancel', entity: 'Reservation', entityId: reservation._id });

  return reservation;
}

async function noShowReservation(id, user) {
  const reservation = await getReservation(id);
  reservationMachine.assertTransition(reservation.status, 'NO_SHOW');
  reservation.status = 'NO_SHOW';
  await reservation.save();

  publishUpdate(reservation);
  auditService.log({ user, action: 'reservation.noShow', entity: 'Reservation', entityId: reservation._id });

  return reservation;
}

// Subscriber hook: called when the order tied to a SEATED reservation completes.
async function completeByOrderId(orderId) {
  const reservation = await Reservation.findOne({ orderId, status: 'SEATED' });
  if (!reservation) return;

  reservationMachine.assertTransition(reservation.status, 'COMPLETED');
  reservation.status = 'COMPLETED';
  await reservation.save();

  publishUpdate(reservation);
  auditService.log({ action: 'reservation.complete', entity: 'Reservation', entityId: reservation._id, meta: { orderId } });
}

module.exports = {
  createReservation,
  listReservations,
  getReservation,
  updateReservation,
  seatReservation,
  cancelReservation,
  noShowReservation,
  completeByOrderId,
  reservationSummary,
};
