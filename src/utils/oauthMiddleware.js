const poolMysql = require("./mysqldb");
const jwt = require('jsonwebtoken');
async function authenticateToken(req, res, next) {
    /**
     * 01. kiểm tra coi có payload user trong req.session hay chưa. Nếu có thì đã login rồi -> pass nex();
     * 02. nếu không có payload thì kiểm tra cookie.
     */
    if (req.session.user) {
      return next();
    }

    try {
      const token = req.signedCookies.token;
      const payload = jwt.verify(token, 'concavang');
      const userId = payload.userId;
      const getUserSql = 'SELECT * FROM users WHERE id = ? LIMIT 1';
      poolMysql.getConnection(function (err, conn) {
        if (err) {
          console.error('error=', err)
        }
        conn.query(getUserSql, [userId], function (error, result) {
          console.log('authenticateToken result=', result);
          if(result.length <= 0) {
            return res.redirect('/');
          }
          return next();
        });
        poolMysql.releaseConnection(conn);
      });
    } catch (error) {
      console.error('authenticateToken error=', error);
      res.clearCookie('token');
      return res.redirect('/');
    //   return res.status(500).send('Lỗi tài khoản đăng nhập');
    }
}

module.exports = { authenticateToken };