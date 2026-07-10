const mongoose = require('mongoose');

// Immutable snapshot of what was fired to the kitchen — deliberately
// disconnected from menu/order item shape so later edits to the menu or the
// order never retroactively change a ticket that's already in the kitchen.
const kotItemModifierSchema = new mongoose.Schema({ name: { type: String, required: true } }, { _id: false });

const kotItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    modifiers: { type: [kotItemModifierSchema], default: [] },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const statusTimelineSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const kotSchema = new mongoose.Schema(
  {
    kotNumber: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    tableName: { type: String },
    items: { type: [kotItemSchema], default: [] },
    status: {
      type: String,
      enum: ['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'],
      default: 'NEW',
    },
    statusTimeline: {
      type: [statusTimelineSchema],
      default: () => [{ status: 'NEW', at: new Date() }],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Kot', kotSchema);
