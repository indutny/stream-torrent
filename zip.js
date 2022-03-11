const { Writable } = require('stream');
const { InflateRaw } = require('zlib');
const StreamSearch = require('streamsearch');

const FILE_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DIRECTORY_MAGIC = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

const HEADER_SIZE = 26;

class File extends InflateRaw {
  constructor(search) {
    super();

    this.search = search;
    this.search.reset();

    this.header = undefined;

    this.state = 'header';
    this.bytesNeeded = HEADER_SIZE;

    this.buffer = [];
    this.bufferSize = 0;
  }

  _transform(data, enc, callback) {
    let buf = Buffer.from(data, enc);
    const validBytes = this.search.push(buf);
    if (validBytes !== buf.length) {
      buf = buf.slice(0, validBytes);
    }

    this.buffer.push(buf);
    this.bufferSize += buf.length;

    const transform = [];
    while (this.bufferSize >= this.bytesNeeded) {
      const chunk = Buffer.concat(this.buffer, this.bufferSize);

      let used;
      if (this.state === 'header') {
        used = this.handleHeader(chunk);
      } else if (this.state === 'extra') {
        used = this.handleExtra(chunk);
      } else if (this.state === 'contents') {
        transform.push(chunk);
        used = chunk.length;
      } else if (this.state === 'ignore') {
        used = chunk.length;
      } else {
        throw new Error(`Unexpected state: ${this.state}`);
      }

      if (used === chunk.length) {
        this.buffer = [];
      } else {
        this.buffer = [chunk.slice(used)];
      }
      this.bufferSize = Math.max(0, chunk.length - used);
    }

    super._transform(Buffer.concat(transform), 'buffer', callback);
  }

  handleHeader(buffer) {
    this.header = {
      name: undefined,
      extra: undefined,

      version: buffer.readUInt16LE(0),
      flags: buffer.readUInt16LE(2),
      compression: buffer.readUInt16LE(4),
      mtime: buffer.readUInt16LE(6),
      mdate: buffer.readUInt16LE(8),
      crc: buffer.readUInt32LE(10),
      compressedSize: buffer.readUInt32LE(14),
      uncompressedSize: buffer.readUInt32LE(18),
      nameLength: buffer.readUInt16LE(22),
      extraLength: buffer.readUInt16LE(24),
    };

    this.state = 'extra';
    this.bytesNeeded = this.header.nameLength + this.header.extraLength;

    return HEADER_SIZE;
  }

  handleExtra(buffer) {
    const usedSize = this.bytesNeeded;
    const name = buffer.slice(0, this.header.nameLength).toString();
    const rest = buffer.slice(this.header.nameLength, usedSize);

    const extra = new Map();
    let off = 0;
    while (off < rest.length) {
      const signature = rest.readUint16LE(off);
      off += 2;
      const size = rest.readUint16LE(off);
      off += 2;
      const data = rest.slice(off, off + size);
      off += size;

      extra.set(signature, data);
    }

    this.header.name = name;
    this.header.extra = extra;

    this.emit('header', this.header);

    this.state = 'contents';

    return usedSize;
  }
}

class Zip extends Writable {
  constructor() {
    super();

    this.search = new StreamSearch(
      FILE_MAGIC,
      (isMatch, data, start, end) => this.onMatch(isMatch, data, start, end)
    );

    this.dirSearch = new StreamSearch(DIRECTORY_MAGIC, () => {});
    this.dirSearch.maxMatches = 1;

    this.file = undefined;
  }

  _write(data, enc, callback) {
    const buf = Buffer.from(data, enc);

    this.search.push(buf);

    callback();
  }

  _final(callback) {
    this.file?.end();
    this.file = undefined;
    callback();
  }

  onMatch(isMatch, data, start, end) {
    if (isMatch) {
      this.file?.end();
      this.file = new File(this.dirSearch);
      this.emit('file', this.file);
    }

    if (data) {
      this.file?.write(data.slice(start, end));
    }
  }
}
exports.Zip = Zip;
