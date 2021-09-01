window.funnelytics = {
  cookie: '_fs',

  origin: 'https://track.funnelytics.io',

  project: null,

  session: null,

  step: null,

  stepping: false,

  queueList: [],

  doNotTrack: navigator.doNotTrack !== undefined && navigator.doNotTrack === '1',

  getSession() {
    var params = funnelytics.url.params.toObject(location.search.substr(1)),
      storedSession = funnelytics.cookies.get(funnelytics.cookie);
    if(params[funnelytics.cookie]) {
      funnelytics.cookies.set(funnelytics.cookie, params[funnelytics.cookie]);
      return params[funnelytics.cookie];
    } else {
      return storedSession;
    };
  },

  queue: {
    handle: function(type) {
      var obj, type, remove = [];
      for(var i = 0; i < funnelytics.queueList.length; i++) {
        obj = funnelytics.queueList[i];
        switch(obj.type) {
          case 'events.trigger':
            funnelytics.events.trigger(obj.name, obj.attributes, obj.callback, obj.opts);
            remove.push(obj);
            break;
        }
      }
      for(var i = 0; i < remove.length; i++) {
        funnelytics.queue.remove(obj);
      }
    },

    find(type) {
      var result = [], obj;
      for(var i = 0; i < funnelytics.queueList.length; i++) {
        obj = funnelytics.queueList[i];
        if(obj.type === type) {
          result.push(obj);
        }
      }
      return;
    },

    remove: function(obj) {
      funnelytics.queueList.splice(funnelytics.queueList.indexOf(obj), 1);
    }
  },

  cookies: {
    getDomain: function() {
      var domain = window.location.hostname.split('.');
      if(domain.length > 2) {
        domain = domain.slice(domain.length - 2);
      }
      return domain;
    },

    all: function() {
      var result = {},
        cookie;
      for(var i = 0; i < ((cookies = document.cookie.split('; ')).length); i++) {
        cookie = cookies[i].split('=');
        result[decodeURI(cookie[0])] = decodeURI(cookie[1]);
      }
      return result;
    },

    get: function(key) {
      // TODO: this can somehow be improved..
      return funnelytics.cookies.all()[key];
    },

    set: function(key, val) {
      var cookie = key + '=' + val + '; path=/; ',
        domain = funnelytics.cookies.getDomain(),
        expiration = val == undefined ? '; expires=Thu, 01 Jan 1970 00:00:00 UTC;' : '';
      document.cookie = cookie + 'domain=' + domain.join('.') + expiration;
      if(!funnelytics.cookies.get(key)) {
        domain.shift();
        document.cookie = cookie + 'domain=' + '.' + domain.join('.') + expiration;
      }
    },

    remove: function(key) {
      funnelytics.cookies.set(key);
    }
  },

  url: {
    regex: new RegExp(/.*:\/\/.*\..*/),

    isURL: function(url) {
      return funnelytics.url.regex.test(url);
    },

    params: {
      regex: new RegExp(/.*:\/\/.*\..*\?/),

      fromURL: function(url) {
        var params = url.split(funnelytics.url.params.regex);
        params = params.length == 2 ? params[1] : null;
        return funnelytics.url.params.toObject(params);
      },

      toObject: function(segment) {
        var result = {};
        if(segment) {
          var param;
          for(var i = 0; i < ((params = segment.split('&')).length); i++) {
            param = params[i].split('=');
            result[decodeURI(param[0])] = decodeURI(param[1]);
          }
        }
        return result;
      },

      toString: function(obj) {
        var url = '?',
          keys = Object.keys(obj),
          key;
        for(var i = 0; i <= (len = keys.length - 1); i++) {
          key = keys[i];
          url += encodeURI(key) + '=' + encodeURI(obj[key]);
          if(i != len) {
            url += '&';
          }
        }
        return url;
      }
    }
  },

  events: {
    trigger: function(name, attributes, callback, opts) {
      if(!opts) {
        opts = {};
      }
      var out;
      /*if(funnelytics.doNotTrack) {
        out = {
          message: 'Do Not Track is enabled by the user.'
        };
        if(typeof(callback) === 'function') {
          callback(out);
          return;
        } else if(opts.promise) {
          opts.promise.reject(out);
        } else if(Promise) {
          return new Promise(function(resolve, reject) {
            return reject(out);
          });
        } else {
          return;
        }
      }*/
      if(typeof(name) !== 'string') {
        out = {
          message: 'First argument must be an event name.'
        };
        if(typeof(callback) === 'function') {
          callback(out);
          return;
        } else if(opts.promise) {
          opts.promise.reject(out);
        } else if(Promise) {
          return new Promise(function(resolve, reject) {
            return reject(out);
          });
        } else {
          return;
        }
      }
      if(!funnelytics.step) {
        var promise;
        if(!callback && Promise) {
          var functions;
          instance = new Promise(function(resolve, reject) {
            functions = {
              resolve: resolve,
              reject: reject
            };
          });
          promise = {
            instance: instance,
            resolve: functions.resolve,
            reject: functions.reject
          };
        }
        funnelytics.queueList.push({
          type: 'events.trigger',
          name: name,
          attributes: attributes,
          callback: callback,
          opts: {
            promise: promise
          }
        });
        if(promise) {
          return promise.instance;
        } else {
          return;
        }
      }
      var session = window.funnelytics.cookies.get(window.funnelytics.cookie);
      var req = new XMLHttpRequest();
      req.open('POST', window.funnelytics.origin + '/events/trigger');
      req.setRequestHeader('Content-Type', 'application/json');
      req.addEventListener('load', function() {
        out = JSON.parse(req.responseText)
        if(req.status >= 200 && req.status < 300) {
          if(typeof(callback) === 'function') {
            callback(null, out);
          } else if(opts.promise) {
            opts.promise.resolve(out);
            return;
          } else if(Promise) {
            return new Promise(function(resolve, reject) {
              return resolve(out);
            });
          } else {
            return;
          }
        } else {
          if(typeof(callback) === 'function') {
            callback(out);
            return;
          } else if(opts.promise) {
            opts.promise.reject(out);
            return;
          } else if(Promise) {
            return new Promise(function(resolve, reject) {
              return reject(out);
            });
          } else {
            return;
          }
        }
      });
      req.send(JSON.stringify({
        name: name,
        step: funnelytics.step,
        attributes: attributes
      }));
    }
  },

  attributes: {
    set: function(details, callback) {
      var out;
      /*if(funnelytics.doNotTrack) {
        out = {
          message: 'Do Not Track is enabled by the user.'
        };
        if(typeof(callback) === 'function') {
          callback(out);
          return;
        } else if(Promise) {
          return new Promise(function(resolve, reject) {
            return reject(out);
          });
        } else {
          return;
        }
      }*/
      if(typeof(details) !== 'object') {
        out = {
          message: 'First argument must be an object containing user details.'
        };
        if(typeof(callback) === 'function') {
          callback(out);
          return;
        } else if(Promise) {
          return new Promise(function(resolve, reject) {
            return reject(out);
          });
        } else {
          return;
        }
      }
      var session;
      if(!(session = window.funnelytics.cookies.get(window.funnelytics.cookie))) {
        out = {
          message: 'No Funnelytics session exists for this user.'
        };
        if(typeof(callback) === 'function') {
          callback(out);
          return;
        } else if(Promise) {
          return new Promise(function(resolve, reject) {
            return reject(out);
          });
        } else {
          return;
        }
      }
      var req = new XMLHttpRequest();
      req.open('POST', window.funnelytics.origin + '/trackers/set');
      req.setRequestHeader('Content-Type', 'application/json');
      req.addEventListener('load', function() {
        out = JSON.parse(req.responseText)
        if(req.status >= 200 && req.status < 300) {
          if(typeof(callback) === 'function') {
            callback(null, out);
          } else if(Promise) {
            return new Promise(function(resolve, reject) {
              return resolve(out);
            });
          } else {
            return;
          }
        } else {
          if(typeof(callback) === 'function') {
            callback(out);
            return;
          } else if(Promise) {
            return new Promise(function(resolve, reject) {
              return reject(out);
            });
          } else {
            return;
          }
        }
      });
      req.send(JSON.stringify({
        project: window.funnelytics.project,
        session: session,
        info: details
      }));
    }
  },

  functions: {
    initialize: function() {
      var req = new XMLHttpRequest();
      req.open('POST', funnelytics.origin + '/trackers/step');
      req.setRequestHeader('Content-Type', 'application/json');
      req.addEventListener('load', function() {
        if(req.status >= 200 && req.status < 300) {
          var res = JSON.parse(req.responseText);
          funnelytics.session = res.session.id;
          funnelytics.cookies.set(funnelytics.cookie, funnelytics.session);
          funnelytics.step = res.step.id;
          funnelytics.queue.handle('events.trigger');
        } else if(req.status == 500) {
          funnelytics.cookies.remove(funnelytics.cookie);
        }
      });
      req.send(JSON.stringify({
        project: funnelytics.project,
        page: window.location.href,
        referrer: document.referrer,
        device: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      }));
    },

    step: function() {
      if(!funnelytics.session) {
        funnelytics.functions.initialize();
        return;
      }
      var req = new XMLHttpRequest();
      req.open('POST', funnelytics.origin + '/trackers/step');
      req.setRequestHeader('Content-Type', 'application/json');
      req.addEventListener('load', function() {
        if(req.status >= 200 && req.status < 300) {
          funnelytics.step = JSON.parse(req.responseText).step.id;
          funnelytics.queue.handle('events.trigger');
        } else if(req.status == 500) {
          funnelytics.cookies.remove(funnelytics.cookie);
        }
      });
      req.send(JSON.stringify({
        session: funnelytics.session,
        page: window.location.href,
        referrer: document.referrer
      }));
    }
  },

  init: function(project, isSPA) {
    /*if(funnelytics.doNotTrack) {
      return;
    }*/
    funnelytics.project = project;
    funnelytics.session = funnelytics.getSession();
    if(funnelytics.session) {
      if(isSPA != true) {
        funnelytics.functions.step();
      }
    } else if(project) {
      funnelytics.functions.initialize();
    }
    if(window.funnelytics_queued == true) {
      funnelytics.functions.step();
    }
    var links;
    for(var i = 0; i < ((links = document.getElementsByTagName('a')).length); i++) {
      if(!links[i].href) {
        continue;
      }
      if(window.location.hostname == links[i].hostname) {
        continue;
      }
      if(funnelytics.session && funnelytics.url.isURL(links[i].href)) {
        var revised = funnelytics.url.params.fromURL(links[i].href);
        revised[funnelytics.cookie] = funnelytics.session;
        revised = funnelytics.url.params.toString(revised);
        if(funnelytics.url.params.regex.test(links[i].href)) {
          links[i].href = links[i].href.replace(/\?{1}.*/, revised);
        } else {
          links[i].href = links[i].href + revised;
        }
      }
    }
  }
};
