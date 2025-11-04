const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const counterController = require('../controllers/counterController');
const businessTypeController = require('../controllers/businessTypeController');

// 业务类型路由
router.get('/business-types', businessTypeController.getAllBusinessTypes);

// 取号路由
router.post('/tickets', ticketController.createTicket);
router.get('/tickets/current', ticketController.getCurrentTickets);
router.put('/tickets/:id/status', ticketController.updateTicketStatus);

// 窗口路由
router.get('/counters', counterController.getAllCounters);
router.put('/counters/:id', counterController.updateCounter);
router.post('/counters/:id/next', counterController.callNextTicket);
router.post('/counters/:id/call-manual', counterController.callManualTicket);
router.post('/counters/:id/end-service', counterController.endService);

module.exports = router;
