const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const folderId = process.env.FOLDERID;

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.SEVER_URL}/auth/oauth2callback`
);

module.exports = { SCOPES, folderId, oAuth2Client };