import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Issue } from '../src/domain.js';

type DemoReportPoint = Pick<Issue, 'id' | 'lat' | 'lng'>;
export type DemoReportMetadata = DemoReportPoint & { photoKey: string; mapAddress?: string };

const reportPath = resolve('demo-data/reports.json');
const creditPath = resolve('demo-data/photo-credits.json');
const reports = new Map<string, DemoReportMetadata>();
if (existsSync(reportPath)) {
  const entries = JSON.parse(readFileSync(reportPath, 'utf8')) as DemoReportMetadata[];
  for (const entry of entries) reports.set(entry.id, entry);
}

// Attribution remains public even when a report's free-text note is restricted.
const credits = new Map<string, NonNullable<Issue['photoCredit']>>();
if (reports.size && existsSync(creditPath)) {
  const photos = JSON.parse(readFileSync(creditPath, 'utf8')) as (NonNullable<Issue['photoCredit']> & { key: string })[];
  for (const report of reports.values()) {
    const photo = photos.find(photo => photo.key === report.photoKey);
    if (photo) credits.set(report.id, { author: photo.author, license: photo.license, sourceUrl: photo.sourceUrl, licenseUrl: photo.licenseUrl });
  }
}
export const demoPhotoCredit = (id: string) => credits.get(id);

export function demoReportMapAddress({ id, lat, lng }: DemoReportPoint) {
  const report = reports.get(id);
  if (report?.lat === lat && report.lng === lng) return report.mapAddress;
}
