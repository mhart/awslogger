var util = require('util'),
    stream = require('stream'),
    apiRequest = require('./apiRequest')

module.exports = function(options) {
  return new CloudWatchLogsStream(options)
}
module.exports.CloudWatchLogsStream = CloudWatchLogsStream

function CloudWatchLogsStream(options) {
  if (!options || !options.logGroupName || !options.logStreamName)
    throw new Error('logGroupName and logStreamName must be given')
  stream.Writable.call(this, options)
  this.options = options
  // From http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
  // Not including size limit – the default streams high watermark of 64kb make it unlikely to exceed 1MB per batch
  this.maxEvents = options.maxEvents || 10000
  this.trailing = null
  this.events = []
  this.pushingEvents = false
}
util.inherits(CloudWatchLogsStream, stream.Writable)

CloudWatchLogsStream.prototype._write = function(data, encoding, cb) {
  var lines = ((this.trailing || '') + data).split(/\r?\n/g)
  this.trailing = lines.pop()
  if (this.finalWrite && this.trailing) lines.push(this.trailing)
  this.bufferLines(lines)
  // Callback immediately to receive more data so our timestamps are accurate
  cb()
}

CloudWatchLogsStream.prototype.end = function(data, encoding, cb) {
  this.finalWrite = true
  this._write(data || new Buffer(''), encoding, stream.Writable.prototype.end.bind(this, undefined, undefined, cb))
}

CloudWatchLogsStream.prototype.bufferLines = function(lines) {
  if (this.options.addTimestamp) lines = lines.map(function(line) { return new Date().toISOString() + ' ' + line })
  // TODO: timestamp of "trailing" line will be inaccurate as it gets sent with the subsequent batch
  var events = lines.filter(Boolean).map(function(line) { return {timestamp: +new Date, message: line} })
  this.events.push.apply(this.events, events)
  if (!this.pushingEvents) this.flushEvents()
}

CloudWatchLogsStream.prototype.flushEvents = function(err) {
  if (err || !this.events.length) {
    this.pushingEvents = false
    if (err) this.emit('error', err)
    return
  }
  this.pushingEvents = true
  var singleBatch = this.events.splice(0, this.maxEvents)
  this.putLogEvents(singleBatch, this.flushEvents.bind(this))
}

CloudWatchLogsStream.prototype.putLogEvents = function(events, cb) {
  var self = this
  apiRequest('PutLogEvents', {
    logGroupName: self.options.logGroupName,
    logStreamName: self.options.logStreamName,
    logEvents: events,
    sequenceToken: self.nextSequenceToken || undefined,
  }, self.options, function(err, data) {
    if (err) {
      if (err.name == 'ResourceNotFoundException') {
        var createFn = /log group does not exist/.test(err.message) ? self.createLogGroup :
          /log stream does not exist/.test(err.message) ? self.createLogStream : null
        if (createFn) {
          return createFn.call(self, function(err) {
            if (err) return cb(err)
            self.putLogEvents(events, cb)
          })
        }
      } else if (err.name == 'InvalidSequenceTokenException') {
        self.nextSequenceToken = (err.message.match(/expected sequenceToken is: (\w+)/) || [])[1]
        return self.putLogEvents(events, cb)
      } else if (err.name == 'DataAlreadyAcceptedException') {
        self.nextSequenceToken = (err.message.match(/sequenceToken: (\w+)/) || [])[1]
        return cb()
      }
      return cb(err)
    }
    self.nextSequenceToken = data.nextSequenceToken
    cb()
  })
}

CloudWatchLogsStream.prototype.createLogGroup = function(cb) {
  var self = this
  apiRequest('CreateLogGroup', {
    logGroupName: self.options.logGroupName,
  }, self.options, function(err) {
    if (err) return cb(err)
    self.createLogStream(cb)
  })
}

CloudWatchLogsStream.prototype.createLogStream = function(cb) {
  var self = this
  apiRequest('CreateLogStream', {
    logGroupName: self.options.logGroupName,
    logStreamName: self.options.logStreamName,
  }, self.options, cb)
}
