import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CashOutQueue, intentMessage } from './queue.mjs';
import { Store } from './store.mjs';
import { getPubKeyFromPrivKey, schnorrSignMessage } from '@cashu/cashu-ts';
import { createHash } from 'node:crypto';

const memory = (initial) => ({ value: initial, async load(v) { return this.value || v; }, async save(v) { this.value = JSON.parse(JSON.stringify(v)); } });
const key = new Uint8Array(32); key[31] = 9;
function intent() {
 const i = { id: 'ab'.repeat(16), amount: '100', destination: 'demo:world', created_at: Date.now(), pubkey: Buffer.from(getPubKeyFromPrivKey(key)).toString('hex').slice(2) };
 i.signature = schnorrSignMessage(intentMessage(i), key);
 return i;
}
const job = (extra = {}) => ({ id:'ab'.repeat(16), amount:'100', destination:'demo:world', state:'PAYING', attempts:0, next_at:0,
 proofs:[], change:[], paymentProofs:[{amount:'100'}], quote:{ quote:'q-1', amount:'97', fee_reserve:'3', expiry:Math.floor(Date.now()/1000)+3600 }, ...extra });
async function queue(jobs, methods = {}) {
 const store = memory({v:1,seed:'aa'.repeat(64),counters:{},jobs});
 const q = new CashOutQueue(store, 'http://mint', { walletFactory: () => ({ async loadMint(){}, ...methods }) });
 await q.init(); return q;
}

test('queue vault is encrypted, durable across restart, and refuses tampering or a wrong key', async () => {
 const dir = await mkdtemp(join(tmpdir(),'coupure-queue-'));
 try {
  const path=join(dir,'vault.json'), key='11'.repeat(32), store=new Store(path,key);
  assert.deepEqual(await store.load({empty:true}),{empty:true});
  await store.save({token:'cashuB-secret',seed:'sensitive-seed'});
  const raw=await readFile(path,'utf8'); assert.ok(!raw.includes('cashuB-secret') && !raw.includes('sensitive-seed'));
  assert.equal((await new Store(path,key).load({})).token,'cashuB-secret');
  await assert.rejects(new Store(path,'22'.repeat(32)).load({}));
  const data=JSON.parse(raw);data.ct='ff'+data.ct.slice(2);await writeFile(path,JSON.stringify(data));
  await assert.rejects(store.load({}));
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('lost paid response cannot create a second invoice, even after restart', async () => {
 let payments=0, invoices=0;
 const q=await queue([job()], { async checkMeltQuoteBolt11(){return {state:'PAID'};}, async meltProofsBolt11(){payments++;} });
 const summary=await q.drain(async()=>{invoices++;return 'invoice';});
 assert.equal(summary.settled,1);assert.equal(payments,0);assert.equal(invoices,0);
 const restarted=new CashOutQueue(q.store,'http://mint');await restarted.init();
 await restarted.drain(async()=>{invoices++;});assert.equal(invoices,0);
});

test('pending quote is never submitted twice', async()=>{
 let payments=0;
 const q=await queue([job()], {async checkMeltQuoteBolt11(){return {state:'PENDING'};}, async meltProofsBolt11(){payments++;}});
 await q.drain(async()=>{throw new Error('must not create invoice');});assert.equal(payments,0);assert.equal(q.summary().pending,1);
});

test('only PAID is settled; failed network calls back off without losing custody',async()=>{
 const q=await queue([job()],{async checkMeltQuoteBolt11(){throw new Error('cashuB secret');}});
 await q.drain(async()=> '');const j=q.data.jobs[0];
 assert.equal(j.state,'PAYING');assert.equal(j.attempts,1);assert.ok(j.next_at>Date.now());assert.equal(q.summary().held_sat,'100');
 assert.equal(j.error,'settlement_pending');
});

test('expired quotes require review and cannot silently issue another payment',async()=>{
 let submitted=0;
 const q=await queue([job()],{async checkMeltQuoteBolt11(){return {state:'UNPAID',expiry:0};},async meltProofsBolt11(){submitted++;}});
 await q.drain(async()=>{throw new Error('no new destination');});assert.equal(submitted,0);assert.equal(q.data.jobs[0].attempts,1);
});

test('exact signed requests are idempotent and altered requests are refused before touching the mint',async()=>{
 const i=intent(), token='cashuBexample';
 const digest=createHash('sha256').update(intentMessage(i)+token).digest('hex');
 const q=await queue([{...job({state:'QUEUED',quote:null}),...i,digest}]);
 assert.equal((await q.enqueue(i,token)).state,'QUEUED');
 await assert.rejects(q.enqueue({...i,destination:'lnbcrt-other'},token),/invalid signature/);
 await assert.rejects(q.enqueue(i,token+'x'),/idempotency conflict/);
 assert.equal(q.data.jobs.length,1);
});

test('routing reserve cannot exceed the signed maximum debit',async()=>{
 const q=await queue([job({state:'QUEUED',proofs:[{amount:'100'}],paymentProofs:undefined,quote:null})],{
  async createMeltQuoteBolt11(){return {amount:'99',fee_reserve:'2'};}
 });
 await q.drain(async()=> 'invoice');assert.equal(q.data.jobs[0].state,'QUEUED');assert.equal(q.summary().held_sat,'100');
});

test('change is released only to the signed owner and the same claim is replayable',async()=>{
 const i=intent();const C=Buffer.from(getPubKeyFromPrivKey(key)).toString('hex');
 const q=await queue([{...job({state:'SETTLED',paymentProofs:[],change:[{id:'00aabbccddee1122',amount:'2',secret:'change',C}]}),...i}]);
 const body={id:i.id,pubkey:i.pubkey,signature:schnorrSignMessage(JSON.stringify({v:1,id:i.id,action:'claim-change'}),key)};
 await assert.rejects(q.claimChange({...body,pubkey:'00'.repeat(32)},'http://box/mint'));
 const first=await q.claimChange(body,'http://box/mint');const second=await q.claimChange(body,'http://box/mint');
 assert.ok(first.token.startsWith('cashuB'));assert.equal(first.token,second.token);assert.equal(q.summary().held_sat,'0');
});
