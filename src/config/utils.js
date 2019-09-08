const mongoDB = require('../config/mongodb.js');
const util = require('util');

  // Get list of vendors from the last year for auto-complete in the form.
  // The DB query grabs all vendors from the last year getting only the vendor field.
  async function getVendorsList() {
    // Re-use existing connection from app.js file. This creates a MongoDB connection pool
    let client
    client = mongoDB.get();
    const db = client.db(global.gConfig.database);
    const col = db.collection(global.gConfig.collection);

      // Get list of vendors from the last year for auto-complete in the form.
      // The DB query grabs all vendors from the last year getting only the vendor field.

      const allVendors = await col.find({
        "chargeDate" : {
          $lt: new Date(),
          $gte: new Date(new Date().setDate(new Date().getDate()-365))
        }
      }).project({ _id : 0, vendor : 1 }).toArray();

      // Use JS ES6 Set function to only get unique vendors
      var vendorList = [...new Set(allVendors.map(item => item.vendor))];

      // Sort the vendor list alphabetically
      vendorList.sort(function(a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      console.log("We have " + vendorList.length + " unique vendors.");
      return vendorList;
  }

  module.exports = {
    getVendorsList
  };
