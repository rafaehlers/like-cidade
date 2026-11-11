type AddressComponent = { long_name: string; short_name: string; types: string[] };
type AddressResult = { address_components: AddressComponent[] };

export function cityLabel(results: AddressResult[]): string | undefined {
  for (const result of results) {
    const name = (type: string) => result.address_components.find(component => component.types.includes(type));
    // Brazilian municipalities use administrative_area_level_2; locality may be a district.
    const city = name('country')?.short_name === 'BR'
      ? name('administrative_area_level_2') ?? name('locality')
      : name('locality') ?? name('postal_town') ?? name('administrative_area_level_2');
    if (!city) continue;
    const region = name('administrative_area_level_1') ?? name('country');
    return region && region.long_name !== city.long_name ? `${city.long_name}, ${region.long_name}` : city.long_name;
  }
}
