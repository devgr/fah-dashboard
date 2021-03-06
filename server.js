/**
 Latest edit: Grayson Dubois on April 10
 */


const express = require('express');
let app = express();
let MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const bodyParser = require('body-parser');
const async = require('async');
const child_process = require("child_process");
const cron = require("node-cron");

let router = express.Router();
const path = {
	default: __dirname,
	dependencies: __dirname + "/node_modules",
	experiment: __dirname + "/experiment",
	db: "mongodb://localhost:27017/folding",
};


/*
 * Website routing is handled here
 */

// Detects incoming requests and updates the console
router.use(function (req, res, next) {
	console.log("Receiving a " + req.method + " request");
	next();
});

// Serves the main webpage on a simple empty get request to the server's base address
router.get("/", function(req, res) {
	res.sendFile(path.experiment + "/index.html");
});

// Routing to specific paths for convenience
app.use("/", router);       // This one sends the request to the router, which serves the webpage
app.use("/experiment", express.static(path.experiment));
app.use("/dependencies", express.static(path.dependencies));


/*
 * Use connect method to connect to the Server
 * Api requests for data from mongo are handled in here
 */
MongoClient.connect(path.db, function(err, db) {
  assert.equal(null, err);
  	
  	let userOrTeam;
  	let limit;
  	let findField;

	//parse application/json for recieving post requests
	app.use(bodyParser.json());

  	//send response if user wants to sort by rank, score, units, or changes in these values
	app.get('/sort/:userOrTeam/:sortVal/:limit/:order/:pageNum', function(req, res) {
		userOrTeam = req.params.userOrTeam.toLowerCase();
    	limit = parseInt(req.params.limit);
		res.header('Access-Control-Allow-Origin', '*');
    	
		let sortBy = {};
		
		sortBy[req.params.sortVal] = parseInt(req.params.order);
		let pageNum = parseInt(req.params.pageNum);

    	//calculate amount to skip to display a specified page
    	let skipAmt = limit * (pageNum - 1);

    	//query top teams or users on a page then send a response as an object
	    db.collection(userOrTeam).find().sort(sortBy).skip(skipAmt).limit(limit).toArray(function(err, obj) {
			if (err) return console.log(err.message);

			res.send(obj);
		});

    	
	});

	//send response if user wants to search for name, teamID, or rank
	app.get('/find/:userOrTeam/:findField/:findVal', function(req, res) {
		userOrTeam = req.params.userOrTeam;

		res.header('Access-Control-Allow-Origin', '*');

		//findVal could be a name, teamID, or rank
		let findVal = req.params.findVal;
		findField = req.params.findField.toLowerCase();

		if(findField === "name")
		{
			//search for name
	    	db.collection(userOrTeam).findOne({"_id.name" : findVal }, function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}
    	else if(findField === "teamid")
    	{
    		//search for teamID
    		db.collection(userOrTeam).findOne({"_id.teamID" : findVal}, function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}
    	else if(findField === "rank")
    	{
    		//search for rank
    		db.collection(userOrTeam).findOne({rank : parseInt(findVal)}, function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}

	});

	//send response if user wants to find a user or team that contains a specified substring
	app.get('/search/:userOrTeam/:searchVal/:sortVal/:order/:pageNum', function(req, res) {
		userOrTeam = req.params.userOrTeam;

		res.header('Access-Control-Allow-Origin', '*');

		//search for a name containing anything before and after the substring
		let searchVal = ".*"+req.params.searchVal+".*";

		var pageNum = parseInt(req.params.pageNum);

		var sortBy = {};
		
		sortBy[req.params.sortVal] = parseInt(req.params.order);

    	//calculate amount to skip to display a specified page
    	var skipAmt = 25 * (pageNum - 1);

		db.collection(userOrTeam).find({"_id.name" : {$regex : searchVal}}).sort(sortBy).skip(skipAmt).limit(25).toArray(function(err, obj) {
			if (err) return console.log(err.message);

			res.send(obj);
		});

	});
	
	//send response if user wants to graph up to 10 users within a date range
	app.post('/post', function (req, res) {
  		
  		userOrTeam = String(req.body.type);
  		
  		let arr = req.body.names;
  		let arrToSend = [];
  		res.header('Access-Control-Allow-Origin', '*');

  		//parse the dates from post request
  		let fromDate = Date.parse(req.body.fromDate);
  		let toDate = Date.parse(req.body.toDate);

  		let dailyArr;
  		let updatedDailyArr = [];
  		let i;
		let curDate;

  		async.forEach(Object.keys(arr), function (item, callback){ 

    		db.collection(userOrTeam).findOne({"_id.name" : arr[item] }, function(err, obj) {
				if (err) return console.log(err.message);

				//assign daily object to the current user or team's daily field
                    if (obj != null && obj.daily != null)
				     dailyArr = obj.daily;
                    else
                         dailyArr = [];

				//iterate until a date is found within the range
				for(i = 0; i < dailyArr.length; i++)
				{
					curDate = Date.parse(dailyArr[i].date);

					//break if a date is within the range
					if((curDate >= fromDate) && (curDate <= toDate))
						break;
				}

				//splice starting at date within range to the end of the daily array (works because array is in chronological order)
				updatedDailyArr = dailyArr.splice(i, dailyArr.length);

				//update daily field with new daily array
                    if (obj != null && obj.daily != null)
				     obj.daily = updatedDailyArr;

				//add the newly queried object to the array
				arrToSend.push(obj);
					
    			// tell async that that particular element of the iterator is done
    			callback(); 
			});


		}, function(err) {
			//iterating done, first convert to JSON string before sending
			arrToSend = JSON.stringify(arrToSend);

    		//send the JSON string
    		res.send(arrToSend);
		}); 
  		
	});
});


// Set the app to listen
app.listen(3000, function (){
	console.log("Listening on port 3000");
});

/*
 * Schedule the hourly updates to spawn on new threads
 */
let lastDailyUserUpdate = new Date();
let lastDailyTeamUpdate = new Date();

let downloadUserTask;
let downloadTeamTask;

cron.schedule('0 * * * *', function() {

	// Set up the environment object with the dates that the child processes will need
	let env = {
		lastDailyUserUpdate: lastDailyUserUpdate,
		lastDailyTeamUpdate: lastDailyTeamUpdate
	};

	// Start the download user task on a child process
	console.log("Beginning hourly update [DownloadUsersTask] on a new thread");
	downloadUserTask = child_process.exec("node --max-old-space-size=4096 UpdateUserData.js",
		{env: env },
		function(error, stdout, stderr) {
			if (error) {
				console.log("UpdateUserData.js Error Code: " + error.code);
				console.log("UpdateUserData.js Signal Received: " + error.signal);
			}
		});

	// Notify when download user task exits
	downloadUserTask.on("exit", function(exitCode) {
		console.log("UpdateUserData.js exited with code: " + exitCode);
	});

	// Port download user task stdout and stderr to the main console
	downloadUserTask.stdout.on("data", function(stdout) {
		// If the child process prints a message to change the date, then do so here
		if (stdout === "UPDATE DATE"){
			console.log('Daily update for teams complete');
			lastDailyUserUpdate = new Date(
				timeStamp.getFullYear(),
				timeStamp.getMonth(),
				timeStamp.getDate()
			);
		} else {
			console.log("UpdateUserData.js stdout: " + stdout);
		}
	});
	downloadUserTask.stderr.on("data", function(stderr) {
		console.log("UpdateUserData.js stderr: " + stderr);
	});

	// Start the download team task on a child process
	console.log("Beginning hourly update [DownloadTeamsTask] on a new thread");
	downloadTeamTask = child_process.exec("node --max-old-space-size=2048 UpdateTeamData.js",
		{env: {lastDailyTeamUpdate: lastDailyTeamUpdate}},
		function(error, stdout, stderr) {
			if (error) {
				console.log("UpdateTeamData.js Error Code: " + error.code);
				console.log("UpdateTeamData.js Signal Recieved: " + error.signal);
			}
		});

	// Notify when the download team task exits
	downloadTeamTask.on("exit", function(exitCode) {
		console.log("UpdateTeamData.js exited with code: " + exitCode);
	});

	// Port the download team task stdout and stderr to the main console
	downloadTeamTask.stdout.on('data', function(stdout) {
		// If the child process prints a message to update the date, then do so here
		if (stdout === "UPDATE DATE") {
			console.log('Daily update for teams complete');
			lastDailyTeamUpdate = new Date(
				timeStamp.getFullYear(),
				timeStamp.getMonth(),
				timeStamp.getDate()
			);
		} else {
			console.log("UpdateTeamData.js stdout: " + stdout);
		}
	});
	downloadTeamTask.stderr.on("data", function(stderr) {
		console.log("UpdateTeamData.js stderr: " + stderr);
	});
});
