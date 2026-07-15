const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./reservations.service');

const create = asyncHandler(async (req, res) => {
  const reservation = await service.createReservation(req.body, req.user);
  res.status(201).json(reservation);
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listReservations(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const reservation = await service.getReservation(req.params.id);
  res.json(reservation);
});

const update = asyncHandler(async (req, res) => {
  const reservation = await service.updateReservation(req.params.id, req.body);
  res.json(reservation);
});

const seat = asyncHandler(async (req, res) => {
  const result = await service.seatReservation(req.params.id, req.body, req.user);
  res.json(result);
});

const cancel = asyncHandler(async (req, res) => {
  const reservation = await service.cancelReservation(req.params.id, req.user);
  res.json(reservation);
});

const noShow = asyncHandler(async (req, res) => {
  const reservation = await service.noShowReservation(req.params.id, req.user);
  res.json(reservation);
});

module.exports = { create, list, getOne, update, seat, cancel, noShow };
