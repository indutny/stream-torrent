const WebTorrent = require('webtorrent');
const { pipeline } = require('stream/promises');
const { Zip } = require('./zip');

const client = new WebTorrent();

const PATTERN = new RegExp(process.argv[2], 'gi');
const url = process.argv[3];

console.log('Grepping for', PATTERN);
console.log('url', url);

function sanitize(name) {
  return name.replace(/[^\p{L}\d,!\.\/\\\-_\s]+/gu, '');
}

async function grepFile(torrentFile) {
  const z = new Zip();

  z.on('file', async (file) => {
    let name = '';
    file.on('header', header => name = sanitize(header.name));

    try {
      let chunks = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString();
      console.error('downloaded', torrentFile.name, name, content.length);

      const matches = content.matchAll(PATTERN);
      for (const { index } of matches) {
        const slice = content.slice(index - 64, index + 64);

        console.log('found match', torrentFile.name, name, sanitize(slice));
      }
    } catch (error) {
      console.error('error', torrentFile.name, name, error);
    }
  });

  await pipeline(
    torrentFile.createReadStream(),
    z
  );
}

client.add(url, async (torrent) => {
  const zipFiles = torrent.files.filter(f => f.name.endsWith('.zip'));
  console.log('got torrent', zipFiles.map(f => f.name));

  for (const file of zipFiles) {
    try {
      await grepFile(file);
    } catch (error) {
      console.error('global error', error);
    }
  }

  client.close();
});
