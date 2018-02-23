## AWS S3 NodeJS Example / Demo code

## What is this?
Demo code that excercises the AWS S3 functionality via the API

## Contains
- S3 server, with endpoints to trigger the relevant S3 API (app.js)
- Test S3 HTML entry form (after running S3 server, point browser at localhost:9000)


### S3 Functionality:
- Create Bucket
- List Buckets
- Upload (server local) file/obj to bucket
- List files/objs in bucket
- Delete file/obj
- Delete bucket

## Acknowledgements
CSS template inspired from: https://www.sanwebe.com/2014/08/css-html-forms-designs


## Installation overview
Mac - install node :)
or
Linux - create an AWS EC2 or local ubuntu instance.
update it with:
```
sudo su
apt-get update
apt-get upgrade -y
apt-get dist-upgrade -y
apt-get autoremove -y
apt-get install nodejs npm git -y
ln -s /usr/bin/nodejs /usr/bin/node
```



clone the repo and install it:

```
git clone https://github.com/ajyounguk/aws-s3-demo
cd aws-s3-demo
npm install
```


## Credentials
Copy the configuration file and add your AWS creds to it:
```
cp config-sample.json config.json
```

(IAM user creds with group policy = AmazonS3SFullAccess works)


## How to run it
run the server:

```
node app.js
```

point browser at (localIP/remoteIP) port 8888 (SQS) to load the test harness

For more information on S3

https://aws.amazon.com/s3/

