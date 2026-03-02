const mongoose = require('mongoose');

// Adjust require paths to match local files
async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const reportSchema = new mongoose.Schema({
        jobId: String,
        status: String,
        metadataJSON: Object,
        createdAt: Date
    });
    const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
    
    // find completed
    const r = await Report.findOne({ status: 'COMPLETED' });
    console.log(JSON.stringify(r.metadataJSON, null, 2));
    process.exit(0);
}
main().catch(console.error);
