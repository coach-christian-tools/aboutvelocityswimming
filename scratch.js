const https = require('https');
const options = {
  hostname: 'api.printful.com',
  path: '/store/products',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`
  }
};
const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
});
req.on('error', error => console.error(error));
req.end();
