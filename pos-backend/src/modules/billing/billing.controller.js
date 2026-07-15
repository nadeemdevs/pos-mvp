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
  const invoice = await billingService.updateInvoice(req.params.id, req.body, req.user, { approved });
  if (approved) auditApprovalUsed(req, invoice);
  res.json(invoice);
});

module.exports = { create, list, getOne, update };
