const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('node:path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');

const evaluationRoutes = require('./routes/evaluation');
const eventRoutes = require('./routes/events');
const teamRoutes = require('./routes/teams');
const judgeRoutes = require('./routes/judges');
const announcementRoutes = require('./routes/announcements');
const resultReportRoutes = require('./routes/resultReports');
const authRoutes = require('./routes/auth');
const emailDeliveryRoutes = require('./routes/emailDeliveries');
const { assertProductionConfiguration, securityHeaders } = require('./security/configuration');

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

assertProductionConfiguration();

const allowedOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, credentials: true }));
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use('/api', authRoutes);
app.use('/api', emailDeliveryRoutes);
app.use('/api', eventRoutes);
app.use('/api', teamRoutes);
app.use('/api', judgeRoutes);
app.use('/api', announcementRoutes);
app.use('/api', resultReportRoutes);
app.use('/api', evaluationRoutes);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'ScoreFlow API is running',
  });
});

app.get('/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({ success: connected, database: connected ? 'connected' : 'unavailable' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`ScoreFlow server listening on port ${PORT}`);
  });
}

startServer().catch(() => {
  console.error('ScoreFlow API failed to start because its database is unavailable.');
  process.exit(1);
});
