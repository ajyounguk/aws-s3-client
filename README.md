## AWS S3 NodeJS Example / Demo code

## What is this?
Demo node.js app that excercises the AWS S3 functionality via the API

## Contains:
/config = example aws credentials config file
/controllers = s3Controller code with HTTP endpoints + AWS S3 API Code
/public = s3 HTML test / demo app and style sheet
app.js - main app, launch it and point browser to port 3000


### S3 Functionality:
- Create Bucket
- List Buckets
- Upload (server local) file/obj to bucket
- List files/objs in bucket
- Delete file/obj
- Delete bucket


## Installation overview
clone the repo and install dependencies:

```
git clone https://github.com/ajyounguk/aws-s3-demo
cd aws-s3-demo
npm install
```


## Credentials
Copy the configuration file and add your AWS creds to it:
```
cd config
cp aws-config-sample.json aws-config.json
```
*(IAM user creds with group policy = AmazonS3SFullAccess works)*


## How to run it
run the server:

```
node app.js
```

point browser at (localIP/remoteIP) port 8888 (SQS) to load the test harness

For more information on S3

https://aws.amazon.com/s3/



### EOF Readme..
