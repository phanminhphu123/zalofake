const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')

function sendEmail(toEmail) {
  try {
    const token = jwt.sign({ email: toEmail }, 'concavang', {
      expiresIn: '1d',
    });
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: 'taito1doraemon@gmail.com',
        pass: 'jmsqgsjqqopsfakz',
      },
    });
    const mailOptions = {
      from: 'taito1doraemon@gmail.com',
      to: toEmail,
      subject: 'nhinguyenmc',
      text: `Tài khoản chat vừa đăng ký email này tại trang web ZaloFake chúng tôi. Nhấp vào đường link sau để xác thực tài khoản: http://localhost:3000/verify?token=${token}. Link sẽ bị vô hiệu sau 60 phút.`,
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Lỗi gửi email:', error);
        return error.message;
        // return res.status(500).send('Có lỗi xảy ra khi gửi email xác thực.');
      } else {
        console.log('Email đã được gửi:', info.response);
        // return res.send('Email xác thực đã được gửi.');
        return 'Email sent';
      }
    })
    console.log(`Email was sent to ${toEmail}!`);
    return true;
  } catch (error) {
    return error.message;
  }
}

module.exports = sendEmail;