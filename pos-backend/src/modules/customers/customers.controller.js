const asyncHandler = require('../../common/utils/asyncHandler');
const customersService = require('./customers.service');

const list = asyncHandler(async (req, res) => {
  const result = await customersService.listCustomers(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await customersService.getCustomerWithStats(req.params.id);
  res.json(result);
});

const getInvoices = asyncHandler(async (req, res) => {
  const result = await customersService.getCustomerInvoices(req.params.id, req.query);
  res.json(result);
});

const create = asyncHandler(async (req, res) => {
  const customer = await customersService.createCustomer(req.body);
  res.status(201).json(customer);
});

const update = asyncHandler(async (req, res) => {
  const customer = await customersService.updateCustomer(req.params.id, req.body);
  res.json(customer);
});

const remove = asyncHandler(async (req, res) => {
  await customersService.deleteCustomer(req.params.id);
  res.json({ message: 'Customer deleted' });
});

module.exports = { list, getOne, getInvoices, create, update, remove };
