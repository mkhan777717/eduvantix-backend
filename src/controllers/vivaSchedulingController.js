const svc = require('../services/vivaSchedulingService');

/** POST /api/viva/schedule */
const scheduleViva = async (req, res, next) => {
  try {
    const { title, subject, description, startTime, endTime, questionIds } = req.body;
    const instituteId = req.user ? req.user.instituteId : null;
    const creatorId = req.user ? req.user.id : null;

    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'You must belong to an institute to schedule a Viva.' });
    }

    const viva = await svc.createViva({
      title,
      subject,
      description,
      startTime,
      endTime,
      questionIds,
      creatorId,
      instituteId
    });

    res.status(201).json({ success: true, viva });
  } catch (err) {
    if (err.message) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** GET /api/viva/scheduled */
const listScheduledVivas = async (req, res, next) => {
  try {
    const instituteId = req.user ? req.user.instituteId : null;
    if (!instituteId) {
      return res.json({ success: true, count: 0, vivas: [] });
    }

    const vivas = await svc.getScheduledVivas(instituteId);
    res.json({ success: true, count: vivas.length, vivas });
  } catch (err) {
    next(err);
  }
};

/** GET /api/viva/scheduled/:id */
const getScheduledVivaDetails = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const instituteId = req.user ? req.user.instituteId : null;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Viva ID.' });
    }
    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const viva = await svc.getVivaDetails(id, instituteId);
    res.json({ success: true, viva });
  } catch (err) {
    if (err.message === 'Viva not found.' || err.message === 'Unauthorized to access this Viva.') {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/** PUT /api/viva/scheduled/:id */
const updateScheduledViva = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { title, subject, description, startTime, endTime, questionIds } = req.body;
    const instituteId = req.user ? req.user.instituteId : null;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Viva ID.' });
    }
    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'You must belong to an institute to modify a Viva.' });
    }

    const viva = await svc.updateViva(id, {
      title,
      subject,
      description,
      startTime,
      endTime,
      questionIds,
      instituteId
    });

    res.json({ success: true, viva });
  } catch (err) {
    if (err.message) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};
/** DELETE /api/viva/scheduled/:id */
const deleteScheduledViva = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const instituteId = req.user ? req.user.instituteId : null;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Viva ID.' });
    }
    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'You must belong to an institute to delete a Viva.' });
    }

    await svc.deleteViva(id, instituteId);
    res.json({ success: true, message: 'Viva deleted successfully.' });
  } catch (err) {
    if (err.message) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

module.exports = {
  scheduleViva,
  listScheduledVivas,
  getScheduledVivaDetails,
  updateScheduledViva,
  deleteScheduledViva
};
