const Kot = require('./kot.model');
const kotMachine = require('./kot.machine');
const Setting = require('../settings/setting.model');
const printerFactory = require('../printing/PrinterFactory');
const { emitTo } = require('../../sockets');

const DEFAULT_KDS_STATUSES = ['NEW', 'PREPARING', 'READY'];

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function emitKotEvent(event, payload) {
  emitTo('kitchen', event, payload);
  emitTo('floor', event, payload);
}

async function listKots(query) {
  const statuses = query.statuses ? query.statuses.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_KDS_STATUSES;

  const kots = await Kot.find({ status: { $in: statuses } }).sort({ createdAt: 1 });
  return kots;
}

async function updateStatus(id, toStatus) {
  const kot = await Kot.findById(id);
  if (!kot) throw notFound('KOT not found');

  kotMachine.assertTransition(kot.status, toStatus);

  kot.status = toStatus;
  kot.statusTimeline.push({ status: toStatus, at: new Date() });
  await kot.save();

  emitKotEvent('kot.updated', kot);
  if (toStatus === 'READY') {
    emitKotEvent('kot.ready', kot);
  }

  if (toStatus === 'SERVED') {
    const siblings = await Kot.find({ orderId: kot.orderId });
    const allServed = siblings.every((k) => k.status === 'SERVED' || k.status === 'CANCELLED');
    if (allServed) {
      // Kitchen progress is derived, not stored on the order — just nudge
      // any listening UI to refresh.
      emitTo('floor', 'order.updated', { orderId: kot.orderId, orderNumber: kot.orderNumber });
    }
  }

  return kot;
}

function buildKotPrintPayload(kot) {
  return {
    title: `KOT ${kot.kotNumber}`,
    meta: [
      ['Table', kot.tableName || '-'],
      ['Order', kot.orderNumber || '-'],
      ['Time', new Date(kot.createdAt).toLocaleString()],
    ],
    lines: kot.items.map((item) => ({
      qty: item.qty,
      name: item.modifiers && item.modifiers.length ? `${item.name} (${item.modifiers.map((m) => m.name).join(', ')})` : item.name,
      note: item.note || '',
    })),
    footer: '',
  };
}

async function printKot(id) {
  const kot = await Kot.findById(id);
  if (!kot) throw notFound('KOT not found');

  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  const printingConfig = settings.printing && settings.printing.toObject ? settings.printing.toObject() : settings.printing || {};
  const kotConfig = printingConfig.kot || { provider: 'BROWSER' };

  const payload = buildKotPrintPayload(kot);
  const provider = printerFactory.get(kotConfig.provider);
  return provider.print(payload, kotConfig);
}

module.exports = { listKots, updateStatus, printKot, buildKotPrintPayload };
