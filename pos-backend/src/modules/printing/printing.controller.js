const asyncHandler = require('../../common/utils/asyncHandler');
const Setting = require('../settings/setting.model');
const factory = require('./PrinterFactory');

const test = asyncHandler(async (req, res) => {
  const { target } = req.body;
  if (!['kot', 'receipt'].includes(target)) {
    return res.status(400).json({ message: 'target must be "kot" or "receipt"' });
  }

  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  const printingConfig = settings.printing && settings.printing.toObject ? settings.printing.toObject() : settings.printing || {};
  const targetConfig = printingConfig[target] || { provider: 'BROWSER' };

  const payload = {
    title: 'TEST TICKET',
    meta: [
      ['Target', target.toUpperCase()],
      ['Time', new Date().toLocaleString()],
    ],
    lines: [{ qty: 1, name: 'Test print line', note: '' }],
    footer: 'This is a test print',
  };

  const provider = factory.get(targetConfig.provider);

  try {
    const result = await provider.print(payload, targetConfig);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ message: err.message });
  }
});

module.exports = { test };
