import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GeoDataPoint, GeoDataReport, Project } from '../../core/models';
import { LeafletMapComponent, MapPoint, MapEntityType } from '../../shared/map/leaflet-map.component';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule, LeafletMapComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit {
  private api    = inject(ApiService);
  private router = inject(Router);

  report     = signal<GeoDataReport | null>(null);
  projects   = signal<Project[]>([]);
  loading    = signal(true);
  error      = signal('');
  projectId  = signal('');
  selected   = signal<GeoDataPoint | null>(null);

  readonly typeFilters: Array<{ id: MapEntityType; label: string; icon: string }> = [
    { id: 'activity',    label: 'Activities',    icon: '📍' },
    { id: 'beneficiary', label: 'Beneficiaries',  icon: '🧑‍🤝‍🧑' },
    { id: 'partner',     label: 'Partners',       icon: '🤝' },
    { id: 'project',     label: 'Projects',       icon: '🏗️' },
  ];
  activeTypes = signal<Set<MapEntityType>>(new Set(['activity', 'beneficiary', 'partner', 'project']));

  readonly points = computed<MapPoint[]>(() => {
    const r = this.report();
    if (!r) return [];
    const active = this.activeTypes();
    return r.points
      .filter(p => active.has(p.type))
      .map(p => ({
        id: p.id, type: p.type, latitude: p.latitude, longitude: p.longitude,
        title: p.title, subtitle: p.subtitle,
      }));
  });

  ngOnInit() {
    this.api.projects().subscribe({ next: ps => this.projects.set(ps), error: () => {} });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.geoData(this.projectId() || undefined).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load map data');
        this.loading.set(false);
      },
    });
  }

  setProject(id: string) {
    this.projectId.set(id);
    this.load();
  }

  toggleType(type: MapEntityType) {
    const next = new Set(this.activeTypes());
    if (next.has(type)) next.delete(type); else next.add(type);
    this.activeTypes.set(next);
  }

  isActive(type: MapEntityType): boolean {
    return this.activeTypes().has(type);
  }

  onMarkerClick(point: MapPoint) {
    this.selected.set(this.report()?.points.find(p => p.id === point.id) ?? null);
  }

  closeDetail() {
    this.selected.set(null);
  }

  goToEntity(point: GeoDataPoint) {
    // Only projects have a dedicated detail route in this app today.
    // Activities, partners, and anonymized beneficiary clusters have
    // nowhere to navigate to — beneficiary clusters specifically have no
    // single record to go to anyway (they represent many people, not one).
    if (point.type === 'project') this.router.navigate(['/projects', point.id]);
  }
}