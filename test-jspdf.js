const { jsPDF } = require("jspdf");
try {
    const doc = new jsPDF();
    doc.text("Hello world!", 10, 10);
    const buf = doc.output('arraybuffer');
    console.log("jsPDF success, size:", buf.byteLength);
} catch (e) {
    console.error(e);
}
