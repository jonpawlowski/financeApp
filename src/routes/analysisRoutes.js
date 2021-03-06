const express = require('express');
const mongoDB = require('../config/mongodb.js');
const debug = require('debug')('app:analysisRoutes');
const utilities = require('../config/utils.js');
const analysisRouter = express.Router();

function router() {
  analysisRouter.route('/monthlyAnalysis')

  .get((req, res) => {
      const pageTitle = 'monthlyAnalysis';

      // Clear out session variable
      req.session.destroy();

      (async function getMonthlyAnalysis() {
        try {

          //Get vendor list for auto-complete in the form
          const vendorList = await utilities.getVendorsList();

          // Get all comments entered in the last year
          const commentsList = await utilities.getCommentsList();

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

          res.render(
            'analysisView',
            {
              vendorList,
              todaysDate,
              pageTitle,
              commentsList
            }
          );
      } catch(err) {
        debug(err.stack);
      }
      }());
    })

  .post((req, res) => {

    var requestDate;

    if (req.session.analysisRequestDate) {
      requestDate = req.session.analysisRequestDate;
    } else {
      requestDate = req.body.date.toString();
      req.session['analysisRequestDate'] = req.body.date.toString();
    }

    const currentMonth = requestDate.substring(0, requestDate.indexOf(' '));
    const analysisYear = requestDate.substring((requestDate.indexOf(' ') + 1));
    const analysisMonth = new Date(Date.parse(currentMonth +" 1, 2012")).getMonth()+1;
    const pageTitle = 'monthlyAnalysis';

    (async function monthlyAnalysis() {
      let client;
      try {
        // Re-use existing connection from app.js file. This creates a MongoDB connection pool
        client = mongoDB.get();
        const db = client.db(global.gConfig.database);
        const col = db.collection(global.gConfig.collection);

        // Get current dollars to the budget spent as of today
        const date = new Date();
        const monthlyCharges = await col.find({
          "chargeDate" : {
            $lt: new Date( analysisYear, analysisMonth, 1),
            $gte: new Date( analysisYear, analysisMonth - 1 , 1 )
          }
        }).toArray();

        //Get vendor list for auto-complete in the form
        const vendorList = await utilities.getVendorsList();

        // Get all comments entered in the last year
        const commentsList = await utilities.getCommentsList();

        // Perform final budget performance
        var totalMonthlyCharges = 0;
        var allMonthlyCharges = 0;
        var chartMonthlyCharges = 0;
        var chartRecurringCharges = 0;
        var chartOneTimeCharges = 0;
        var vendorAmounts = [];

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

        // if the vendor list is less than 5, pad the array so the monthly chart will show properly
        if (topVendors.length < 5) {

          var startPadding = topVendors.length;

          for (i = startPadding; i < 5; i++) {
            var tempVendor = "NoData" + i.toString();
            var paddingToAdd = {vendor: tempVendor, amount: 0.00};
            topVendors.push(paddingToAdd);
          }
        }

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

        // Calculate total monthly spending
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

        // Final total monthly spend calculation
        allMonthlyCharges = allMonthlyCharges.toFixed(2); //all monthly charges
        totalMonthlyCharges = totalMonthlyCharges.toFixed(2);  //anything that goes against the monthly budget
        const budgetRemaining = (global.gConfig.budget - totalMonthlyCharges).toFixed(2);
        // Calculate number of days in the month
        const lastOfMonth = new Date( analysisYear, analysisMonth, 0 );
        const numDays = lastOfMonth.getDate();
        const currentOnBudget = ((global.gConfig.budget/numDays) * date.getDate()).toFixed(2);
        const rectSpentWidth = ((totalMonthlyCharges/global.gConfig.budget) * 100).toString();

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
          totalSpentFillColor = "FF0000";
        }
        else {
          // under budget color
          monthlyFillColor = "66B334";
          totalSpentFillColor = "66B334"
        }

        // Show green bubble if ahead for the month
        var totalMonthlyFillColor;
        if (Number(allMonthlyCharges) < 0) {
          // ahead for the month so show green and make number positive
          totalMonthlyFillColor = "66B334";
          allMonthlyCharges = (allMonthlyCharges * -1);
          allMonthlyCharges = allMonthlyCharges.toFixed(2);
        }
        else {
          // behind for the month so show red
          totalMonthlyFillColor = "FF0000";
        }

        res.render(
          'analysisView_month',
          {
            currentMonth,
            allMonthlyCharges,
            totalMonthlyCharges,
            budgetRemaining,
            currentOnBudget,
            monthlyCharges,
            chartMonthlyCharges,
            chartRecurringCharges,
            chartOneTimeCharges,
            monthlyFillColor,
            totalSpentFillColor,
            pageTitle,
            totalMonthlyFillColor,
            todaysDate,
            vendorList,
            commentsList,
            topVendors
          }
        );
    } catch(err) {
      debug(err.stack);
    }
    }());
  })

  analysisRouter.route('/chargesAnalysis')
  .get((req, res) => {
      const pageTitle = 'chargesAnalysis';

      // Clear out session variable
      req.session.destroy();

      (async function chargesAnalysis() {
        try {

          //Get vendor list for auto-complete in the form
          const vendorList = await utilities.getVendorsList();

          // Get all comments entered in the last year
          const commentsList = await utilities.getCommentsList();

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

          res.render(
            'analysisView',
            {
              vendorList,
              todaysDate,
              pageTitle,
              commentsList
            }
          );
      } catch(err) {
        debug(err.stack);
      }
      }());
    })

  .post((req, res) => {

    const pageTitle = 'chargesAnalysis';

    (async function chargesAnalysis() {

      const reqInfo = req.body.analysisType;
      const reqType = req.body.chargeAType;
      var vendorAnalysis;
      var monthYear = [];

      let client;
      try {
        // Re-use existing connection from app.js file. This creates a MongoDB connection pool
        client = mongoDB.get();
        const db = client.db(global.gConfig.database);
        const col = db.collection(global.gConfig.collection);;

        if ( reqType == "Vendor" ) {
          // Get first of the month date for
          var currentDate = new Date();
          var nextMonth = currentDate.getMonth();
          var monthArrayEntry;

          var newDate = new Date();
          newDate.setFullYear(newDate.getFullYear() - 1);
          var yearMonth = newDate.getMonth()+1;
          var yearYear = newDate.getFullYear();

          vendorAnalysis = await col.find({
            "vendor" : {
                $eq: reqInfo
            },
            "chargeDate" : {
              $lt: new Date(),
              $gte: new Date ( yearYear, yearMonth, "1")
            }
          }).toArray();

          // Loop through charges
          for (i = 0; i < 12; i++) {
            currentDate.setMonth( nextMonth );
            monthYear.push( { "month" : (currentDate.toLocaleString('default', { month: 'short' } ) + " " + currentDate.getFullYear()), "total" : 0 } );
            nextMonth = currentDate.getMonth() - 1;
          }

          for (j = 0; j < vendorAnalysis.length; j++) {
            var currentChargeDate = vendorAnalysis[j].chargeDate.toString();
            var currentChargeMonth = currentChargeDate.substring(4,7);
            var currentYear = currentChargeDate.substring(11,15);
            var dateToCheck = currentChargeMonth + " " + currentYear;

            for (k = 0; k < monthYear.length; k++) {

              if ( dateToCheck == monthYear[k].month ) {
                monthYear[k].total = monthYear[k].total + vendorAnalysis[j].amount;
              }
            }
          }
        } else { // Analysis of paymentType
          // Get first of the month date for
          var currentDate = new Date();
          var nextMonth = currentDate.getMonth();

          var newDate = new Date();
          newDate.setFullYear(newDate.getFullYear() - 1);
          var yearMonth = newDate.getMonth()+1;
          var yearYear = newDate.getFullYear();

          paymentAnalysis = await col.find({
            "paymentType" : {
                $eq: reqInfo
            },
            "chargeDate" : {
              $lt: new Date(),
              $gte: new Date ( yearYear, yearMonth, "1")
            }
          }).toArray();
          console.log
          // Loop through charges
          for (i = 0; i < 12; i++) {
            currentDate.setMonth( nextMonth );
            monthYear.push( { "month" : (currentDate.toLocaleString('default', { month: 'short' } ) + " " + currentDate.getFullYear()), "total" : 0 } );

            nextMonth = currentDate.getMonth() - 1;
          }

          for (j = 0; j < paymentAnalysis.length; j++) {
            var currentChargeDate = paymentAnalysis[j].chargeDate.toString();
            var currentChargeMonth = currentChargeDate.substring(4,7);
            var currentYear = currentChargeDate.substring(11,15);
            var dateToCheck = currentChargeMonth + " " + currentYear;

            for (k = 0; k < monthYear.length; k++) {
              if ( dateToCheck == monthYear[k].month ) {
                monthYear[k].total = monthYear[k].total + paymentAnalysis[j].amount;
              }
            }
          }
        }

        //Get vendor list for auto-complete in the form
        const vendorList = await utilities.getVendorsList();

        // Get all comments entered in the last year
        const commentsList = await utilities.getCommentsList();

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

        res.render(
          'analysisView_charges',
          {
            pageTitle,
            todaysDate,
            vendorList,
            commentsList,
            monthYear,
            reqInfo
          }
        );
    } catch(err) {
      debug(err.stack);
      //res.redirect('/');
    }
    }());
  })

  analysisRouter.route('/yearlyAnalysis')
  .get((req, res) => {
      const pageTitle = 'yearlyAnalysis';

      // Clear out session variable
      req.session.destroy();

      (async function getYearlyAnalysis() {
        try {

          //Get vendor list for auto-complete in the form
          const vendorList = await utilities.getVendorsList();

          // Get all comments entered in the last year
          const commentsList = await utilities.getCommentsList();

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

          res.render(
            'analysisView',
            {
              vendorList,
              todaysDate,
              pageTitle,
              commentsList
            }
          );
      } catch(err) {
        debug(err.stack);
      }
      }());
    })

  .post((req, res) => {

    var requestDate;
    if (req.session.analysisRequestDate) {
      requestDate = req.session.analysisRequestDate;
    } else {
      requestDate = req.body.date.toString();
      req.session['analysisRequestDate'] = req.body.date.toString();
    }

    const pageTitle = 'yearlyAnalysis';

    (async function yearlyAnalysis() {
      let client;
      try {
        // Re-use existing connection from app.js file. This creates a MongoDB connection pool
        client = mongoDB.get();
        const db = client.db(global.gConfig.database);
        const col = db.collection(global.gConfig.collection);;

        // Get all charges for the specified year
        const date = new Date();
        const yearlyCharges = await col.find({
          "chargeDate" : {
            $lt: new Date(),
            $gte: new Date( requestDate, 0 , 1 )
          }
        }).toArray();

        //Get vendor list for auto-complete in the form
        const vendorList = await utilities.getVendorsList();

        // Get all comments entered in the last year
        const commentsList = await utilities.getCommentsList();

        // Perform final budget performance
        var totalMonthlyCharges = 0;
        var allMonthlyCharges = 0;
        var chartMonthlyCharges = 0;
        var chartRecurringCharges = 0;
        var chartOneTimeCharges = 0;
        var vendorAmounts = [];

        // Calculate yearly charges against Monthly Spending Budget
        for (i = 0; i < yearlyCharges.length; i++) {
          if (yearlyCharges[i].category == 'Monthly') {
            if (yearlyCharges[i].paymentType == 'Credit') {
              totalMonthlyCharges -= yearlyCharges[i].amount;
            } else {
              // add charge to be evaluated for top 5 vendors
              vendorAmounts.push(yearlyCharges[i]);
              totalMonthlyCharges += yearlyCharges[i].amount;
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

        // Calculate total monthly spending
        for (i = 0; i < yearlyCharges.length; i++) {
          if (yearlyCharges[i].paymentType == 'Credit') {
            allMonthlyCharges -= yearlyCharges[i].amount;
          } else {
            allMonthlyCharges += yearlyCharges[i].amount;
          }
          if (yearlyCharges[i].category == 'Monthly') {
            if (yearlyCharges[i].paymentType == 'Credit') {
              chartMonthlyCharges -= yearlyCharges[i].amount;
            } else {
              chartMonthlyCharges += yearlyCharges[i].amount;
            }
          }
          if (yearlyCharges[i].category == 'Recurring') {
            if (yearlyCharges[i].paymentType == 'Credit') {
              chartRecurringCharges -= yearlyCharges[i].amount;
            } else {
              chartRecurringCharges += yearlyCharges[i].amount;
            }
          }
          if (yearlyCharges[i].category == 'One-time') {
            if (yearlyCharges[i].paymentType == 'Credit') {
              chartOneTimeCharges -= yearlyCharges[i].amount;
            } else {
              chartOneTimeCharges += yearlyCharges[i].amount;
            }
          }
        }

        // Final total monthly spend calculation
        allMonthlyCharges = allMonthlyCharges.toFixed(2); //all monthly charges
        totalMonthlyCharges = totalMonthlyCharges.toFixed(2);  //anything that goes against the monthly budget644444

        // get today's date for max date and default value in new charges form
        var todaysDate = new Date();
        var dd = todaysDate.getDate();
        var mm = todaysDate.getMonth()+1; //January is 0!
        var yyyy = todaysDate.getFullYear();

        // Calculate the yearly budget analysis based on current month
        const currentOnBudget = global.gConfig.budget * mm;
        const budgetRemaining = (currentOnBudget - totalMonthlyCharges).toFixed(2);

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
          'analysisView_year',
          {
            allMonthlyCharges,
            totalMonthlyCharges,
            budgetRemaining,
            yearlyCharges,
            chartMonthlyCharges,
            chartRecurringCharges,
            chartOneTimeCharges,
            monthlyFillColor,
            pageTitle,
            totalMonthlyFillColor,
            todaysDate,
            vendorList,
            topVendors,
            commentsList,
            requestDate
          }
        );
    } catch(err) {
      debug(err.stack);
    }
    }());
  });
  return analysisRouter;
};

module.exports = router;
