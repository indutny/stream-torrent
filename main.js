const WebTorrent = require('webtorrent');
const path = require('path');
const { pipeline } = require('stream/promises');
const Zip = require('jszip');

const PATTERN = new RegExp(process.argv[2], 'gi');
const url = process.argv[3];

console.log('Grepping for', PATTERN);
console.log('url', url);

function sanitize(name) {
  return name.replace(/[^\p{L}\d,!\.\/\\\-_\s]+/gu, '');
}

async function processZip(name, source) {
  console.log('processing %s', name);

  const chunks = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }

  const total = Buffer.concat(chunks);
  console.log('downloaded %d of %s', total.length, name);

  const z = await Zip.loadAsync(total);

  for (const file of z.file(/./)) {
    const fullPath = path.join(name, file.name);
    if (/^\.zip$/.test(file.name)) {
      try {
        await processZip(fullPath, file.nodeStream());
      } catch (error) {
        console.error(name, error);
      }
      continue;
    }

    if (/^\.(png|jpg|jpeg|exe)$/.test(file.name)) {
      continue;
    }

    let content = await file.async('nodebuffer');
    content = content.toString()
    const matches = content.matchAll(PATTERN);
    for (const { index } of matches) {
      const slice = content.slice(index - 64, index + 64);

      console.log('found match', fullPath, sanitize(slice));
    }
  }
}

async function grepFile(torrentFile) {
  console.log('downloading', torrentFile.name, torrentFile.length);
  const z = await Zip.loadAsync(torrentFile.createReadStream());

  await processZip(torrentFile.name, z);
}

const client = new WebTorrent();

client.add(url, async (torrent) => {
  const zipFiles = torrent.files.filter(f => f.name.endsWith('.zip'));
  console.log('got torrent', zipFiles.length);

  for (const file of zipFiles) {
    try {
      await grepFile(file);
    } catch (error) {
      console.error('global error', error.message);
    }
  }

  client.close();
});
