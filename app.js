// AWS S3 API demo

// load the AWS SDK
var express     = require('express');
var app         = express();
var s3Controller = require('./controllers/s3Controller')

// serve up pages from /public
app.use(express.static('public'))


function start_webserver() { 

    var port = process.env.PORT || 3000

    // Start server.
    var server = app.listen(port, function () {
    
        console.log('AWS S3 Demo listening on port', port);
    
    })
}

//kick it all off - start webserver on 8888
s3Controller(app)
start_webserver()

// done -eol