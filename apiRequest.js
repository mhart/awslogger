var https = require('https'),
    aws4 = require('aws4'),
    awscred = require('awscred')

module.exports = apiRequest

function apiRequest(action, data, options, cb) {
  if (!cb) { cb = options; options = {} }
  if (!cb) { cb = data; data = {} }

  cb = once(cb)

  awscred.merge(options, function(err) {
    if (err) return cb(err)

    var httpOptions = {},
        body = JSON.stringify(data),
        retryPolicy = options.retryPolicy || defaultRetryPolicy

    httpOptions.host = options.host || 'logs.' + options.region + '.amazonaws.com'
    httpOptions.port = options.port
    if (options.agent != null) httpOptions.agent = options.agent
    if (options.timeout != null) httpOptions.timeout = options.timeout
    if (options.region != null) httpOptions.region = options.region
    httpOptions.method = 'POST'
    httpOptions.path = '/'
    httpOptions.body = body

    // Don't worry about self-signed certs for localhost/testing
    if (httpOptions.host == 'localhost' || httpOptions.host == '127.0.0.1')
      httpOptions.rejectUnauthorized = false

    httpOptions.headers = {
      'Host': httpOptions.host,
      'Content-Length': Buffer.byteLength(body),
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'Logs_' + (options.version || '20140328') + '.' + action,
    }

    function request(cb) {
      httpOptions.headers.Date = new Date().toUTCString()

      aws4.sign(httpOptions, options.credentials)

      var req = https.request(httpOptions, function(res) {
        var json = ''

        res.setEncoding('utf8')

        res.on('error', cb)
        res.on('data', function(chunk) { json += chunk })
        res.on('end', function() {
          var response, parseError

          if (json)
            try { response = JSON.parse(json) } catch (e) { parseError = e }

          if (res.statusCode == 200 && !parseError)
            return cb(null, response)

          var error = new Error
          error.statusCode = res.statusCode
          if (response != null) {
            error.name = (response.__type || '').split('#').pop()
            error.message = response.message || response.Message || JSON.stringify(response)
          } else {
            if (res.statusCode == 413) json = 'Request Entity Too Large'
            error.message = 'HTTP/1.1 ' + res.statusCode + ' ' + json
          }

          cb(error)
        })
      }).on('error', cb)

      if (options.timeout != null) {
        req.setTimeout(options.timeout)
        req.on('timeout', function() { req.abort() })
      }

      req.end(body)

      return req
    }

    return retryPolicy(request, options, cb)
  })
}

function defaultRetryPolicy(request, options, cb) {
  var initialRetryMs = options.initialRetryMs || 50,
      maxRetries = options.maxRetries || 10, // Timeout doubles each time => ~51 sec timeout
      errorCodes = options.errorCodes || [
        'EADDRINFO',
        'ETIMEDOUT',
        'ECONNRESET',
        'ESOCKETTIMEDOUT',
        'ENOTFOUND',
        'EMFILE',
        'EPIPE',
        'EPROTOTYPE',
      ],
      errorNames = options.errorNames || [
        'ProvisionedThroughputExceededException',
        'ThrottlingException',
        'OperationAbortedException',
      ],
      expiredNames = options.expiredNames || [
        'ExpiredTokenException',
        'ExpiredToken',
        'RequestExpired',
      ]

  function retry(i) {
    return request(function(err, data) {
      if (!err || i >= maxRetries)
        return cb(err, data)

      if (err.statusCode == 400 && ~expiredNames.indexOf(err.name)) {
        return awscred.loadCredentials(function(err, credentials) {
          if (err) return cb(err)
          options.credentials = credentials
          return request(cb)
        })
      }

      if (err.statusCode >= 500 || ~errorCodes.indexOf(err.code) || ~errorNames.indexOf(err.name))
        return setTimeout(retry, initialRetryMs << i, i + 1)

      return cb(err)
    })
  }

  return retry(0)
}

function once(cb) {
  var called = false
  return function() {
    if (called) return
    called = true
    cb.apply(this, arguments)
  }
}

