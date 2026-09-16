import test from 'node:test';
import assert from 'node:assert/strict';
import { planReservations, calendarEvents, assertScheduleAvailable } from './schedule-calendar.mjs';
import { retirementUpdates } from '../tools/retire-deleted-schedules.mjs';
import { buildProductionReview } from './production-review.mjs';
import { weekKey } from './growth-policy.mjs';
const now = Date.parse('2030-01-01T00:00:00Z');
const draft = (id,song,batch='INTAKE-A') => ({short_id:id,source_song:song,batch_id:batch,status:'BATCH_READY',schedule_eligible:'YES'});
const plan = (rows,extra={}) => planReservations({rows,batchId:'INTAKE-ALL',startDate:'2030-01-07',slots:['20:00'],cadence:'four-per-week',postsPerDay:1,now,...extra});
test('growth reservations limit all batches to four weekly, one daily, seven-day song spacing and two weeks',()=>{
 const rows=Array.from({length:30},(_,i)=>draft('S'+i,'Song '+i%5,'INTAKE-'+i%3));
 const result=plan(rows);assert.equal(result.updates.length,8);assert.equal(result.deferred.length,22);
 const dates=result.updates.map(r=>r.scheduled_date);assert.equal(new Set(dates).size,8);assert.ok(dates.every(d=>d<'2030-01-21'));
 for(const w of new Set(dates.map(weekKey)))assert.equal(dates.filter(d=>weekKey(d)===w).length,4);
 const committed=rows.map(r=>({...r,...result.updates.find(u=>u.short_id===r.short_id)}));
 for(const u of result.updates)assert.doesNotThrow(()=>assertScheduleAvailable(committed,committed.find(r=>r.short_id===u.short_id),{},now));
});
test('new original arrivals fill open dates without moving reservations or exceeding weekly limits',()=>{
 const first=plan([draft('A','Cover')]);assert.equal(first.updates.length,1);
 const old={...draft('A','Cover'),...first.updates[0]};
 const incoming={...draft('B','Original','INTAKE-B'),content_type:'ORIGINAL'};
 const rows=[old,draft('C','Another cover'),incoming,draft('D','Cover','INTAKE-C')];
 const result=plan(rows);assert.equal(result.updates[0].short_id,'B');assert.ok(!result.updates.some(u=>u.short_id==='A'));
 const next=result.updates.find(u=>u.short_id==='D');assert.ok(Date.parse(next.scheduled_date)-Date.parse(old.scheduled_date)>=7*86400000);
});
test('unknown songs and unresolved rows never consume dates; manual posts use daily and weekly capacity',()=>{
 const rows=[draft('A',''),{...draft('B','Blocked'),duplicate_disposition:'UNRESOLVED'},draft('C','Valid')];
 const snapshot={videos:[{id:'manual',snippet:{},status:{privacyStatus:'private',publishAt:'2030-01-07T14:30:00Z'}}]};
 const result=plan(rows,{snapshot});assert.equal(result.updates.length,1);assert.equal(result.updates[0].scheduled_date,'2030-01-09');
 assert.deepEqual(result.deferred,[{short_id:'A',reason:'SONG_IDENTITY_REQUIRED'}]);
});
test('retired future rows stay historical and cannot reappear through a stale YouTube snapshot or production review',()=>{
 const row={...draft('OLD','Old','BULK_01'),status:'SCHEDULED',youtube_video_id:'gone',scheduled_date:'2030-01-09',scheduled_time:'20:00'};
 const updates=retirementUpdates([row,{...row,short_id:'TODAY',scheduled_date:'2030-01-07'},{...row,short_id:'UNRESOLVED',duplicate_disposition:'UNRESOLVED'}],'2030-01-07','2030-01-07T01:00:00Z');
 assert.equal(updates.length,1);const retired={...row,...updates[0]};
 assert.equal(retired.youtube_video_id,'gone');assert.equal(retired.schedule_eligible,'NO');
 assert.deepEqual(calendarEvents([retired],{videos:[{id:'gone',status:{privacyStatus:'private',publishAt:'2030-01-09T09:30:00Z'}}]}),[]);
 assert.equal(buildProductionReview({rows:[retired],batchId:'BULK_01'}).plannedOperationCount,0);
});
test('production catches seven-day cooldown violations, including a future reservation',()=>{
 const row={...draft('A','Same'),schedule_policy:'four-per-week',scheduled_date:'2030-01-07',scheduled_time:'20:00'};
 const other={...draft('B',' same '),scheduled_date:'2030-01-09',scheduled_time:'20:00'};
 assert.throws(()=>assertScheduleAvailable([row,other],row,{},now),/COOLDOWN/);
 assert.throws(()=>plan([draft('A','Song')],{slots:['20:00','22:30']}),/ONE_DAILY_SLOT/);
});

test('8 PM default publishes at noon UTC and does not add a 10 PM slot',()=>{
 const result=planReservations({rows:[draft('A','Cover')],batchId:'INTAKE-ALL',startDate:'2030-01-07',cadence:'four-per-week',now});
 assert.deepEqual(result.slots,['20:00']);assert.equal(result.updates[0].scheduled_time,'20:00');
 const row={...draft('A','Cover'),...result.updates[0]};
 assert.equal(calendarEvents([row])[0].at,'2030-01-07T12:00:00.000Z');
 assert.doesNotThrow(()=>assertScheduleAvailable([row],row,{},now));
 assert.throws(()=>plan([draft('A','Cover')],{slots:['20:01']}),/PROTECTED/);
});
