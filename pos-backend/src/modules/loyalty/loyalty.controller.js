const asyncHandler = require('../../common/utils/asyncHandler');
const loyaltyService = require('./loyalty.service');

const redeem = asyncHandler(async (req, res) => {
  const invoice = await loyaltyService.redeemPoints(req.body, req.user);
  res.json(invoice);
});

const adjust = asyncHandler(async (req, res) => {
  const result = await loyaltyService.adjustPoints(req.body, req.user);
  res.json(result);
});

const summary = asyncHandler(async (req, res) => {
  const result = await loyaltyService.getSummary(req.params.customerId);
  res.json(result);
});

const transactions = asyncHandler(async (req, res) => {
  const result = await loyaltyService.listTransactions(req.params.customerId, req.query);
  res.json(result);
});

module.exports = { redeem, adjust, summary, transactions };
