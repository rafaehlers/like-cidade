import type { CityIdentity } from './cityInfo';

type AddressComponent = { long_name: string; short_name: string; types: string[] };
type AddressResult = { address_components: AddressComponent[] };

export function cityIdentity(results: AddressResult[]): CityIdentity | undefined {
  for (const result of results) {
    const name = (type: string) => result.address_components.find(component => component.types.includes(type));
    // Brazilian municipalities use administrative_area_level_2; locality may be a district.
    const city = name('country')?.short_name === 'BR'
      ? name('administrative_area_level_2') ?? name('locality')
      : name('locality') ?? name('postal_town') ?? name('administrative_area_level_2');
    if (!city) continue;
    const region = name('administrative_area_level_1');const country=name('country');const suffix=region ?? country;
    return {name:city.long_name,region:region?.long_name ?? '',regionCode:region?.short_name ?? '',country:country?.long_name ?? '',countryCode:country?.short_name ?? '',
      label:suffix && suffix.long_name!==city.long_name?`${city.long_name}, ${suffix.long_name}`:city.long_name};
  }
}

export function cityLabel(results:AddressResult[]) {return cityIdentity(results)?.label;}
