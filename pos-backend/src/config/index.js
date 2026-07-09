require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5001,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pos_mvp',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
};
