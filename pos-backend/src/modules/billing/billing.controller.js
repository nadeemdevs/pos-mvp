const asyncHandler = require('../../common/utils/asyncHandler');
const billingService = require('./billing.service');
const approvalsService = require('../approvals/approvals.service');
const auditService = require('../audit/audit.service');

// Checks the x-approval-token header (Phase 5.2 manager-PIN override) and,
// if valid, audits 'approval.used' against the resulting invoice.
function checkApproval(req) {
  const token = req.headers['x-approval-token'];
  const { valid } = approvalsService.verifyApprovalToken(token);
  return valid;
}

// Gates editing/refunding an already-PAID invoice. Managers/Admins (who hold
// billing.refund) act freely; a Cashier without it can still trigger the same
// action but is challenged for a one-shot manager-PIN approval token first —
// identical precedent to the max-discount-override flow above.
function canManagePaidInvoice(req) {
  return req.user.role === 'Admin' || req.user.permissions.includes('billing.refund') || checkApproval(req);
}

function auditApprovalUsed(req, invoice) {
  auditService.log({
    req,
    action: 'approval.used',
    entity: 'Invoice',
    entityId: invoice._id,
    meta: { invoiceNumber: invoice.invoiceNumber, discount: invoice.discount },
  });
}

const create = asyncHandler(async (req, res) => {
  const approved = checkApproval(req);
  const invoice = await billingService.createInvoice(req.body, req.user, { approved });
  if (approved) auditApprovalUsed(req, invoice);
  res.status(201).json(invoice);
});

const list = asyncHandler(async (req, res) => {
  const result = await billingService.listInvoices(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const invoice = await billingService.getInvoice(req.params.id);
  res.json(invoice);
});

const update = asyncHandler(async (req, res) => {
  const approved = checkApproval(req);
  const canEditPaid = canManagePaidInvoice(req);
  const invoice = await billingService.updateInvoice(req.params.id, req.body, req.user, { approved, canEditPaid });
  if (approved) auditApprovalUsed(req, invoice);
  res.json(invoice);
});

const refund = asyncHandler(async (req, res) => {
  if (!canManagePaidInvoice(req)) {
    return res.status(403).json({ message: 'Manager approval required to refund a paid invoice' });
  }
  const result = await billingService.refundInvoice(req.params.id, { ...req.body, user: req.user, req });
  res.json(result);
});

const settle = asyncHandler(async (req, res) => {
  if (!canManagePaidInvoice(req)) {
    return res.status(403).json({ message: 'Manager approval required to settle a paid invoice balance' });
  }
  const payment = await billingService.settleDelta(req.params.id, { ...req.body, user: req.user, req });
  res.json(payment);
});

const print = asyncHandler(async (req, res) => {
  const result = await billingService.printReceipt(req.params.id);
  res.json(result);
});

module.exports = { create, list, getOne, update, refund, settle, print };
