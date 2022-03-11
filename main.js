const WebTorrent = require('webtorrent');
const path = require('path');
const { pipeline } = require('stream/promises');
const Zip = require('jszip');

const client = new WebTorrent();

const PATTERN = new RegExp(process.argv[2], 'gi');
const url = process.argv[3];

console.log('Grepping for', PATTERN);
console.log('url', url);

function sanitize(name) {
  return name.replace(/[^\p{L}\d,!\.\/\\\-_\s]+/gu, '');
}

async function processZip(name, source) {
  console.log('processing zip', name);

  const z = await Zip.loadAsync(source);

  for (const file in z.file(/./)) {
    if (/^\.zip$/.test(file.name)) {
      try {
        await processZip(path.join(name, file.name), file.nodeStream());
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

      console.log('found match', torrentFile.name, name, sanitize(slice));
    }
  }
}

async function grepFile(torrentFile) {
  console.log('downloading', torrentFile.name, torrentFile.size);
  const z = await Zip.loadAsync(torrentFile.createReadStream());

  await processZip(z);
}

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
