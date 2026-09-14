import crypto from 'node:crypto';
import { excelDate, clockTime, utcPublishAt } from './existing-batch-service.mjs';

export const DEFAULT_SLOTS = ['17:30', '22:30'];
const clean = value => String(value ?? '').trim();
export const isProtected = time => time >= '20:00' && time <= '21:00';
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
  const represented = new Set();
  for (const row of rows) {
    const status=clean(row.status).toUpperCase();
    if(/DUPLICATE|UNRESOLVED/.test(status+' '+clean(row.duplicate_disposition).toUpperCase()))continue;
    const youtubeId=clean(row.youtube_video_id);
    if(youtubeId&&represented.has(youtubeId))continue;
    const complete=['PUBLISHED','SCHEDULED','COMPLETE'].includes(status);
    const stale=complete&&Date.parse(row.verification_timestamp)>Date.parse(snapshot.syncedAt);
    const video=stale?null:remote.get(youtubeId),localAt=utcPublishAt(row);
    if(youtubeId)represented.add(youtubeId);
    const base = { shortId: row.short_id, batchId: row.batch_id, youtubeId: clean(row.youtube_video_id), title: clean(row.public_title) || clean(row.original_filename) || clean(row.file_name) || row.short_id, trackerStatus: row.status, isTracked: true };
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
    return { date, events: daily, slots: slots.map(time => ({ time, state: daily.some(event => event.pht?.slice(11,16) === time) ? 'OCCUPIED' : Date.parse(date + 'T' + time + ':00+08:00') <= now ? 'PAST' : 'AVAILABLE' })), protectedWindow: '20:00–21:00' };
  });
}
export function planReservations({ rows, batchId, startDate, slots = DEFAULT_SLOTS, cadence = 'daily', optionalSlot = false, snapshot = {}, now = Date.now() }) {
  if (!/^INTAKE-/.test(batchId)) throw Error('NEW_INTAKE_BATCH_REQUIRED');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || new Date(startDate + 'T00:00:00Z').toISOString().slice(0,10) !== startDate) throw Error('INVALID_START_DATE');
  if (!['daily','every-other-day'].includes(cadence)) throw Error('INVALID_CADENCE');
  const times = validateSlots(slots, optionalSlot);
  const eligible = rows.filter(row => row.batch_id === batchId && ['AWAITING_METADATA','BATCH_READY','PRIVATE_UPLOADED'].includes(clean(row.status).toUpperCase()) && !/DUPLICATE|UNRESOLVED/i.test(clean(row.duplicate_disposition)) && !row.scheduled_date && !row.scheduled_time).sort((a,b) => clean(a.short_id).localeCompare(clean(b.short_id)));
  const occupied = new Set(calendarEvents(rows, snapshot).map(event => event.pht));
  const updates = [], step = cadence === 'daily' ? 1 : 2, start = Date.parse(startDate + 'T00:00:00Z');
  for (let offset = 0; updates.length < eligible.length && offset < 3660; offset += step) {
    const date = new Date(start + offset * 86400000).toISOString().slice(0,10);
    for (const time of times) {
      if (updates.length >= eligible.length) break;
      if (Date.parse(date + 'T' + time + ':00+08:00') <= now || occupied.has(date + ' ' + time)) continue;
      const row = eligible[updates.length];
      updates.push({ short_id: row.short_id, scheduled_date: date, scheduled_time: time, timezone: 'Asia/Manila', posting_slot: time, schedule_order: updates.length + 1 });
      occupied.add(date + ' ' + time);
    }
  }
  if (updates.length !== eligible.length) throw Error('NO_AVAILABLE_SLOTS');
  const plan = { batchId, startDate, slots: times, cadence, optionalSlot, updates, snapshotAt: snapshot.syncedAt || null };
  return { ...plan, fingerprint: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
export function assertScheduleAvailable(rows, row, snapshot, now = Date.now()) {
  const at = utcPublishAt(row), time = clockTime(row.scheduled_time);
  if (!at || Date.parse(at) <= now || isProtected(time)) throw Error('INVALID_OR_PROTECTED_PUBLISH_TIME:' + row.short_id);
  const conflicts = calendarEvents(rows.filter(item => item.short_id !== row.short_id), { ...snapshot, videos: (snapshot.videos || []).filter(video => video.id !== row.youtube_video_id) }).filter(event => event.pht === pht(at));
  if (conflicts.length) throw Error('SCHEDULE_SLOT_OCCUPIED:' + excelDate(row.scheduled_date) + ' ' + time);
}
