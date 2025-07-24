const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs');
const { oAuth2Client, folderId } = require('../config/googleDrive');
const upload = require('../middleware/upload');
const requireAuth = require('../middleware/auth');

// Existing /upload route
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) return res.status(400).send('❌ Không có file nào được upload!');

  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    if (req.body.folderId && typeof req.body.folderId !== 'string') {
      return res.status(400).json({ error: 'Invalid folderId' });
    }
    const fileMetadata = {
      name: file.originalname,
      parents: [req.body.folderId || folderId],
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

    fs.unlinkSync(file.path);

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

// New route to create a folder
router.post('/create-folder', requireAuth, async (req, res) => {
  const { name, folderId: parentFolderId } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: '❌ Tên folder là bắt buộc và phải là chuỗi.' });
  }
  if (parentFolderId && typeof parentFolderId !== 'string') {
    return res.status(400).json({ error: '❌ folderId không hợp lệ.' });
  }

  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder', // MIME type for Google Drive folder
      parents: [parentFolderId || folderId], // Use provided folderId or default FOLDERID
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name',
    });

    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    res.status(200).json({
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
    });
  } catch (err) {
    console.error('❌ Lỗi khi tạo folder:', err);
    res.status(500).json({ error: '❌ Có lỗi khi tạo folder.' });
  }
});
router.get('/', requireAuth, async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const folderIdToUse = req.query.folderId || folderId;

    const result = await drive.files.list({
      q: `'${folderIdToUse}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, size)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    let files = result.data.files || [];

    const keyword = req.query.keyword?.toLowerCase() || '';
    const sortBy = req.query.sortBy || '';       // 'createdTime' | 'size'
    const sortOrder = req.query.sortOrder || ''; // 'asc' | 'desc'

  
    let folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
let regularFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

// Nếu có keyword, lọc tên folder luôn
if (keyword) {
  folders = folders.filter(f => f.name.toLowerCase().includes(keyword));
}


    // 2. Tìm kiếm cơ bản theo keyword (nếu có)
    if (keyword) {
      regularFiles = regularFiles
        .filter(f => f.name.toLowerCase().includes(keyword))
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aStarts = aName.startsWith(keyword) ? 1 : 0;
          const bStarts = bName.startsWith(keyword) ? 1 : 0;
          return bStarts - aStarts || aName.indexOf(keyword) - bName.indexOf(keyword);
        });
    }

   // 3. Sắp xếp nếu có yêu cầu
if (sortBy === 'createdTime') {
  const sortFn = (a, b) => {
    const timeA = new Date(a.createdTime).getTime();
    const timeB = new Date(b.createdTime).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  };
  folders.sort(sortFn);
  regularFiles.sort(sortFn);
} else if (sortBy === 'size') {
  // Size chỉ áp dụng cho file
  regularFiles.sort((a, b) => {
    const sizeA = parseInt(a.size || '0', 10);
    const sizeB = parseInt(b.size || '0', 10);
    return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
  });
}


    const finalFiles = [...folders, ...regularFiles];
    res.json({ files: finalFiles });
  } catch (err) {
    console.error('❌ Lỗi khi lấy danh sách file:', err);
    res.status(500).json({ error: '❌ Có lỗi xảy ra khi lấy danh sách file.' });
  }
});

// Existing /download/:id route
router.get('/download/:id', requireAuth, async (req, res) => {
  const fileId = req.params.id;

  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

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

// Existing /:id (delete) route
router.delete('/:id', requireAuth, async (req, res) => {
  const fileId = req.params.id;

  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    await drive.files.delete({
      fileId,
    });

    res.json({ success: true, message: '✅ File đã được xoá.' });
  } catch (err) {
    console.error('❌ Lỗi khi xoá file:', err);
    res.status(500).json({ error: '❌ Xoá file thất bại.' });
  }
});

module.exports = router;