'use strict';

const net = require('net');
const address = require('address');
const debug = require('debug')('detect-port');

module.exports = (port, callback) => {
  let hostname = '';

  // 初始化参数
  if (typeof port === 'object' && port) {
    hostname = port.hostname;
    callback = port.callback;
    port = port.port;
  } else {
    if (typeof port === 'function') {
      callback = port;
      port = null;
    }
  }

  port = parseInt(port) || 0;
  let maxPort = port + 10;
  if (maxPort > 65535) {
    maxPort = 65535;
  }
  debug('detect free port between [%s, %s)', port, maxPort);
  if (typeof callback === 'function') {
    // 用于探测 port 到 maxPort 之间的可用的端口号
    return tryListen(port, maxPort, hostname, callback);
  }
  // promise
  return new Promise(resolve => {
    tryListen(port, maxPort, hostname, (_, realPort) => {
      resolve(realPort);
    });
  });
};

// tryListen 函数会调用 listen 函数
function tryListen(port, maxPort, hostname, callback) {
  // 处理 error，先增加 port，如果大于 maxPort，则使用 0 来得到随机可用端口号
  function handleError() {
    port++;
    if (port >= maxPort) {
      debug('port: %s >= maxPort: %s, give up and use random port', port, maxPort);
      port = 0;
      maxPort = 0;
    }
    tryListen(port, maxPort, hostname, callback);
  }

  // use user hostname 使用 hostname
  if (hostname) {
    listen(port, hostname, (err, realPort) => {
      if (err) {
        if (err.code === 'EADDRNOTAVAIL') {
          return callback(new Error('the ip that is not unkonwn on the machine'));
        }
        return handleError();
      }

      callback(null, realPort);
    });
  } else {
    // 1. check null
    listen(port, null, (err, realPort) => {
      // ignore random listening 忽略随机端口监听
      if (port === 0) {
        return callback(err, realPort);
      }

      if (err) {
        return handleError(err);
      }

      // 2. check 0.0.0.0 拿到可用端口后检查该端口对应 hostname 为 '0.0.0.0'，'localhost'，ip 时是否都可以使用，否则调用 handleError 继续进行探测
      listen(port, '0.0.0.0', err => {
        if (err) {
          return handleError(err);
        }

        // 3. check localhost
        listen(port, 'localhost', err => {
          // if localhost refer to the ip that is not unkonwn on the machine, you will see the error EADDRNOTAVAIL
          // https://stackoverflow.com/questions/10809740/listen-eaddrnotavail-error-in-node-js
          if (err && err.code !== 'EADDRNOTAVAIL') {
            return handleError(err);
          }

          // 4. check current ip
          // os.networkInterfaces：返回一个对象，包含只有被赋予网络地址的网络接口；address 根据 os.networkInterfaces 返回值获取当前 ip 地址
          listen(port, address.ip(), (err, realPort) => {
            if (err) {
              return handleError(err);
            }

            callback(null, realPort);
          });
        });
      });
    });
  }
}

// 使用 net 模块建立连接来测试端口可用性；net.Server().listen(port) 函数在 port=0 可以随便分配一个可用的端口
function listen(port, hostname, callback) {
  const server = new net.Server();

  server.on('error', err => {
    debug('listen %s:%s error: %s', hostname, port, err);
    server.close();
    // 忽略 "ENOTFOUND" 报错，表示端口仍然可用
    if (err.code === 'ENOTFOUND') {
      debug('ignore dns ENOTFOUND error, get free %s:%s', hostname, port);
      return callback(null, port);
    }
    return callback(err);
  });

  server.listen(port, hostname, () => {
    // server.address()：{ port: 12346, family: 'IPv4', address: '127.0.0.1' }
    port = server.address().port;
    server.close();
    debug('get free %s:%s', hostname, port);
    return callback(null, port);
  });
}
