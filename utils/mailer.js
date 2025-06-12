const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.emailarray.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"Efortech Edu" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendEmail };
