require('dotenv').config();
const AWS = require('aws-sdk');
const express = require('express');
const cors = require("cors");
const path = require('path');
const multer = require('multer');
const passport = require('passport')
const session = require('express-session')
const cookieParser = require('cookie-parser');
const sendEmail = require('./src/utils/sendEmail');
const jwt = require('jsonwebtoken');
const poolMysql = require('./src/utils/mysqldb');
const { authenticateToken } = require('./src/utils/oauthMiddleware');

// Configuration
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/public/views/');
app.use(cors());
app.use(
    session({
      secret: 'concavang',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser('concavang'));

// Aws Configuration
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    // endpoint: 'http://localhost:8000',
});
const s3 = new AWS.S3();
const bucketName = process.env.S3_BUCKET_NAME;

// Settings multer
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '');
    },
});
const upload = multer({
    storage,
    limits: {fileSize: 2000000}, // 2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});
function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;

    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if(extname && mimetype) {
        return cb(null, true);
    }
    return cb('Error: Image Only Pls!');
}

// Routings
app.get('/', async(req, res) => {
    try {
        if(req.session.user) {
            return res.redirect('/home');
        }
        return res.render('index.ejs');
    } catch (error) {
        console.error('Error retrieving data from DynamoDB:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/login', async (req, res) => {
    try {
        if(req.session.user) {
            return res.redirect('/home');
        }
        const { login_email, login_password } = req.body;
        console.log('login_email=', login_email);
        console.log('login_password=', login_password);

        poolMysql.getConnection(function (err, conn) {
            if (err) {
              console.error('error=', err);
            }
            conn.query('SELECT * FROM users WHERE email = ? AND password = ? LIMIT 1', [login_email, login_password], function (error, result) {
                console.log('result=', result);
                if(result.length <= 0) {
                    return res.status(500).send('Invalid email or password!');
                }
                const userData = result[0];
                const payload = { userId: userData.id, email: userData.email, fullname: userData.fullname, phone_number: userData.phone_number, gender: userData.gender, avatar: userData.avatar, birthday: userData.birthday };
                req.session.user = payload;
                const token = jwt.sign(payload, 'concavang', { expiresIn: '1d' });
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: true,
                    maxAge: 86400,
                    signed: true,
                });
                return res.redirect('/home');
            });
            poolMysql.releaseConnection(conn);
        });
    } catch (error) {
        console.error('error=', error);
        return res.status(500).send(error);
    }
});

app.get('/home', authenticateToken, (req, res) => {
    const payload = req.session.user;
    return res.render('home.ejs', { payload });
});

app.get('/logout', (req, res) => {
    req.session.user = '';
    req.session.destroy();
    res.clearCookie('token');
    return res.redirect('/');
});

app.post('/register', async(req, res) => {
    const email = req.body.register_email;

    if(!email) {
        return res.status(500).send('Invalid email or password!');
    }

    poolMysql.getConnection(function (err, conn) {
        if (err) {
          console.error('error=', err);
        }
        conn.query('SELECT * FROM users WHERE email = ?', [email], function (error, result) {
            if(result.length > 0) {
                return res.status(500).send('Account existed in database!')
            }
            const responseMessage = sendEmail(email);
            if(responseMessage !== true) {
                console.log('response=', responseMessage);
                return res.status(500).send(responseMessage);
            }
            return res.status(200).send(`Đã gởi email xác thực tài khoản. Vui lòng kiểm tra hộp thư điện tử ${email}`);
        });
        poolMysql.releaseConnection(conn);
    });
});

app.get('/verify', async (req, res) => {
    /**
     * case 01: cố tình bug url thiếu param token
     * case 02: catch token không hợp lệ
     *
     */
    const token = req.query.token
    if (!token) {
      return res.status(500).send('Có vẽ bạn đang vô tình / cố tình gặp phải sự cố này. Chúng tôi không biết chính xác mục đích của bạn là gì nhưng đây là trang xác thực tài khoản và đã xảy ra lỗi đối với bạn. Vui lòng bấm nút quay lại để trở về trang chủ!');
    }
    try {
      const payload = jwt.verify(token, 'concavang');
      console.log('payload=', payload);
      req.session.verifying = payload;
      return res.render('verifyPage', { payload });
    } catch (error) {
      console.error('Lỗi khi xác thực token:', error);
      return res.status(500).send('Phiên xác thực hết hạn hoặc không hợp lệ.');
    }
});

app.post('/verify', upload.single('avatar'), async (req, res) => {
    const { fullname, birthday, gender, password, avatar } = req.body;
    
    const session = req.session.verifying;
    if(!session) {
        return res.status(500).send('Invalid or expired session verifying!');
    }

    try {
        const email = session.email;
        const image = req.file.originalname.split('.');
        const fileType = image[image.length-1];
        const filePath = `${email + '_' + Date.now().toString()}.${fileType}`;

        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }
        s3.upload(paramsS3, async (err, data) => {
            if(err) {
                console.error('error=', err);
                return res.send('Internal server error!');
            } else {
                const imageUrl = data.Location;
                console.log('imageUrl=', imageUrl);


                
                const sql = `INSERT INTO users (email, fullname, gender, password, avatar, birthday) VALUES (?, ?, ?, ?, ?, ?)`;
                poolMysql.getConnection(function (err, conn) {
                    if (err) {
                        console.error('error=', err);
                        return res.status(500).send(err);
                    }
                    conn.query(sql, [email, fullname, gender === 'male' ? 1 : 0, password, imageUrl, birthday ], function (error, result) {
                        poolMysql.releaseConnection(conn);
                        if(error) {
                            return res.status(500).send(error);
                        }
                        const userId = result.insertId;
                        const payload = { userId, email, fullname, phone_number: '', gender, avatar: imageUrl, birthday };
                        req.session.user = payload;
                        const token = jwt.sign(payload, 'concavang', { expiresIn: '1d' });
                        res.cookie('token', token, {
                            httpOnly: true,
                            secure: true,
                            maxAge: 86400,
                            signed: true,
                        });
                        // console.log('payload=', payload);
                        return res.redirect('/home');
                    });
                });
            }
        });
    } catch (error) {
        console.error('error=', error);
    }
});

// Running
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
