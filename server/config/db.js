const mongoose = require('mongoose');
const { assertMongoConfiguration } = require('../security/mongoConfiguration');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    assertMongoConfiguration(uri);
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed; check the URI and network configuration.');
    throw error;
  }
};

module.exports = connectDB;
