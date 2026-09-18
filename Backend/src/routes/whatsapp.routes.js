const express = require('express');
const whatsappController = require('../controllers/whatsapp.controller');

const router = express.Router();

// Meta webhook verification callback.
router.get('/webhook', whatsappController.verifyWebhook.bind(whatsappController));
// Meta sends inbound messages and delivery/read status callbacks here.
router.post('/webhook', whatsappController.receiveWebhook.bind(whatsappController));

module.exports = router;
