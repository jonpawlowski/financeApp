const express = require('express');
const { MongoClient } = require('mongodb');
const debug = require('debug')('app:defaultRoutes');
const defaultRouter = express.Router();

function router() {
  defaultRouter.route('/')
  .get((req, res) => {
    const url = global.gConfig.databaseurl;
    const dbName = global.gConfig.database;
    const rectGreenWidth = 600;
    const pageTitle = 'index';

    var fs = require('fs');

    (async function mongo() {
      let client;
      try {
        client = await MongoClient.connect(url);

        const db = client.db(dbName);
        const col = await db.collection('charges');

        // Get current dollars to the budget spent as of today
        const date = new Date();
        const monthlyCharges = await col.find({
          "chargeDate" : {
            $lt: new Date(),
            $gte: new Date(date.getFullYear(), date.getMonth(), 1)
          }
        }).toArray();
        /*console.log("******** about to aggregrate");
        const topVendors = await col.aggregate(
          [
	           {
	            $match: {
                "chargeDate": {
                  $gte: new Date(date.getFullYear(), date.getMonth(), 1),
                  $lt: new Date()
                }
              }
            },
            {
              $group:
              {
                _id: { vendor: "$vendor" },
                totalAmount: { $sum: "$amount" }
              }
            }
          ]
        ).toArray();

        //console.log("***********First vendor is " + topVendors[0]._id.vendor.toString());
        topVendors.sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount));

        for (i = 0; i < topVendors.length; i++) {
          console.log("****** Vendor " + i + " is " + topVendors[i]._id.vendor);
          console.log("****** Vendor " + i + " amount is " + topVendors[i].totalAmount);
        }*/

        // Get vendor list for auto-complete in the form
        // Wrote it to a file because I couldn't figure out how to assign it to a variable
        await col.distinct("vendor", {}, function(err,vendors){
          const vendorJSON = JSON.stringify(vendors);
          //console.log("Vendor JSON is " + vendorJSON);
          fs.writeFile('./src/config/vendorList.json', vendorJSON, 'utf8', function(err, result) {
            if(err) console.log('error', err);
          });
        });

        //Get vendor list from file and sort for easier reading
        const vendorList = JSON.parse(fs.readFileSync('./src/config/vendorList.json', 'utf8'));
        vendorList.sort(function(a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });

        // Perform current budget performance
        var totalMonthlyCharges = 0;
        var allMonthlyCharges = 0;
        var chartMonthlyCharges = 0;
        var chartRecurringCharges = 0;
        var chartOneTimeCharges = 0;
        var vendorAmounts = [];

        const lastOfMonth = new Date( date.getFullYear(), date.getMonth()+1, 0 );
        const numDays = lastOfMonth.getDate();

        // Calculate charges against Monthly Spending Budget
        for (i = 0; i < monthlyCharges.length; i++) {
          if (monthlyCharges[i].category == 'Monthly') {
            if (monthlyCharges[i].paymentType == 'Credit') {
              totalMonthlyCharges -= monthlyCharges[i].amount;
            } else {
              // add charge to be evaluated for top 5 vendors
              vendorAmounts.push(monthlyCharges[i]);
              totalMonthlyCharges += monthlyCharges[i].amount;
            }
          }
        }

        //Calculate the top 5 vendors based on spending amount
        var topVendors = [];
        vendorAmounts.reduce(function (res, value) {
          if (!res[value.vendor]) {
            res[value.vendor] = {
              amount: 0,
              vendor: value.vendor
            };
            topVendors.push(res[value.vendor])
          }
          res[value.vendor].amount += value.amount
          return res;
        }, {});
        //Sort by the most spent
        topVendors.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

        // Format any top vendors to display properly in the line chart
        var modifiedVendor; // temp variable to build vendor string
        for (i = 0; i < 5; i++) {
          var currentVendor = topVendors[i].vendor;
          if (currentVendor.indexOf(" ") > -1) {
            currentVendor = currentVendor.split(" ");
            modifiedVendor = "[\"";
            for (j = 0; j < currentVendor.length; j++) {

              if ((j + 1) == currentVendor.length) {
                modifiedVendor = modifiedVendor + currentVendor[j] + "\"]";
                topVendors[i].vendor = modifiedVendor;
              } else {
                modifiedVendor = modifiedVendor + currentVendor[j] + "\", \"";
              }
            }

          } else {
            topVendors[i].vendor = "\"" + topVendors[i].vendor + "\"";
          }
        }

        //Calculate monthly spending
        for (i = 0; i < monthlyCharges.length; i++) {
          if (monthlyCharges[i].paymentType == 'Credit') {
            allMonthlyCharges -= monthlyCharges[i].amount;
          } else {
            allMonthlyCharges += monthlyCharges[i].amount;
          }
          if (monthlyCharges[i].category == 'Monthly') {
            if (monthlyCharges[i].paymentType == 'Credit') {
              chartMonthlyCharges -= monthlyCharges[i].amount;
            } else {
              chartMonthlyCharges += monthlyCharges[i].amount;
            }
          }
          if (monthlyCharges[i].category == 'Recurring') {
            if (monthlyCharges[i].paymentType == 'Credit') {
              chartRecurringCharges -= monthlyCharges[i].amount;
            } else {
              chartRecurringCharges += monthlyCharges[i].amount;
            }
          }
          if (monthlyCharges[i].category == 'One-time') {
            if (monthlyCharges[i].paymentType == 'Credit') {
              chartOneTimeCharges -= monthlyCharges[i].amount;
            } else {
              chartOneTimeCharges += monthlyCharges[i].amount;
            }
          }
        }

        allMonthlyCharges = allMonthlyCharges.toFixed(2); //all monthly charges
        totalMonthlyCharges = totalMonthlyCharges.toFixed(2);  //anything that goes against the monthly budget
        const budgetRemaining = (global.gConfig.budget - totalMonthlyCharges).toFixed(2);
        const currentOnBudget = ((global.gConfig.budget/numDays) * date.getDate()).toFixed(2);
        const rectSpentWidth = ((totalMonthlyCharges/global.gConfig.budget) * 100).toString();

        // Get current month to display on index page
        const d = new Date();
        const month = new Array();
        month[0] = "January";
        month[1] = "February";
        month[2] = "March";
        month[3] = "April";
        month[4] = "May";
        month[5] = "June";
        month[6] = "July";
        month[7] = "August";
        month[8] = "September";
        month[9] = "October";
        month[10] = "November";
        month[11] = "December";
        const currentMonth = month[d.getMonth()];

        // get today's date for max date and default value in new charges form
        var todaysDate = new Date();
        var dd = todaysDate.getDate();
        var mm = todaysDate.getMonth()+1; //January is 0!
        var yyyy = todaysDate.getFullYear();

        if ( dd < 10 ) {
          dd = '0' + dd;
        }

        if ( mm < 10 ) {
          mm = '0' + mm;
        }

        todaysDate = yyyy + '-' + mm + '-' + dd;

        var monthlyFillColor;
        if (Number(totalMonthlyCharges) > Number(currentOnBudget)) {
          // over budget color
          monthlyFillColor = "#FF0000";
        }
        else {
          // under budget color
          monthlyFillColor = "#8FB7CA";
        }

        // Show green bubble if ahead for the month
        var totalMonthlyFillColor;
        if (Number(allMonthlyCharges) < 0) {
          // ahead for the month so show green and make number positive
          totalMonthlyFillColor = "background: rgb(102, 179, 96);";
          allMonthlyCharges = (allMonthlyCharges * -1);
          allMonthlyCharges = allMonthlyCharges.toFixed(2);
        }
        else {
          // behind for the month so show red
          totalMonthlyFillColor = "background: rgb(255,0,0);";
        }

    res.render(
      'index',
      {
        monthlyCharges,
        currentMonth,
        totalMonthlyCharges,
        budgetRemaining,
        currentOnBudget,
        rectSpentWidth,
        todaysDate,
        vendorList,
        monthlyFillColor,
        allMonthlyCharges,
        chartMonthlyCharges,
        chartRecurringCharges,
        chartOneTimeCharges,
        totalMonthlyFillColor,
        pageTitle,
        topVendors
      }
    );
    } catch(err) {
      debug(err.stack);
    }
    client.close();
    }());
  });
  return defaultRouter;
  module.exports = { chartMonthlyCharges, chartRecurringCharges, chartOneTimeCharges };
};

module.exports = router;
