const asyncHandler = require('../../common/utils/asyncHandler');
const purchasingService = require('./purchasing.service');
const auditService = require('../audit/audit.service');

const list = asyncHandler(async (req, res) => {
  const result = await purchasingService.listPOs(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const po = await purchasingService.getPO(req.params.id);
  res.json(po);
});

const create = asyncHandler(async (req, res) => {
  const po = await purchasingService.createPO(req.body);

  auditService.log({
    req,
    action: 'po.create',
    entity: 'PurchaseOrder',
    entityId: po._id,
    meta: { poNumber: po.poNumber, vendorId: po.vendorId, subtotal: po.subtotal },
  });

  res.status(201).json(po);
});

const update = asyncHandler(async (req, res) => {
  const po = await purchasingService.updatePO(req.params.id, req.body);
  res.json(po);
});

const place = asyncHandler(async (req, res) => {
  const po = await purchasingService.placePO(req.params.id);

  auditService.log({ req, action: 'po.place', entity: 'PurchaseOrder', entityId: po._id, meta: { poNumber: po.poNumber } });

  res.json(po);
});

const cancel = asyncHandler(async (req, res) => {
  const po = await purchasingService.cancelPO(req.params.id);

  auditService.log({ req, action: 'po.cancel', entity: 'PurchaseOrder', entityId: po._id, meta: { poNumber: po.poNumber } });

  res.json(po);
});

const receive = asyncHandler(async (req, res) => {
  const { po, transactions } = await purchasingService.receivePO(req.params.id, req.body, req.user);

  auditService.log({
    req,
    action: 'po.receive',
    entity: 'PurchaseOrder',
    entityId: po._id,
    meta: { poNumber: po.poNumber, status: po.status, items: req.body.items },
  });

  res.json({ po, transactions });
});

module.exports = { list, getOne, create, update, place, cancel, receive };
