import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/** One writer; authenticated encryption; fsync before acknowledging custody of any proofs. */
export class Store {
  constructor(path, key) {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('QUEUE_KEY must be 32 bytes of hex');
    this.path = path;
    this.key = Buffer.from(key, 'hex');
    this.pending = Promise.resolve();
  }
  async load(initial) {
    try {
      const { iv, tag, ct } = JSON.parse(await readFile(this.path, 'utf8'));
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
      d.setAuthTag(Buffer.from(tag, 'hex'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString());
    } catch (e) {
      if (e.code === 'ENOENT') return initial;
      throw new Error('queue vault cannot be opened; restore its key and backup');
    }
  }
  save(data) {
    const plain = JSON.stringify(data);
    const job = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', this.key, iv);
      const ct = Buffer.concat([c.update(plain), c.final()]);
      const body = JSON.stringify({ iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), ct: ct.toString('hex') });
      const tmp = this.path + '.tmp';
      const f = await open(tmp, 'w', 0o600);
      try { await f.writeFile(body); await f.sync(); } finally { await f.close(); }
      await rename(tmp, this.path);
      const dir = await open(dirname(this.path), 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    });
    this.pending = job.catch(() => {});
    return job;
  }
}
