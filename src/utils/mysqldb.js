const mysql = require('mysql2');
// const mysql = require('mysql2/promise');
require('dotenv').config();

const poolMysql = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'zalofake',
  password: '',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
})

poolMysql.getConnection(function (err, conn) {
  if (err) {
    console.error('error=', err);
  }
  conn.query('SELECT NOW() as currentTime', function (error, result) {
    console.log('Kết nối thành công vào MySQL, thời gian hiện tại:', result[0].currentTime);
  });
  poolMysql.releaseConnection(conn);
});

module.exports = poolMysql