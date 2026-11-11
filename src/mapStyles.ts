import type { Theme } from './useTheme';

const HIDDEN_LABELS: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// Local raster styles preserve street labels and keep commercial POIs hidden.
const NIGHT: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#202a2f' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#202a2f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a8b8bd' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#435059' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#dde5e4' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#24352e' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#253f32' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3b474e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#29343b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#becbd0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#6a6250' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e3d5b5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#142f40' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7da7bf' }] },
];

export function mapStyles(theme: Theme): google.maps.MapTypeStyle[] {
  return [...(theme === 'dark' ? NIGHT : []), ...HIDDEN_LABELS];
}
