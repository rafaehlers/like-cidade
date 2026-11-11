import type { Position } from './domain';
import { loadMaps } from './maps';

type AddressResult = { address_components: { long_name: string; short_name: string; types: string[] }[] };

export function streetLabel(results: AddressResult[]): string | undefined {
  for (const result of results) {
    const component = (type: string) => result.address_components.find(part => part.types.includes(type));
    const street = component('route')?.long_name;
    if (!street) continue;
    const number = component('street_number')?.long_name;
    const neighborhood = (component('sublocality_level_1') ?? component('sublocality') ?? component('neighborhood'))?.long_name;
    const city = (component('country')?.short_name === 'BR'
      ? component('administrative_area_level_2') ?? component('locality')
      : component('locality') ?? component('postal_town'))?.long_name;
    const address = number ? `${street}, ${number}` : street;
    const context = [...new Set([neighborhood, city].filter((part): part is string => !!part))];
    const label = context.length ? `${address} — ${context.join(', ')}` : address;
    // Keep the suggestion within the existing report field/server limit.
    return label.length <= 140 ? label : address.slice(0, 140);
  }
}

export async function lookupStreet(position: Position): Promise<string | undefined> {
  await loadMaps();
  const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
  const { results } = await new Geocoder().geocode({ location: position, language: 'pt-BR' });
  return streetLabel(results);
}
