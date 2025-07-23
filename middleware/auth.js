const { oAuth2Client } = require('../config/googleDrive');

function requireAuth(req, res, next) {
  const token = req.cookies['access_token'];
  if (!token) {
    return res.status(401).json({ authenticated: false, error: '❌ Bạn chưa đăng nhập.' });
  }

  oAuth2Client.setCredentials({ access_token: token });
  next();
}

module.exports = requireAuth;