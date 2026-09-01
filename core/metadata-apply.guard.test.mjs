import assert from 'node:assert/strict';import {applyMetadataSchedule} from './metadata-apply.mjs';
await assert.rejects(()=>applyMetadataSchedule({executionPlan:{approvedRowIds:[],youtubeIds:[],operationCount:0}}),/DIRECT_PRODUCTION_WRITE_DISABLED/);console.log('metadata apply direct-write guard passed');
