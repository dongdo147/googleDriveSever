const express = require('express');
const router = express.Router();
const { oAuth2Client, SCOPES } = require('../config/googleDrive');

router.get('/login', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

router.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send('Không có mã xác thực!');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.SAMESITE || 'Lax',
      maxAge: 3600 * 1000, // 1 tiếng
    });
    res.redirect(`${process.env.URL_ORIGIN}/oauth2callback`);
  } catch (err) {
    console.error('❌ Lỗi khi lấy token:', err);
    res.status(500).send('Lỗi khi xử lý mã code.');
  }
});

router.get('/me', (req, res) => {
  const token = req.cookies['access_token'];
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, token });
});

module.exports = router;