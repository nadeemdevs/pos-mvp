const asyncHandler = require('../../common/utils/asyncHandler');
const billingService = require('./billing.service');

const create = asyncHandler(async (req, res) => {
  const invoice = await billingService.createInvoice(req.body, req.user);
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
  const invoice = await billingService.updateInvoice(req.params.id, req.body, req.user);
  res.json(invoice);
});

module.exports = { create, list, getOne, update };
