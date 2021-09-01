// const request = require('request-promise');
// const {
//   errors: { predefined: predefinedErrors },
// } = require('@funnelytics/shared-data');
// const _ = require('lodash');

// const drip = {
//   token: new Buffer(process.env.DRIP_API_KEY).toString('base64'),
//   account: process.env.DRIP_ACCOUNT_ID,
// };

// class DripIntegration {
//   static createEvent(subscriberEmail, eventName) {
//     return request({
//       url: `https://api.getdrip.com/v2/${drip.account}/events`,
//       method: 'POST',
//       json: true,
//       headers: {
//         Authorization: `Basic ${drip.token}`,
//       },
//       body: {
//         events: [
//           {
//             email: subscriberEmail,
//             action: eventName,
//           },
//         ],
//       },
//     }).catch(() => {
//       throw new Error(`Drip error when passing email: '${subscriberEmail}' and event name: '${eventName}'`);
//     });
//   }

//   static createOrder(subscriberEmail, { identifier = undefined, amount = 0, orderItems = [] }) {
//     return request({
//       url: `https://api.getdrip.com/v2/${drip.account}/orders`,
//       method: 'POST',
//       json: true,
//       headers: {
//         Authorization: `Basic ${drip.token}`,
//       },
//       body: {
//         orders: [
//           {
//             identifier,
//             amount,
//             email: subscriberEmail,
//             items: _.reduce(orderItems, (arr, item) => {
//               if (item.amount > 0) {
//                 arr.push({
//                   name: item.description,
//                   price: item.amount,
//                   amount: item.amount,
//                   quantity: item.quantity,
//                 });
//               }
//               return arr;
//             }, []),
//           },
//         ],
//       },
//     });
//   }

//   static updateEmail(subscriberEmail, newEmail) {
//     return request({
//       url: `https://api.getdrip.com/v2/${drip.account}/subscribers`,
//       method: 'POST',
//       json: true,
//       headers: {
//         Authorization: `Basic ${drip.token}`,
//       },
//       body: {
//         subscribers: [{
//           email: subscriberEmail,
//           new_email: newEmail,
//         }],
//       },
//     }).catch(err => {
//       if (err.message.includes('New email is already subscribed')) {
//         throw predefinedErrors.generic.unauthorized;
//       }
//       throw err;
//     });
//   }
// }

// module.exports = DripIntegration;

module.exports = null;
