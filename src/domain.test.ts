import test from 'node:test';
import assert from 'node:assert/strict';
import { inBounds, validPosition, canManage, seedIssues, CATEGORIES, SUBCATEGORIES, PEOPLE, isSubcategory, isUserId, toggleSupport, type Role, type UserId } from './domain';
import { cityIdentity, cityLabel } from './mapCity';
import { createIssueLayer } from './mapClusters';
import { streetLabel } from './mapAddress';

test('each category has ten subcategories and only accepts its own options', () => {
  for (const category of CATEGORIES) {
    assert.equal(SUBCATEGORIES[category].length, 10);
    assert.equal(new Set(SUBCATEGORIES[category]).size, 10);
    assert.ok(SUBCATEGORIES[category].every(option => isSubcategory(category, option)));
  }
  assert.equal(isSubcategory('Calçada', 'Lâmpada apagada'), false);
  assert.equal(isSubcategory('Iluminação', 'Lâmpada apagada'), true);
  for (const value of ['', null, 42, {}, 'Inexistente']) assert.equal(isSubcategory('Calçada', value), false);
});

test('street suggestions use structured street, number, neighborhood and Brazilian municipality', () => {
  const component = (long_name: string, type: string, short_name = long_name) => ({ long_name, short_name, types: [type] });
  const results = [{ address_components: [
    component('Centro', 'sublocality_level_1'), component('Brasil', 'country', 'BR'),
    component('72', 'street_number'), component('Itajaí', 'administrative_area_level_2'),
    component('Rua Hercílio Luz', 'route'), component('Santa Catarina', 'administrative_area_level_1', 'SC'),
  ] }];
  assert.equal(streetLabel(results), 'Rua Hercílio Luz, 72 — Centro, Itajaí');
});

test('street suggestions skip results without a road and do not invent a street from city/plus-code results', () => {
  const country = { long_name: 'Brasil', short_name: 'BR', types: ['country'] };
  const city = { long_name: 'Itajaí', short_name: 'Itajaí', types: ['administrative_area_level_2'] };
  assert.equal(streetLabel([]), undefined);
  assert.equal(streetLabel([{ address_components: [country, city] }]), undefined);
  assert.equal(streetLabel([
    { address_components: [country, city] },
    { address_components: [country, city, { long_name: 'Itajaí', short_name: 'Itajaí', types: ['sublocality_level_1'] }, { long_name: 'Rua das Flores', short_name: 'Rua das Flores', types: ['route'] }] },
  ]), 'Rua das Flores — Itajaí');
});

test('automatic street values respect the existing 140-character report limit', () => {
  const street = 'Rua das Palmeiras';
  assert.equal(streetLabel([{ address_components: [
    { long_name: street, short_name: street, types: ['route'] },
    { long_name: 'Bairro '.repeat(30), short_name: 'Bairro', types: ['neighborhood'] },
  ] }]), street);
});

test('map groups nearby reports when zoomed out and restores category pins on expansion', () => {
  const issues = seedIssues();
  const layer = createIssueLayer(issues, true);
  const distant = layer.atZoom(10);
  assert.equal(distant.length, 1);
  const group = distant[0].properties;
  assert.ok('cluster_id' in group);
  assert.equal(group.point_count, 3);
  assert.equal(group.openCount, 2);
  const expanded = layer.atZoom(layer.expansionZoom(group.cluster_id));
  assert.ok(expanded.length > distant.length);
  const close = layer.atZoom(17);
  assert.deepEqual(close.map(feature => 'issue' in feature.properties && feature.properties.issue.category).sort(), issues.map(issue => issue.category).sort());
});

test('disabling grouping keeps every report selectable even at the world zoom level', () => {
  const issues = seedIssues();
  const points = createIssueLayer(issues, false).atZoom(0);
  assert.equal(points.length, issues.length);
  assert.deepEqual(points.map(point => 'issue' in point.properties && point.properties.issue.id).sort(), issues.map(issue => issue.id).sort());
});

test('groups count only filtered reports and remain resolved when all members are resolved', () => {
  const issues = seedIssues();
  const filtered = createIssueLayer(issues.filter(issue => issue.category === 'Lixo'), true).atZoom(10);
  assert.equal(filtered.length, 1);
  assert.ok('issue' in filtered[0].properties);
  assert.equal(filtered[0].properties.issue.category, 'Lixo');
  const resolved = createIssueLayer(issues.map(issue => ({ ...issue, status: 'Resolvida' })), true).atZoom(10);
  assert.ok('cluster_id' in resolved[0].properties);
  assert.equal(resolved[0].properties.openCount, 0);
  assert.equal(resolved[0].properties.point_count, 3);
});

