// TizenBrew service module for "TV Home".
//
// This runs inside TizenBrew's Node.js service sandbox, which DOES expose the
// `tizen` Device API (with the application.launch privilege). The module's web
// page (index.html) is served over localhost and has NO `tizen`, so it calls
// this tiny HTTP server to launch native apps and to list what's installed.
//
// Kept ES5-ish on purpose (the service runtime can be an old Node).
(function () {
  'use strict';
  var http = require('http');
  var url = require('url');
  var PORT = 8099; // avoid TizenBrew's 8081

  function send(res, status, bodyObj) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(bodyObj));
  }

  function readBody(req) {
    return new Promise(function (resolve) {
      var data = '';
      req.on('data', function (c) { data += c; });
      req.on('end', function () {
        try { resolve(JSON.parse(data || '{}')); }
        catch (e) { resolve({}); }
      });
    });
  }

  function onRequest(req, res) {
    var parsed = url.parse(req.url, true);
    var path = parsed.pathname;

    if (req.method === 'OPTIONS') { return send(res, 204, {}); }

    // health check
    if (req.method === 'GET' && path === '/api/ping') {
      return send(res, 200, { ok: true });
    }

    // list installed apps (exact ids + names for this TV)
    if (req.method === 'GET' && path === '/api/apps') {
      try {
        return tizen.application.getAppsInfo(
          function (infos) {
            var apps = [];
            for (var i = 0; i < infos.length; i++) {
              apps.push({ id: infos[i].id, name: infos[i].name });
            }
            send(res, 200, { apps: apps });
          },
          function (e) { send(res, 500, { error: String(e) }); }
        );
      } catch (e) { return send(res, 500, { error: String(e) }); }
    }

    // return to the TV's native home screen by exiting the launcher app
    if (req.method === 'POST' && path === '/api/home') {
      send(res, 200, { ok: true });
      setTimeout(function () {
        try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
      }, 150); // let the HTTP response flush before we exit
      return;
    }

    // launch a native app by id
    if (req.method === 'POST' && path === '/api/launch') {
      return readBody(req).then(function (b) {
        var id = String(b.id || '');
        if (!id) { return send(res, 400, { error: 'missing id' }); }
        try {
          tizen.application.launch(
            id,
            function () { send(res, 200, { ok: true }); },
            function (e) { send(res, 500, { error: String(e) }); }
          );
        } catch (e) { send(res, 500, { error: String(e) }); }
      });
    }

    send(res, 404, { error: 'not found' });
  }

  try {
    http.createServer(onRequest).listen(PORT, '127.0.0.1');
  } catch (e) {
    // If the server can't start, the page falls back to a toast message.
  }
})();
