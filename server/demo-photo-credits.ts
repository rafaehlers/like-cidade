import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Issue } from '../src/domain.js';
// Attribution remains public even when a report's free-text note is restricted.
const credits=new Map<string,NonNullable<Issue['photoCredit']>>();
const reportPath=resolve('demo-data/reports.json');const creditPath=resolve('demo-data/photo-credits.json');
if(existsSync(reportPath) && existsSync(creditPath)) {
  const reports=JSON.parse(readFileSync(reportPath,'utf8')) as {id:string;photoKey:string}[];
  const photos=JSON.parse(readFileSync(creditPath,'utf8')) as (NonNullable<Issue['photoCredit']> & {key:string})[];
  for(const report of reports){const photo=photos.find(photo=>photo.key===report.photoKey);if(photo)credits.set(report.id,{author:photo.author,license:photo.license,sourceUrl:photo.sourceUrl,licenseUrl:photo.licenseUrl});}
}
export const demoPhotoCredit=(id:string)=>credits.get(id);
