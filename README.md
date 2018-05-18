## AWS S3 NodeJS Example / Demo code

## What is this?
A web client app that excercises the AWS S3 functionality via the API

![Alt text](/screenshots/s3upload.png)

## Contains:
/config = example aws credentials config file
/controllers = s3Controller for UI and AWS SKD calls
/public = style sheet
/views = ejs UI 
app.js - main app, launch it and point browser to port 3000


### S3 Functionality:
- Create Bucket
- List Buckets
- Upload (local) file/obj to bucket
- List files/objs in bucket
- Delete file/obj
- Delete bucket


## Installation overview
clone the repo and install dependencies:

```
git clone https://github.com/ajyounguk/aws-s3-demo
cd aws-s3-client
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

point browser at (localIP/remoteIP) port 3000

For more information on S3

https://aws.amazon.com/s3/



### EOF Readme..
