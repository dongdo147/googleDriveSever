const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const multer = require('multer');

const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.URL_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
const port = process.env.PORT;
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const folderId = process.env.FOLDERID;
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.SEVER_URL}/oauth2callback`
);
app.use((req, res, next) => {
  const accessToken = req.cookies['access_token'];
  if (accessToken) {
    oAuth2Client.setCredentials({ access_token: accessToken });
  }
  next();
});
app.use((err, req, res, next) => {
  console.error('❗ Middleware error:', err);

  if (err && err.message && (
    err.message.includes('invalid_grant') ||
    err.message.includes('Invalid Credentials'))
  ) {
    res.clearCookie('access_token');
    return res.status(401).json({ error: '❌ Token hết hạn. Vui lòng đăng nhập lại.' });
  }

  next(err);
});

app.get('/', (req, res) => {
  res.json({ message: "hello" });
});

// Bước 1: Điều hướng người dùng đến link ủy quyền
app.get('/login', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

// Bước 2: Google redirect về đây với mã `code`
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send('Không có mã xác thực!');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    res.cookie('access_token', tokens.access_token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',       // 🔐 Chỉ gửi qua HTTPS
  sameSite: 'Lax',    // hoặc 'Strict' nếu muốn cứng hơn
  maxAge: 3600 * 1000 // optional: 1 tiếng
});
res.send(`
  <html>
    <body>
      <script>
        setTimeout(() => {
          window.location.href = "${process.env.URL_ORIGIN}/oauth2callback";
        }, 1000);
      </script>
      <p>✅ Đăng nhập thành công. Đang chuyển hướng...</p>
    </body>
  </html>
`);


  } catch (err) {
    console.error('❌ Lỗi khi lấy token:', err);
    res.status(500).send('Lỗi khi xử lý mã code.');
  }
});
app.get('/me', (req, res) => {
  const token = req.cookies['access_token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  // Tùy logic bạn, có thể verify token ở đây
  res.json({ authenticated: true, token });
});
app.post('/upload', upload.single('file'), async (req, res) => {
   const token = req.cookies['access_token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  const file = req.file;

  if (!file) return res.status(400).send('❌ Không có file nào được upload!');

  try {
    const auth = oAuth2Client;
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: file.originalname,
      parents: [folderId],
    };

    const media = {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.path),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name',
    });

    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    fs.unlinkSync(file.path); // Xoá file local sau khi upload

    res.status(200).json({
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
    });
  } catch (err) {
    console.error('❌ Upload lỗi:', err);
    res.status(500).send('❌ Có lỗi khi upload file.');
  }
});
app.get('/files', async (req, res) => {
   const token = req.cookies['access_token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  try {

    const auth = oAuth2Client;
    const drive = google.drive({ version: 'v3', auth });

    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = result.data.files || [];

    res.json({ files }); // 👈 Trả JSON thay vì HTML
  } catch (err) {
    console.error('❌ Lỗi khi lấy danh sách file:', err);
    res.status(500).json({ error: '❌ Có lỗi xảy ra khi lấy danh sách file.' });
  }
});

app.get('/download/:id', async (req, res) => {
   const token = req.cookies['access_token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  const fileId = req.params.id;



  const auth = oAuth2Client;
  const drive = google.drive({ version: 'v3', auth });

  try {
    const fileInfo = await drive.files.get({
      fileId,
      fields: 'name',
    });

    const fileName = fileInfo.data.name;

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    response.data
      .on('end', () => {
        console.log(`✅ Tải xong: ${fileName}`);
      })
      .on('error', (err) => {
        console.error('❌ Lỗi khi tải file:', err);
        res.status(500).send('❌ Lỗi khi tải file.');
      })
      .pipe(res);
  } catch (err) {
    console.error('❌ Lỗi khi xử lý file tải về:', err);
    res.status(500).send('❌ Không thể tải file này.');
  }
});
app.delete('/files/:id', async (req, res) => {
   const token = req.cookies['access_token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  const fileId = req.params.id;


  try {
    const auth = oAuth2Client;
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.delete({
      fileId,
    });

    res.json({ success: true, message: '✅ File đã được xoá.' });
  } catch (err) {
    console.error('❌ Lỗi khi xoá file:', err);
    res.status(500).json({ error: '❌ Xoá file thất bại.' });
  }
});

// Khởi chạy server
app.listen(port, () => {
  console.log(`🌐 Server đang chạy tại http://localhost:${port}`);
  console.log('📤 Truy cập để bắt đầu xác thực với Google Drive');
});
module.exports = app;
