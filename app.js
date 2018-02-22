

// AWS test SNS server / API harness
'use strict'

// load the AWS SDK
var aws         = require('aws-sdk')
var express     = require('express');
var app         = express();
const uuidv5    = require('uuid/v5');
var fs          = require('fs')

// serve up pages from /public
app.use(express.static('public'))

// setup bodyparser
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies


// load aws config
aws.config.loadFromPath(__dirname + '/config.json')

// create the sqs service object
var s3 = new aws.S3()

// serve up main test page 
app.get('/',function(req,res) {
    res.sendFile(__dirname + '/public/s3test.html')
})

// 1. Create Bucket
app.post('/bucket', function (req, res) {
 

    var bucketname = req.body.bucketname

    var params = {
        Bucket: req.body.bucketname
    }
 
    s3.createBucket(params, function(err, data) {
      
        if (err) {
            console.log('!!!(create bucket) Error creating bucket', err)
            res.status(500)
            res.end()
        } else {
            console.log('(create bucket) Created bucket', req.body.bucketname)
            res.status(200)
            res.send(data)
        }
       
    })
})


// 2. Upload (local) file
app.post('/bucket/file', function  (req, res) {

    var params = {
        Bucket: req.body.bucketname, Key: '', Body: ''};

    var filestream = fs.createReadStream(__dirname + '/'+ req.body.filename)

    filestream.on('error', function (err) {
        console.log('!!!!(upload file) Error',err)
    })

    params.Body = filestream
    params.Key = req.body.filename

    s3.upload (params, function (err, data) {

        if (err) {
            console.log('!!!(upload to bucket) Error uploading file', err)
            res.status(500)
            res.end()
        } else {
            console.log('(uploda to bucket) File', req.body.filename, 'uploaded to s3')
            res.status(200)
            res.send(data)
        }

    })
})




/* // CODE TO BE DELETED - FOR REFERENCE ONLY
// 1. create Topic - input = topic name
app.post('/sns', function (req, res) {
 
    var snsParams = {
        Name: req.body.snstopic
    }

    sns.createTopic(snsParams, function(err, data) {
        if (err) {
            console.log("!!(create topic) Error creating topic", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(create topic) topic\" " + req.body.snstopic + " \"created")
            console.log("(create topic) topic arn is:", data.TopicArn)
            res.status(201)
            res.send(data)
        }
    })
})

// 2. subscribe queue to SNS topic
app.post('/sns/subscribe-queue', function (req, res) {
 
    var snsParams = {
        'TopicArn': req.body.snsarn,
        'Protocol': 'sqs',
        'Endpoint': req.body.sqsarn

    }

    sns.subscribe(snsParams, function(err, data) {
        if (err) {
            console.log("!!(subscribe queue) Error", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(subscribe queue) subscribed queue", req.body.sqsarn, "to topic" ,req.body.snsarn)
            res.status(201)
            res.send(data)
        }
    })
})

// 3. subscribe email to SNS topic
app.post('/sns/subscribe-email', function (req, res) {
 
    var snsParams = {
        'TopicArn': req.body.snsarn,
        'Protocol': 'email',
        'Endpoint': req.body.email

    }

    sns.subscribe(snsParams, function(err, data) {
        if (err) {
            console.log("!!(subscribe email) Error", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(subscribe email) subscribed email", req.body.email, "to topic" ,req.body.snsarn)
            res.status(201)
            res.send(data)
        }
    })
})

// 4. Send message to SNS topics
app.post('/sns/message', function (req, res) {

    var snsParams = {
        Message: req.body.snsmessage,
        TopicArn: req.body.snstopicarn
    }

    sns.publish (snsParams, function (err, data) {
        if (err) {
            console.log("!!(sns publish) Error", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(sns publish) sent message:", req.body.snsmessage)
            console.log("to topic arn:", req.body.snstopicarn)
            res.status(200)
            res.send(data)
        }
    })   
})

// 5. List SNS topics
app.get('/sns', function (req, res) {

    function listone (listNextToken) {

        var datalist = { set: [] }
        var i = 0

        if (listNextToken) {
            var snsParams = { NextToken : listNextToken }
            console.log("(sns list topics) >>> iterating, next token is:", listNextToken)
        } else {
            var snsParams = {}
        }

        sns.listTopics (snsParams, function (err, data) {
            if (err) {
                console.log("!!(sns list topics) Error", err)
                res.status(500)
                res.send(err)
            } else {
                console.log("(sns list topics) Topics:")
                datalist.set[i] = data
                i++
                console.log(data)

                // if we have a next token, list again
                if (data.NextToken) {
                    setTimeout(listone(data.NextToken),0)
                } else {
                    res.status(200)
                    res.send(datalist)
                }
            }
        })
    }
    listone()
})

// 6. Delete Topic
app.post('/sns/delete-topic', function (req, res) {

    var snsParams = {
        TopicArn: req.body.snsarn
    } 

    sns.deleteTopic (snsParams, function (err, data) {
        if (err) {
            console.log("!!(sns delete topic) Error", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(sns delete topic) deleted topic for arn:", req.body.snsarn)
            res.status(200)
            res.send(data)
        }
    })   
})


// 7. List SNS subscriptions
app.get('/sns/subscription', function (req, res) {

    var datalist = { set: [] }
    var i = 0

    function listone (listNextToken) {
  
        if (listNextToken) {
            var snsParams = { NextToken : listNextToken }
            console.log("(sns list subscriptions) >>> iterating, next token is:", listNextToken)
        } else {
            var snsParams = {}
        }
        
        sns.listSubscriptions (snsParams, function (err, data) {
            if (err) {
                console.log("!!(sns list subscriptions) Error", err)
                res.status(500)
                res.send(err)
            } else {
                console.log("(sns list subscriptions) Subscriptions:")
                datalist.set[i] = data
                i++
                console.log(data)

                // if we have a next token, list again
                if (data.NextToken) {
                    listNextToken = data.NextToken
          
                // wrap recursion with set timeout
                setTimeout(function () {
                    listone(data.NextToken);
                    }, 0);

                } else {
                    res.status(200)
                    res.send(datalist)    
                }
            }
        })
    }
    listone()
})

/

// 8. Unsubscribe
app.post('/sns/delete-subscription', function (req, res) {

    var snsParams = {
        SubscriptionArn: req.body.snssubarn
    } 

    sns.unsubscribe (snsParams, function (err, data) {
        if (err) {
            console.log("!!(sns delete subscription) Error", err)
            res.status(500)
            res.send(err)
        } else {
            console.log("(sns delete subscription) deleted subscription  arn:", req.body.snssubarn)
            res.status(200)
            res.send(data)
        }
    })   


})

*/

function start_webserver(port) { 

    // Start server.
    var server = app.listen(port, function () {
    
       // get host - doesn't work on aws..
        var host = server.address().address;
        var port = server.address().port;
        console.log('AWS S3 test listening at http://%s:%s', host, port);
    
    })
}

//kick it all off - start webserver on 8888
start_webserver(9000)

// done -eol