const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./tables.service');

const list = asyncHandler(async (req, res) => {
  const tables = await service.listTables();
  res.json(tables);
});

const create = asyncHandler(async (req, res) => {
  const table = await service.createTable(req.body);
  res.status(201).json(table);
});

const update = asyncHandler(async (req, res) => {
  const table = await service.updateTable(req.params.id, req.body);
  res.json(table);
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteTable(req.params.id);
  res.json({ message: 'Table deleted' });
});

const transfer = asyncHandler(async (req, res) => {
  const result = await service.transferTable(req.params.id, req.body.toTableId);
  res.json(result);
});

const merge = asyncHandler(async (req, res) => {
  const result = await service.mergeTables(req.params.id, req.body.fromTableId);
  res.json(result);
});

const generateQrToken = asyncHandler(async (req, res) => {
  const table = await service.generateQrToken(req.params.id);
  res.json({ qrToken: table.qrToken, table });
});

module.exports = { list, create, update, remove, transfer, merge, generateQrToken };
