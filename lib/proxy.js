/*
 * Monkey-patch the http and https modules
 * to support proxies defined in the environment
 * (from HTTP_PROXY, HTTPS_PROXY, and NO_PROXY)
 *
 * Coded by macolu (https://github.com/macolu)
 */

var http  = require('http');
var https = require('https');
var url   = require('url');

var httpRequest = http.request;
var httpsRequest = https.request;

if (process.env.http_proxy) {
  var httpProxy = url.parse(process.env.http_proxy);

  http.request = function(options, callback) {
    if (!isProxyRequired(options.host)) {
      return httpRequest(options, callback);
    }
    var newOptions = clone(options);
    newOptions.path     = "http://" + options.hostname + ":" + (options.port || 80) + options.path;
    newOptions.hostname = httpProxy.hostname;
    newOptions.port     = httpProxy.port;
    newOptions.protocol = httpProxy.protocol;
    if (httpProxy.protocol === 'https:') {
      return httpsRequest(newOptions, callback);
    } else {
      return httpRequest(newOptions, callback);
    }
  };
}

if (process.env.https_proxy) {
  var httpsProxy = url.parse(process.env.https_proxy);

  var ClientRequestPromise = function() {
    this._request = null;
    this._registered = [];

    // add promise on ClientRequest methods
    var self = this;
    ['on', 'write', 'end', 'abort', 'setTimeout', 'setNoDelay', 'setSocketKeepAlive'].forEach(function(event) {
      self[event] = function() {
        var args = [event].concat(Array.prototype.slice.call(arguments));
        if (this._request) {
          this._proxyRequest(this._request, args);
        } else {
          this._registered.push(args);
        }
        return this;
      };
    });

    this.resolve = function(request) {
      this._request = request;
      var self = this;
      this._registered.forEach(function(event) {
        self._proxyRequest(request, event);
      });
    };

    this._proxyRequest = function(request, event) {
      var name = event[0];
      var params = event.splice(1);
      if (request[name] && typeof request[name] === 'function') {
        request[event].apply(request, params);
      }
    };
  };

  https.request = function(options, callback) {
    if (!isProxyRequired(options.host)) {
      return httpsProxy(options, callback);
    }

    opts = {
      method: 'CONNECT',
      path: options.hostname +':'+ (options.port || 443),
      host: httpsProxy.hostname,
      port: httpsProxy.port
    };

    var promise = new ClientRequestPromise();
    
    var req = httpRequest(opts).on('connect', function(res, socket, head) {
      opts = {
        host: options.hostname,
        port: options.port || 443,
        path: options.path,
        socket: socket,
        agent: false
      };
      var req = httpsRequest(opts, callback);
      promise.resolve(req);
    }).end();
    return promise;
  };
}

/**
 * Returns weather proxy should be used when requesting given host
 *
 * ie. returns false if hostname match any pattern in no_proxy environment variable
 */
var isProxyRequired = function(hostname) {
  if (!process.env.no_proxy) {
    return true;
  }

  var exclusionPatterns = process.env.no_proxy.split(',');

  for (var i in exclusionPatterns) {
    if (hostname.search(exclusionPatterns[i]) >= 0) {
      return false;
    }
  }

  return true;
};

var clone = function(obj) {
  if(obj == null || typeof(obj) != 'object') return obj;
  var temp = obj.constructor();
  for (var key in obj) {
    temp[key] = clone(obj[key]);
  }
  return temp;
};
