import Supercluster, { type PointFeature } from 'supercluster';
import type { Issue } from './domain';

export function createIssueLayer(issues: Issue[], clustering: boolean) {
  const points: PointFeature<{ issue: Issue }>[] = issues.map(issue => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [issue.lng, issue.lat] },
    properties: { issue },
  }));
  const index = clustering ? new Supercluster<{ issue: Issue }, { openCount: number }>({
    radius: 80,
    maxZoom: 16,
    minPoints: 2,
    map: ({ issue }) => ({ openCount: issue.status === 'Resolvida' ? 0 : 1 }),
    reduce: (total, next) => { total.openCount += next.openCount; },
  }).load(points) : undefined;

  return {
    atZoom: (zoom: number) => index?.getClusters([-180, -90, 180, 90], Math.floor(zoom)) ?? points,
    expansionZoom: (clusterId: number) => index?.getClusterExpansionZoom(clusterId) ?? 17,
  };
}
