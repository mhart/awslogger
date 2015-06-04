#!/usr/bin/env node

var argv = process.argv.slice(2), opts = {}

if (!argv[0] || argv[0] == '--help') {
  return console.log([
    '',
    'Usage: awslogger [-t] group-name stream-name < lines.log',
    '',
    'Sends lines from stdin to AWS CloudWatch Logs',
    '',
    'Options:',
    '--help     Display this help message and exit',
    '-t         Prepend a ISO8601 timestamp to each message/line',
    '',
    'Report bugs at github.com/mhart/awslogger/issues',
  ].join('\n'))
}

if (argv[0] == '-t') {
  opts.addTimestamp = true
  argv.splice(0, 1)
}

opts.logGroupName = argv[0]
opts.logStreamName = argv[1]

var logStream = require('./index')(opts)

process.stdin.setEncoding('utf8')
process.stdin.pipe(logStream)

