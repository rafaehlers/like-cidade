export type CityIdentity={name:string;region:string;regionCode:string;country:string;countryCode:string;label:string};
export type CityInfoQuery=Pick<CityIdentity,'name'|'region'|'regionCode'|'countryCode'>;
export type CityInfo={
  name:string;region:string;country:string;summary:string;
  population?:{value:number;year?:number};areaKm2?:number;elevationM?:number;
  coordinates?:{lat:number;lng:number};
  wikipediaUrl:string;wikidataUrl:string;officialWebsite?:string;wikipediaLicenseUrl?:string;
  sections:{title:string;url:string}[];fetchedAt:string;
};
export function cityInfoKey(city:CityInfoQuery) {return JSON.stringify([city.name,city.region,city.regionCode,city.countryCode]);}
export function wikipediaSearchUrl(city:CityInfoQuery) {
  return `https://pt.wikipedia.org/w/index.php?${new URLSearchParams({search:`${city.name} ${city.region}`.trim()})}`;
}
