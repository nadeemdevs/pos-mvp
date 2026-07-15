const asyncHandler = require('../../common/utils/asyncHandler');
const approvalsService = require('./approvals.service');

const verify = asyncHandler(async (req, res) => {
  const result = await approvalsService.verifyPin(req.body.pin, req.user, req);
  res.json(result);
});

module.exports = { verify };
