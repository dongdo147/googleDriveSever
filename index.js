const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const filesRouter = require('./routes/files');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.URL_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Routes
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/files', filesRouter);

// Khởi chạy server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Server đang chạy tại http://localhost:${port}`);
});

module.exports = app;