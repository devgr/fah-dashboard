/**
 Latest edit: Troy Herbison on April 4
 */

 /* jshint esversion: 6 */

const url_db = 'mongodb://localhost:27017/folding';
var app = require('express')();
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var bodyParser = require('body-parser');
var async = require('async');
var jsonConcat = require("json-concat");

// Use connect method to connect to the Server
MongoClient.connect(url_db, function(err, db) {
  assert.equal(null, err);
  	
  	var obj;
  	var userOrTeam;
  	var limit;
  	var findField;

	//parse application/json for recieving post requests
	app.use(bodyParser.json());

  	//send response if user wants to sort by rank, score, units, or changes in these values
	app.get('/sort/:limit/:userOrTeam/:sortVal/:pageNum', function(req, res) {
		userOrTeam = req.params.userOrTeam.toLowerCase();
    	limit = parseInt(req.params.limit);
    	
		var sortBy = req.params.sortVal;
		var pageNum = parseInt(req.params.pageNum);

    	//calculate amount to skip to display a specified page
    	var skipAmt = limit * (pageNum - 1);

    	//query top teams or users on a page then send a response as an object
	    db.collection(userOrTeam).find().limit(limit).sort({ sortBy : -1 }).skip(skipAmt).toArray(function(err, obj) {
			if (err) return console.log(err.message);

			res.send(obj);
		});

    	
	});

	//send response if user wants to search for name, teamID, or rank
	app.get('/find/:findVal/:findField/:userOrTeam', function(req, res) {
		userOrTeam = req.params.userOrTeam;

		//findVal could be a name, teamID, or rank
		var findVal = req.params.findVal;
		findField = req.params.findField.toLowerCase();

		if(findField == "name")
		{
			//search for name and remove hourly and daily fields
	    	db.collection(userOrTeam).find({"_id.name" : findVal }, {hourly : 0, daily : 0}).toArray(function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}
    	else if(findField == "teamid")
    	{
    		//search for teamID and remove hourly and daily fields
    		db.collection(userOrTeam).find({"_id.teamID" : findVal}, {hourly : 0, daily : 0}).toArray(function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}
    	else if(findField == "rank")
    	{
    		//search for rank and remove hourly and daily fields
    		db.collection(userOrTeam).find({rank : parseInt(findVal)}, {hourly : 0, daily : 0}).toArray(function(err, obj) {
				if (err) return console.log(err.message);
				
				res.send(obj);
			});
    	}

	});
	
	app.post('/post/:userOrTeam/:findField', function (req, res) {
  		
  		userOrTeam = req.params.userOrTeam.toLowerCase();
  		findField = req.params.findField.toLowerCase();

  		var arr = req.body;
  		var objToSend = [];

  		async.forEach(Object.keys(arr.namesID), function (item, callback){ 

    		db.collection(userOrTeam).find({"_id.name" : arr.namesID[item].name }, {hourly : 0, daily : 0}).toArray(function(err, obj) {
				if (err) return console.log(err.message);
				
				console.log(obj);
				
				//objToSend = JSON.stringify(obj);
				//objToSend = objToSend + obj;
				//res.send(obj);
				objToSend = objToSend.concat(obj);
				//objToSend = obj.concat(objToSend);
					
    			// tell async that that particular element of the iterator is done
    			callback(); 
			});


		}, function(err) {
    		//iterating done, send the object
    		res.send(objToSend);
		}); 
  		
  		//res.send(objToSend);
	});


	app.listen(3000, function (){
		console.log("Listening on port 3000");
	});
});