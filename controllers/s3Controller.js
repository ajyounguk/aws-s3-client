// AWS Controller

module.exports = function (app) {

    // load the AWS SDK
    var aws         = require('aws-sdk')
    var fs          = require('fs')

    // setup bodyparser
    var bodyParser = require('body-parser');
    app.use(bodyParser.json()); // support json encoded bodies
    app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

    // load aws config
    aws.config.loadFromPath(__dirname + '/../config/aws-config.json')

    // create the aws service object
    var s3 = new aws.S3()

    // serve up main test page 
    app.get('/',function(req,res) {
        res.render(__dirname + '../public/s3test.html')
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
                res.send(err)
            } else {
                console.log('(create bucket) Created bucket', req.body.bucketname)
                res.status(200)
                res.send(data)
            }
        
        })
    })


    // 2. List Buckets
    app.get('/bucket', function (req, res){

        s3.listBuckets(function(err, data) {
            if (err) {
                console.log('!!!(list  bucket) Error', err)
                res.status(500)
                res.send(err)
            } else {
                console.log('(list buckets) returns:', data)
                res.status(200)
                res.send(data)
            }
        })
    })

    // 3. Upload (local) file
    app.post('/bucket/file', function  (req, res) {

        var params = {
            Bucket: req.body.bucketname, Key: '', Body: ''};

        var filestream = fs.createReadStream(__dirname + '/../'+ req.body.filename)

        filestream.on('error', function (err) {
            console.log('!!!!(upload file) Error',err)
            res.status(500)
            res.end()
        })

        params.Body = filestream
        params.Key = req.body.filename

        s3.upload (params, function (err, data) {
            if (err) {
                console.log('!!!(upload file) Error uploading file', err)
                res.status(500)
                res.send(err)
            } else {
                console.log('(upload file) File', req.body.filename, 'uploaded to s3')
                res.status(200)
                res.send(data)
            }
        })
    })


    // 4. List Objects in Bucket
    app.get('/bucket/objects', function (req, res) {

        var params = {
            Bucket : req.query.bucketname
        } 

        s3.listObjects(params, function(err, data) {
            if (err) {
                console.log('!!!(list objects) Error listing objects', err)
                res.status(500)
                res.send(err)
            } else {
                console.log('(list objects) Objects in bucket', req.query.bucketname +':')
                res.status(200)
                res.send(data)
            }
        })
    })

    // 5. Delete object
    app.post('/bucket/file/delete', function (req, res) {

        var params = {
            Bucket: req.body.bucketname, 
            Key: req.body.filename
        }

        s3.deleteObject(params, function(err, data) {
            if (err) {
                console.log('!!!(delete object) Error deleting object', err)
                res.status(500)
                res.send(err)
            } else {
                console.log('(delete object) Object', req.body.filename,'in bucket', req.body.bucketname, 'deleted')
                res.status(200)
                res.send(data)
            }
    })
    })

    // 6. Delete Bucket
    app.post('/bucket/delete', function (req, res) {

        var params = {
            Bucket: req.body.bucketname
        }

        s3.deleteBucket(params, function(err, data) {
            if (err) {
                console.log('!!!(delete bucket) Error deleting object', err)
                res.status(500)
                res.send(err)
            } else {
                console.log('(delete bucket) Bucket', req.query.bucketname, 'deleted')
                res.status(200)
                res.send(data)
            }
    })
    })
}