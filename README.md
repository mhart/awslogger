awslogger
---------

A CLI tool to send lines from stdin as messages to AWS CloudWatch Logs.

Will create the log group and log stream if necessary (and if the correct
permissions are available). Loads credentials in the same way the AWS SDKs do
(env, config file, IAM role).

Also check out
[cloudwatchlogs-stream](https://github.com/nearform/cloudwatchlogs-stream) in
case that's more suitable for your needs – it wasn't for mine because I needed
other features like line splitting, credential loading, timestamping etc.

Example
-------

```console
$ awslogger --help

Usage: awslogger [-t] group-name stream-name < lines.log

Sends lines from stdin to AWS CloudWatch Logs

Options:
--help     Display this help message and exit
-t         Prepend a ISO8601 timestamp to each message/line
```

Or programmatically (as a writable stream):

```js
var awslogger = require('awslogger'),
    CloudWatchLogsStream = awslogger.CloudWatchLogsStream

var logStream = awslogger({logGroupName: 'a', logStreamName: 'b', addTimestamp: true})

// or

var logStream = new CloudWatchLogsStream({logGroupName: 'a', logStreamName: 'b', addTimestamp: true})

process.stdin.setEncoding('utf8')
process.stdin.pipe(logStream)
```

Installation
------------

With [npm](http://npmjs.org/) do:

```sh
$ npm install -g awslogger
```

