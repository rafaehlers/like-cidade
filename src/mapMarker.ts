import type { Position } from './domain';

// HTML overlays preserve our pins while allowing local styling without a cloud Map ID.
export function createMapMarker(map: google.maps.Map, position: Position, content: HTMLElement, centered = false): google.maps.OverlayView {
  class MapMarker extends google.maps.OverlayView {
    private anchor = document.createElement('div');

    onAdd() {
      this.anchor.style.position = 'absolute';
      this.anchor.style.transform = centered ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
      this.anchor.append(content);
      if (centered) this.anchor.style.pointerEvents = 'none';
      else google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.anchor);
      this.getPanes()?.overlayMouseTarget.append(this.anchor);
    }

    draw() {
      const pixel = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(position));
      if (!pixel) return;
      this.anchor.style.left = `${pixel.x}px`;
      this.anchor.style.top = `${pixel.y}px`;
      this.anchor.style.zIndex = content.classList.contains('map-pin-selected') ? '1000000' : `${Math.round(pixel.y)}`;
    }

    onRemove() { this.anchor.remove(); }
  }

  const marker = new MapMarker();
  marker.setMap(map);
  return marker;
}
