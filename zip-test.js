const { createReadStream } = require('fs');
const { pipeline } = require('stream/promises');
const { Zip } = require('./zip');

function sanitize(name) {
  return name.replace(/[^\p{L}]+/gu, '');
}

async function main(input) {
  const z = new Zip();

  z.on('file', (stream) => {
    let name;
    stream.on('header', header => name = sanitize(header.name));
    stream.on('data', data => console.log(JSON.stringify(name), data));
    stream.on('end', () => console.log(JSON.stringify(name), 'end'));
    stream.on('error', err => {});
  });

  await pipeline(
    createReadStream(input),
    z
  );
}

main(process.argv[2]);
