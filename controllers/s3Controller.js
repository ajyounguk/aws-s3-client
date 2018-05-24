// AWS S3 Client Controller
module.exports = function (app) {

    // load the AWS SDK
    var aws = require('aws-sdk')
    var fs = require('fs')

    var ui = {}

    // setup bodyparser
    var bodyParser = require('body-parser');
    app.use(bodyParser.json()); // support json encoded bodies
    app.use(bodyParser.urlencoded({
        extended: true
    })); // support encoded bodies

    // load aws config
    aws.config.loadFromPath(__dirname + '/../config/aws-config.json')

    console.log(__dirname)

    // load and override endpoints (if config file exists)
    var configFile = null
    try {
        configFile = fs.readFileSync(__dirname + '/../config/aws-override.json', 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log("No local AWS endpoint config found, using dafault route to AWS")
        } else {
            throw (err)
        }
    }


    // if found, parse override config
    if (configFile) {
        overrides = JSON.parse(configFile)

        console.log('Overriding AWS S3 endpoint to:', overrides.s3_endpoint)

        aws.config.s3 = {
            'endpoint': overrides.s3_endpoint
        }
    }


    // ! there seems to be a localstack feature that requires the "s3ForcePathStyle: true" param. set below../
    // ! since the sdk prefixes the s3 endpoint with the bucket name
    // ! and that doesn't resolve locally (e.g: http://mybucket.localhost:4572 - whereby http://locahost:4572 would 
    // ! work correctly pointing to the localstack endpoint..) the se builder param seems to fix this..
    // ! see: https://github.com/localstack/localstack/issues/43
    // ! also tested with AWS and it works so lets keep it..

    var s3 = new aws.S3({
        s3ForcePathStyle: true
    });

    // serve up main test page 
    app.get('/', function (req, res) {

        ui = {
            menuitem: 1,
            data: [],
            def_bucket: '',
            def_file: ''
        }

        ui.menuitem = 1

        res.setHeader('Content-Type', 'text/html');
        res.render('./index', {
            ui: ui
        })

    })

    // 1. Create Bucket
    app.post('/bucket', function (req, res) {

        ui.menuitem = 1
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        var bucketname = req.body.bucketname
        ui.def_bucket = bucketname

        var params = {
            Bucket: req.body.bucketname
        }

        s3.createBucket(params, function (err, data) {

            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)
            }

            res.render('./index', {
                ui: ui
            })
        })
    })


    // 2. List Buckets
    app.get('/bucket', function (req, res) {

        ui.menuitem = 2
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        s3.listBuckets(function (err, data) {

            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)

                if (ui.def_bucket == '' && ui.data[ui.menuitem].status == 'SUCCESS') {
                    ui.def_bucket = data.Buckets[1].Name
                }
            }

            res.render('./index', {
                ui: ui
            })
        })
    })

    // 3. Upload (local) file
    app.post('/bucket/file', function (req, res) {

        ui.menuitem = 3
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        ui.def_bucket = req.body.bucketname
        ui.def_file = req.body.filename

        var params = {
            Bucket: req.body.bucketname,
            Key: '',
            Body: ''
        };

        var filestream = fs.createReadStream(__dirname + '/../' + req.body.filename)

        params.Body = filestream
        params.Key = req.body.filename

        s3.upload(params, function (err, data) {

            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)
            }

            res.render('./index', {
                ui: ui
            })

        })



    })


    // 4. List Objects in Bucket
    app.get('/bucket/objects', function (req, res) {

        ui.menuitem = 4
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        var params = {
            Bucket: req.query.bucketname
        }

        s3.listObjects(params, function (err, data) {


            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)
            }

            res.render('./index', {
                ui: ui
            })
        })
    })

    // 5. Delete object
    app.post('/bucket/file/delete', function (req, res) {

        ui.menuitem = 5
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        var params = {
            Bucket: req.body.bucketname,
            Key: req.body.filename
        }

        ui.def_bucket = req.body.bucketname
        ui.def_file = req.body.filename

        s3.deleteObject(params, function (err, data) {

            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)
            }

            res.render('./index', {
                ui: ui
            })
        })
    })

    // 6. Delete Bucket
    app.post('/bucket/delete', function (req, res) {

        ui.menuitem = 6
        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        var params = {
            Bucket: req.body.bucketname
        }

        ui.def_bucket = req.body.bucketname

        s3.deleteBucket(params, function (err, data) {

            if (err) {
                ui.data[ui.menuitem].status = 'ERROR'
                ui.data[ui.menuitem].sdkResponse = err
                res.status(500)
            } else {
                ui.data[ui.menuitem].status = 'SUCCESS'
                ui.data[ui.menuitem].sdkResponse = data
                res.status(201)
            }

            res.render('./index', {
                ui: ui
            })

        })
    })



    // 7. Presigned URLS
    app.post('/bucket/presign', function (req, res) {

        ui.menuitem = 7

        var date = new Date(Date.now())
        ui.data[ui.menuitem] = {
            "timestamp": date,
            "status": '',
            sdkResponse: ''
        }

        ui.def_bucket = req.body.bucketname
        ui.def_file = req.body.filename

        var params = {
            Bucket: req.body.bucketname,
            Key: req.body.filename,
            Expires: signedUrlExpireSeconds
        }

        var signedUrlExpireSeconds = 60 * 1 // 1 minute..

        var geturl = s3.getSignedUrl('getObject', params)

        var puturl = s3.getSignedUrl('putObject', params)

        var deleteurl = s3.getSignedUrl('deleteObject', params)


        ui.data[ui.menuitem].status = 'SUCCESS'
        ui.data[ui.menuitem].sdkResponse = {
            getURL: geturl,
            putURL: puturl,
            deleteURL: deleteurl
        }

        res.status(201)


        res.render('./index', {
            ui: ui
        })


    })






}