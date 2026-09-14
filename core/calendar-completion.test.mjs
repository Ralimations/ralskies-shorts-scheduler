import test from 'node:test';import assert from 'node:assert/strict';import {calendarEvents} from './schedule-calendar.mjs';
const row={short_id:'RS-1',youtube_video_id:'video1',status:'SCHEDULED',scheduled_date:'2027-01-01',scheduled_time:'17:30',verification_timestamp:'2026-12-20T00:00:00Z'};
test('completed videos use one observed event and never an obsolete reservation conflict',()=>{
 const snapshot={syncedAt:'2026-12-21T00:00:00Z',videos:[{id:'video1',snippet:{publishedAt:'2027-01-01T10:00:00Z'},status:{privacyStatus:'public'}}]};
 const events=calendarEvents([row],snapshot);assert.equal(events.length,1);assert.equal(events[0].state,'PUBLISHED');assert.equal(events[0].pht,'2027-01-01 18:00');
});
test('snapshots older than verified completion cannot resurrect a private draft or outdated time',()=>{
 const snapshot={syncedAt:'2026-12-19T00:00:00Z',videos:[{id:'video1',status:{privacyStatus:'private',publishAt:'2026-12-25T09:30:00Z'}}]};
 const events=calendarEvents([row],snapshot);assert.equal(events.length,1);assert.equal(events[0].state,'TRACKER_SCHEDULED');assert.equal(events[0].pht,'2027-01-01 17:30');
});
test('duplicate aliases do not add reservations and repeated remote IDs render once',()=>{
 const remote={id:'video1',status:{privacyStatus:'private',publishAt:'2027-01-01T09:30:00Z'}};
 assert.equal(calendarEvents([{...row,status:'DUPLICATE'},row,{...row,short_id:'RS-2'}],{videos:[remote,remote]}).length,1);
 assert.equal(calendarEvents([],{videos:[remote,remote]}).length,1);
});
test('unfinished drafts still expose real scheduling conflicts',()=>{
 const events=calendarEvents([{...row,status:'PRIVATE_UPLOADED'}],{videos:[{id:'video1',status:{privacyStatus:'private',publishAt:'2027-01-02T09:30:00Z'}}]});
 assert.equal(events.filter(e=>e.state==='RESERVATION_CONFLICT').length,1);
});
