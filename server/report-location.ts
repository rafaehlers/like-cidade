import { isClosedStatus, type NewIssue, type Position, type Status } from '../src/domain.js';

type ReportLocation = Pick<NewIssue, 'address' | 'mapAddress' | 'lat' | 'lng'>;
export type LocatedReport = ReportLocation & { id: string; status: Status };

const SAME_POINT_METERS = 30;
const STREET_WITHOUT_CITY_METERS = 1000;
const streetAbbreviations = new Map([
  ['r', 'rua'], ['av', 'avenida'], ['al', 'alameda'], ['tv', 'travessa'], ['trav', 'travessa'],
  ['estr', 'estrada'], ['rod', 'rodovia'],
]);
const streetTypes = /^(?:rua|avenida|alameda|travessa|estrada|rodovia|servidao|viela|beco|largo|praca|via|acesso) \S/;

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function streetReference(address: string, fromMap: boolean) {
  const [reference, ...context] = address.split(/\s+[—–-]\s+/);
  const [street, ...details] = reference.split(',');
  const name = normalize(street.replace(/\s+n[.º°]\s*\d+\w?$/i, ''))
    .replace(/^\S+/, prefix => streetAbbreviations.get(prefix) ?? prefix);
  if (!name || (!fromMap && !streetTypes.test(name))) return;

  const city = (context.at(-1)?.split(',').at(-1) ?? (details.length > 1 ? details.at(-1) : undefined))?.trim();
  return { name, city: city && /\p{L}/u.test(city) ? normalize(city) : undefined };
}

function streetAt({ address, mapAddress }: ReportLocation) {
  const mapped = mapAddress ? streetReference(mapAddress, true) : undefined;
  const entered = address === mapAddress ? undefined : streetReference(address, false);
  return entered ? { name: entered.name, city: entered.city ?? mapped?.city } : mapped;
}

function distanceMeters(from: Position, to: Position) {
  const radians = Math.PI / 180;
  const latitudeDelta = (to.lat - from.lat) * radians;
  const longitudeDelta = (to.lng - from.lng) * radians;
  const fraction = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(fraction)));
}

export function resolvedReportsAtLocation(location: ReportLocation, reports: LocatedReport[]) {
  const street = streetAt(location);
  const matches: { id: string; distance: number }[] = [];

  for (const report of reports) {
    if (!isClosedStatus(report.status)) continue;
    const distance = distanceMeters(location, report);
    const previousStreet = streetAt(report);
    if (!street || !previousStreet) {
      if (distance <= SAME_POINT_METERS) matches.push({ id: report.id, distance });
    } else if (street.name === previousStreet.name && (street.city && previousStreet.city
      ? street.city === previousStreet.city
      : distance <= STREET_WITHOUT_CITY_METERS)) {
      matches.push({ id: report.id, distance });
    }
  }

  return matches.sort((a, b) => a.distance - b.distance).map(match => match.id);
}
