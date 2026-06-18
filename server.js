require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',         require('./backend/routes/auth'));
app.use('/api/agents',       require('./backend/routes/agents'));
app.use('/api/flows',        require('./backend/routes/flows'));
app.use('/api/dispositions', require('./backend/routes/dispositions'));
app.use('/api/campaigns',    require('./backend/routes/campaigns'));
app.use('/api/calls',        require('./backend/routes/calls'));
app.use('/api/ivr',          require('./backend/routes/ivr'));
app.use('/api/telephony',    require('./backend/routes/telephony'));
app.use('/api/reports',      require('./backend/routes/reports'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.2' }));

app.use(express.static(path.join(__dirname, 'frontend/public')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'frontend/public/index.html')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`SMAI V2 running on :${PORT}`));
