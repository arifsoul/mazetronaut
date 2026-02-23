const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Menghilangkan batasan CORS
app.use(cors());

// Melayani file statis dari folder project
app.use(express.static(path.join(__dirname, './')));

app.listen(PORT, () => {
    console.log('====================================');
    console.log(`🚀 Server Anti-CORS aktif!`);
    console.log(`🔗 Link: http://localhost:${PORT}`);
    console.log('====================================');
    console.log('Tekan Ctrl+C untuk mematikan server.');
});
