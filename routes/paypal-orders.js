const express = require('express');

const router = express.Router();

// validates paypal payment using paymentId (:id)
router.get('/:id', (req, res, next) => {
  res.status(503).send('This route is no longer available.');
  // paypal.payment.get(req.params.id, (err, payment) => {
  //   if (err) {
  //     throw err;
  //   }

  //   const userId = payment.transactions[0].custom;

  //   return models.User.forge()
  //     .where({ id: userId })
  /**
   * WARNING: This column, latest_paypal_order, is no longer available in the database.
   */
  //     .fetch({ columns: ['latest_paypal_order'] })
  //     .then(user => {
  //       const dbPaymentId = user.get('latest_paypal_order');
  //       if (payment.id !== dbPaymentId) {
  //         throw errors.predefined.generic.unauthorized;
  //       }

  //       return res.json(payment);
  //     })
  //     .catch(error => next(error));
  // });
});

module.exports = router;