test('map city uses the Brazilian municipality instead of a district and matches components by type', () => {
  const component = (long_name: string, type: string, short_name = long_name) => ({ long_name, short_name, types: [type, 'political'] });
  assert.equal(cityLabel([{ address_components: [
    component('Santa Catarina', 'administrative_area_level_1', 'SC'),
    component('Canasvieiras', 'locality'),
    component('Brasil', 'country', 'BR'),
    component('Florianópolis', 'administrative_area_level_2'),
  ] }]), 'Florianópolis, Santa Catarina');
  assert.equal(cityLabel([{ address_components: [
    component('Estados Unidos', 'country', 'US'),
    component('São Francisco', 'locality'),
    component('Califórnia', 'administrative_area_level_1', 'CA'),
    component('Condado de São Francisco', 'administrative_area_level_2'),
  ] }]), 'São Francisco, Califórnia');
});

test('map city does not invent a municipality or mix components from different results', () => {
  assert.equal(cityLabel([]), undefined);
  assert.equal(cityLabel([{ address_components: [{ long_name: 'Brasil', short_name: 'BR', types: ['country'] }] }]), undefined);
  assert.equal(cityLabel([
    { address_components: [{ long_name: 'Paraná', short_name: 'PR', types: ['administrative_area_level_1'] }] },
    { address_components: [{ long_name: 'Itajaí', short_name: 'Itajaí', types: ['administrative_area_level_2'] }] },
  ]), 'Itajaí');
});

test('coordinates reject NaN, infinity, and out-of-earth values', () => {
  for (const point of [{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 0, lng: -181 }]) assert.equal(validPosition(point), false);
  assert.equal(validPosition({ lat: -26.9, lng: -48.6 }), true);
});
test('map viewport filtering handles the antimeridian', () => {
  const bounds = { south: -30, north: 30, west: 170, east: -170 };
  assert.equal(inBounds({ lat: 0, lng: 178 }, bounds), true);
  assert.equal(inBounds({ lat: 0, lng: -178 }, bounds), true);
  assert.equal(inBounds({ lat: 0, lng: 0 }, bounds), false);
});
test('residents cannot manage attendance; agency and administrator can', () => {
  assert.equal(canManage('resident'), false);
  for (const role of ['agency', 'admin'] as Role[]) assert.equal(canManage(role), true);
});
test('example data is explicitly fictional and contains valid coordinates', () => {
  const issues = seedIssues();
  assert.equal(new Set(issues.map(i => i.id)).size, issues.length);
  assert.ok(issues.every(i => i.sample && validPosition(i)));
});

test('the five residents can support independently without sharing staff permissions', () => {
  const residents = Object.entries(PEOPLE).filter(([, person]) => person.type === 'resident');
  assert.deepEqual(residents.map(([, person]) => person.name), ['Rafael', 'Felipe', 'Gabriel', 'Sérgio', 'Ricardo']);
  let likes: UserId[] = [];
  for (const [id, person] of residents) {
    likes = toggleSupport(likes, id as UserId);
    assert.equal(canManage(person.type), false);
  }
  assert.equal(likes.length, 5);
  const restored: UserId[] = JSON.parse(JSON.stringify(likes));
  likes = toggleSupport(restored, 'resident-felipe');
  assert.equal(likes.length, 4);
  assert.ok(likes.includes('resident'));
  assert.ok(likes.includes('resident-gabriel'));
  assert.ok(likes.includes('resident-sergio'));
  assert.ok(likes.includes('resident-ricardo'));
  assert.equal(PEOPLE.admin.name, 'Admin');
  assert.equal(likes.includes('resident-felipe'), false);
  assert.ok(isUserId('resident')); // Preserve existing stored support and account IDs.
  assert.equal(isUserId('__proto__'), false);
});


test('map city identity keeps municipality, state and country together for city information',()=>{
  const city=cityIdentity([{address_components:[
    {long_name:'Canasvieiras',short_name:'Canasvieiras',types:['locality']},
    {long_name:'Florianópolis',short_name:'Florianópolis',types:['administrative_area_level_2']},
    {long_name:'Santa Catarina',short_name:'SC',types:['administrative_area_level_1']},
    {long_name:'Brasil',short_name:'BR',types:['country']},
  ]}]);
  assert.deepEqual(city,{name:'Florianópolis',region:'Santa Catarina',regionCode:'SC',country:'Brasil',countryCode:'BR',label:'Florianópolis, Santa Catarina'});
});
