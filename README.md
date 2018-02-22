## AWS SQS & SNS NodeJS Example / Demo code

## What is this?
Demo code that excercises the AWS SNS & SQS functionality via the API

## Contains
- SQS server, with endpoints to trigger the relevant SQS API (sqs-test.js)
- SNS server, with endpoints to trigger the relevant SNS API (sns-test.js)

- Test SQS HTML entry form (after running SQS server, poin browser at localhost:8888)
- Test SNS HTML entry form (after running SQS server, poin browser at localhost:8888)

### SQS Functionality:
- Create SQS queues
- List SQS queues
- Get queue URL
- Get queue attributes
- Send message to queue
- Get (receive) message from queue
- Delete message from queue
- Purge all messages from queue
- Delete queues
- Set queue attributes (namely policy for SNS subcription)

### SNS Functionality:
- Create topics
- Add queue subscription
- Add email subscription
- Send message to topic
- List topics
- Delete topics
- List subscriptions
- Delete subscriptions

## Acknowledgements
Based on code from AWS SQS examples at: https://www.youtube.com/watch?v=4Z74luiE2bg\ and https://github.com/andrewpuch/aws-sqs-node-js-examples

Mark Allen's SNS code here: https://github.com/markcallen/snssqs/blob/master/create.js

CSS template inspired from: https://www.sanwebe.com/2014/08/css-html-forms-designs


## Installation overview

  create an AWS EC2 or local ubuntu instance.

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
git clone https://github.com/ajyounguk/aws-sqs-test
cd aws-sqs-test
npm install
```


## Credentials
Copy the configuration details and add your AWS creds.
```
cp config-sample.json config.json
```

(IAM user creds with group policy = AmazonSQSFullAccess, AmazonSNSFullAccess works)


## How to run it
run the server:

```
node sqs-test-server
node sns-test-server
```

point your browser at the EC2 instnace on port 8888 (SQS) and 8889 (SNS) to load the test harness

For more information on SNS and SQS:

https://aws.amazon.com/sns/
https://aws.amazon.com/sqs/

