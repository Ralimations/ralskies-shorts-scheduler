import crypto from 'node:crypto';
import { contentKey, isRetired, growthReservations, assertGrowthAvailable } from './growth-policy.mjs';
import { excelDate, clockTime, utcPublishAt } from './existing-batch-service.mjs';

export const DEFAULT_SLOTS = ['20:00'];
const clean = value => String(value ?? '').trim();
export const isProtected = time => time > '20:00' && time <= '21:00';
export function validateSlots(slots, optionalSlot = false) {
  if (!Array.isArray(slots) || !slots.length) throw Error('SELECT_AT_LEAST_ONE_SLOT');
  const values = [...new Set(slots.map(clean))].sort();
  for (const time of values) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('INVALID_SLOT:' + time);
    if (isProtected(time)) throw Error('MANUAL_PROTECTED_SLOT:' + time);
    if (time === '01:30' && !optionalSlot) throw Error('OPTIONAL_SLOT_DISABLED');
  }
  return values;
}
export function pht(instant) {
  const value = Date.parse(instant);
  return Number.isFinite(value) ? new Date(value + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '';
}
export function calendarEvents(rows, snapshot = {}) {
  const remote = new Map((snapshot.videos || []).map(video => [video.id, video])), events = [];
  const represented = new Set(rows.filter(isRetired).map(row => clean(row.youtube_video_id)).filter(Boolean));
  for (const row of rows) {
    const status=clean(row.status).toUpperCase();
    if(isRetired(row))continue;
    if(/DUPLICATE|UNRESOLVED/.test(status+' '+clean(row.duplicate_disposition).toUpperCase()))continue;
    const youtubeId=clean(row.youtube_video_id);
    if(youtubeId&&represented.has(youtubeId))continue;
    const complete=['PUBLISHED','SCHEDULED','COMPLETE'].includes(status);
    const stale=complete&&Date.parse(row.verification_timestamp)>Date.parse(snapshot.syncedAt);
    const video=stale?null:remote.get(youtubeId),localAt=utcPublishAt(row);
    if(youtubeId)represented.add(youtubeId);
    const base = { contentKey: contentKey(row), shortId: row.short_id, batchId: row.batch_id, youtubeId: clean(row.youtube_video_id), title: clean(row.public_title) || clean(row.original_filename) || clean(row.file_name) || row.short_id, trackerStatus: row.status, isTracked: true };
    if (video) {
      represented.add(video.id);
      const published = video.status?.privacyStatus === 'public';
      const actualAt = published ? video.snippet?.publishedAt : video.status?.publishAt;
      if (actualAt) events.push({ ...base, at: actualAt, pht: pht(actualAt), state: published ? 'PUBLISHED' : 'YOUTUBE_SCHEDULED', source: 'YOUTUBE', observedAt: snapshot.syncedAt });
      if (localAt && !complete && (!actualAt || Date.parse(actualAt) !== Date.parse(localAt))) events.push({ ...base, at: localAt, pht: pht(localAt), state: 'RESERVATION_CONFLICT', source: 'TRACKER' });
      if(!actualAt&&complete&&localAt)events.push({...base,at:localAt,pht:pht(localAt),state:'TRACKER_'+status,source:'TRACKER'});
    } else if (localAt) {
      events.push({ ...base, at: localAt, pht: pht(localAt), state: complete ? 'TRACKER_' + clean(row.status).toUpperCase() : 'RESERVED', source: 'TRACKER' });
    }
  }
  // Include all channel uploads as occupied times. The API does not expose an isShort flag.
  for (const video of remote.values()) {
    if (represented.has(video.id)) continue;
    const published = video.status?.privacyStatus === 'public', at = published ? video.snippet?.publishedAt : video.status?.publishAt;
    if (at) events.push({ youtubeId: video.id, title: video.snippet?.title || video.id, at, pht: pht(at), state: published ? 'PUBLISHED' : 'YOUTUBE_SCHEDULED', source: 'YOUTUBE', isTracked: false, observedAt: snapshot.syncedAt });
  }
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function calendarMonth(events, month, slots = DEFAULT_SLOTS, now = Date.now()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('INVALID_CALENDAR_MONTH');
  const days = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const date = month + '-' + String(index + 1).padStart(2,'0'), daily = events.filter(event => event.pht?.slice(0,10) === date);
    return { date, events: daily, slots: slots.map(time => ({ time, state: daily.some(event => event.pht?.slice(11,16) === time) ? 'OCCUPIED' : Date.parse(date + 'T' + time + ':00+08:00') <= now ? 'PAST' : 'AVAILABLE' })), protectedWindow: '20:01–21:00' };
  });
}
export function windowSlots({windowStart,windowEnd,intervalMinutes=60,optionalSlot=false}){
 const valid=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
 if(!valid(windowStart)||!valid(windowEnd))throw Error('SET_NEW_RELEASE_WINDOW');
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3)),start=minutes(windowStart),end=minutes(windowEnd)+(windowEnd<windowStart?1440:0);
 if(!Number.isInteger(intervalMinutes)||intervalMinutes<15||intervalMinutes>1440)throw Error('INVALID_WINDOW_INTERVAL');
 const slots=[];for(let m=start;m<=end;m+=intervalMinutes){const time=String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(!isProtected(time)&&(time!=='01:30'||optionalSlot))slots.push(time);}
 validateSlots(slots,optionalSlot);return slots;
}
export function planReservations({ rows, batchId, startDate, slots = DEFAULT_SLOTS, cadence = 'daily', optionalSlot = false, windowStart, windowEnd, intervalMinutes=60, postsPerDay, horizonDays = 14, snapshot = {}, now = Date.now() }) {
  if (!/^INTAKE-/.test(batchId)) throw Error('NEW_INTAKE_BATCH_REQUIRED');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || new Date(startDate + 'T00:00:00Z').toISOString().slice(0,10) !== startDate) throw Error('INVALID_START_DATE');
  if (!['daily','every-other-day','four-per-week'].includes(cadence)) throw Error('INVALID_CADENCE');
  const times = windowStart||windowEnd?windowSlots({windowStart,windowEnd,intervalMinutes,optionalSlot}):validateSlots(slots, optionalSlot);
  const dailyLimit=postsPerDay===undefined?times.length:Number(postsPerDay);
  if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>10)throw Error('POSTS_PER_DAY_MUST_BE_1_TO_10');
  const eligible = rows.filter(row => (row.batch_id === batchId || batchId === 'INTAKE-ALL' && /^INTAKE-/.test(row.batch_id)) && clean(row.schedule_eligible).toUpperCase() !== 'NO' && ['AWAITING_METADATA','BATCH_READY','PRIVATE_UPLOADED'].includes(clean(row.status).toUpperCase()) && !/DUPLICATE|UNRESOLVED/i.test(clean(row.duplicate_disposition)) && !row.scheduled_date && !row.scheduled_time).sort((a,b) => clean(a.short_id).localeCompare(clean(b.short_id)));
  if (cadence === 'four-per-week') {
    const time = times[0];
    if (times.length !== 1 || dailyLimit !== 1) throw Error('GROWTH_REQUIRES_ONE_DAILY_SLOT');
    const result = growthReservations({ eligible, events: calendarEvents(rows, snapshot), startDate, time, now, horizonDays });
    const plan = { batchId, startDate, slots: times, cadence, optionalSlot, postsPerDay: 1, horizonDays, ...result, snapshotAt: snapshot.syncedAt || null };
    return { ...plan, fingerprint: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
  }
  const occupied = new Set(calendarEvents(rows, snapshot).map(event => event.pht));
  const updates = [], step = cadence === 'daily' ? 1 : 2, start = Date.parse(startDate + 'T00:00:00Z');
  for (let offset = 0; updates.length < eligible.length && offset < 3660; offset += step) {
    const windowDate = new Date(start + offset * 86400000).toISOString().slice(0,10);
    let addedToday=0;
    for (const time of times) {
      if(addedToday>=dailyLimit)break;
      const date=windowStart&&windowEnd<windowStart&&time<windowStart?new Date(start+(offset+1)*86400000).toISOString().slice(0,10):windowDate;
      if (updates.length >= eligible.length) break;
      if (Date.parse(date + 'T' + time + ':00+08:00') <= now || occupied.has(date + ' ' + time)) continue;
      const row = eligible[updates.length];
      updates.push({ short_id: row.short_id, scheduled_date: date, scheduled_time: time, timezone: 'Asia/Manila', posting_slot: time, schedule_order: updates.length + 1 });
      occupied.add(date + ' ' + time);addedToday++;
    }
  }
  if (updates.length !== eligible.length) throw Error('NO_AVAILABLE_SLOTS');
  const plan = { batchId, startDate, slots: times, cadence, optionalSlot, ...(windowStart?{windowStart,windowEnd,intervalMinutes}:{}), ...(postsPerDay!==undefined?{postsPerDay:dailyLimit}:{}), updates, snapshotAt: snapshot.syncedAt || null };
  return { ...plan, fingerprint: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
export function assertScheduleAvailable(rows, row, snapshot, now = Date.now()) {
  const at = utcPublishAt(row), time = clockTime(row.scheduled_time);
  if (!at || Date.parse(at) <= now || isProtected(time)) throw Error('INVALID_OR_PROTECTED_PUBLISH_TIME:' + row.short_id);
  const conflicts = calendarEvents(rows.filter(item => item.short_id !== row.short_id), { ...snapshot, videos: (snapshot.videos || []).filter(video => video.id !== row.youtube_video_id) }).filter(event => event.pht === pht(at));
  if (conflicts.length) throw Error('SCHEDULE_SLOT_OCCUPIED:' + excelDate(row.scheduled_date) + ' ' + time);
  if (row.schedule_policy === 'four-per-week') assertGrowthAvailable(calendarEvents(rows.filter(item => item.short_id !== row.short_id), { ...snapshot, videos: (snapshot.videos || []).filter(video => video.id !== row.youtube_video_id) }), row, at);
}
