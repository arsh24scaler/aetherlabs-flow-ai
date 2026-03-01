import pdfParse from 'pdf-parse';

async function main() {
    const parseFunc = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default;
    console.log("Resolved function:", typeof parseFunc);
}
main();
