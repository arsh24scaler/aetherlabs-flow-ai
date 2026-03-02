const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = require('./src/lib/db');
  const report = await db.Report.findOne().sort({ createdAt: -1 });
  console.log(JSON.stringify(report.metadataJSON?.suggestedQuestions, null, 2));
  process.exit(0);
}
check().catch(console.error);
