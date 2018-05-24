// AWS S3 API demo

// load the express framework
var express = require('express')
var app = express()

var port = process.env.PORT || 3000

// configure assets and views
app.use('/assets', express.static(__dirname + '/public'))
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// load the controller
var s3Controller = require('./controllers/s3Controller')

s3Controller(app)

// Start server.
console.log('AWS S3 Demo listening on port', port);

app.listen(port)


// done -eol