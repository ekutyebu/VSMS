const dns = require('dns');

const hostInternal = 'dpg-d8ffk6d9j78s73871pug-a.oregon-postgres.render.com';
const hostExternal = 'dpg-d8ffk6d9j78s73871pug.oregon-postgres.render.com';

console.log('Resolving internal host:', hostInternal);
dns.lookup(hostInternal, (err, address, family) => {
  if (err) {
    console.error('Internal host resolution failed:', err.message);
  } else {
    console.log('Internal host resolved to:', address);
  }
});

console.log('Resolving external host:', hostExternal);
dns.lookup(hostExternal, (err, address, family) => {
  if (err) {
    console.error('External host resolution failed:', err.message);
  } else {
    console.log('External host resolved to:', address);
  }
});
