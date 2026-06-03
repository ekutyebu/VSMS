const https = require('https');

const options = {
  hostname: 'vsms-6z4c.onrender.com',
  port: 443,
  path: '/api/vitals',
  method: 'GET'
};

console.log('Sending request to', options.hostname);
const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.end();
