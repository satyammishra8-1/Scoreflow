const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

const evaluationRoutes = require('./routes/evaluation');
const eventRoutes = require('./routes/events');

dotenv.config();

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use('/api', eventRoutes);
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