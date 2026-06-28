import {
  Component, Input, OnChanges, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, SimpleChanges, Output, EventEmitter,
} from '@angular/core';
import * as L from 'leaflet';

export type MapEntityType = 'activity' | 'beneficiary' | 'partner' | 'project';

export interface MapPoint {
  id: string;
  type: MapEntityType;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  /** Optional route to navigate to when the marker's popup link is clicked. */
  route?: string[];
}

const MARKER_COLORS: Record<MapEntityType, string> = {
  activity: '#4f46e5',     // primary/indigo
  beneficiary: '#10b981',  // green
  partner: '#f59e0b',      // amber
  project: '#3b82f6',      // blue
};

const MARKER_LABELS: Record<MapEntityType, string> = {
  activity: 'Activity',
  beneficiary: 'Beneficiary',
  partner: 'Partner',
  project: 'Project',
};

/**
 * Thin, self-contained Leaflet wrapper — deliberately not using a
 * third-party Angular-Leaflet binding package, since Leaflet's API is
 * small enough that a direct wrapper keeps the dependency surface minimal
 * and avoids being tied to another package's release cycle.
 *
 * Uses OpenStreetMap tiles (free, no API key) per the product decision to
 * avoid adding billing/API-key configuration burden for this feature.
 */
@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  template: `<div #mapContainer class="leaflet-map-container" [style.height]="height"></div>`,
  styles: [`
    .leaflet-map-container {
      width: 100%;
      border-radius: 14px;
      overflow: hidden;
      z-index: 0;
    }
  `],
})
export class LeafletMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() points: MapPoint[] = [];
  @Input() height = '420px';
  /** When true, fit the map bounds to the current points on every change. Set false if you want to control the view yourself. */
  @Input() autoFit = true;
  @Output() markerClick = new EventEmitter<MapPoint>();

  private map?: L.Map;
  private markers: L.Marker[] = [];
  private viewInitialized = false;

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.initMap();
    this.renderMarkers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['points'] && this.viewInitialized) {
      this.renderMarkers();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    // Default view: roughly centred on the equator/prime-meridian region
    // until points arrive and fitBounds takes over — avoids defaulting to
    // any single country/continent.
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [0, 20],
      zoom: 2,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);
  }

  private renderMarkers(): void {
    if (!this.map) return;

    for (const m of this.markers) this.map.removeLayer(m);
    this.markers = [];

    const validPoints = this.points.filter(
      p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
    );

    for (const point of validPoints) {
      const icon = this.buildIcon(point.type);
      const marker = L.marker([point.latitude, point.longitude], { icon });

      const popupHtml = `
        <div class="leaflet-popup-content-inner">
          <span class="map-popup-type" style="color:${MARKER_COLORS[point.type]}">${MARKER_LABELS[point.type]}</span>
          <strong class="map-popup-title">${this.escapeHtml(point.title)}</strong>
          ${point.subtitle ? `<span class="map-popup-subtitle">${this.escapeHtml(point.subtitle)}</span>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.on('click', () => this.markerClick.emit(point));
      marker.addTo(this.map);
      this.markers.push(marker);
    }

    if (this.autoFit && validPoints.length > 0) {
      if (validPoints.length === 1) {
        this.map.setView([validPoints[0].latitude, validPoints[0].longitude], 12);
      } else {
        const bounds = L.latLngBounds(validPoints.map(p => [p.latitude, p.longitude] as [number, number]));
        this.map.fitBounds(bounds, { padding: [32, 32] });
      }
    }
  }

  private buildIcon(type: MapEntityType): L.DivIcon {
    const color = MARKER_COLORS[type];
    return L.divIcon({
      className: 'custom-map-marker',
      html: `<span style="background:${color}" class="map-marker-dot"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8],
    });
  }

  private escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}