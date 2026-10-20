const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.join(__dirname, '.env') });

const brevoApiKey = process.env.BREVO_API_KEY || '';
if (process.env.NODE_ENV !== 'production') {
  console.info('Brevo API key diagnostic:', {
    loaded: Boolean(brevoApiKey),
    length: brevoApiKey.length,
    surroundingWhitespace: brevoApiKey !== brevoApiKey.trim(),
    startsWithQuote: brevoApiKey.startsWith('"') || brevoApiKey.startsWith("'"),
    appearsToBeSmtpKey: brevoApiKey.startsWith('xsmtpsib-'),
  });
}

const connectDB = require('./config/db');

const evaluationRoutes = require('./routes/evaluation');
const eventRoutes = require('./routes/events');
const teamRoutes = require('./routes/teams');
const judgeRoutes = require('./routes/judges');
const announcementRoutes = require('./routes/announcements');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use('/api', eventRoutes);
app.use('/api', teamRoutes);
app.use('/api', judgeRoutes);
app.use('/api', announcementRoutes);
app.use('/api', evaluationRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ScoreFlow API is running',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`ScoreFlow server running on http://localhost:${PORT}`);
});
