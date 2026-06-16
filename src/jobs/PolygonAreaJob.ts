import { Job } from './Job';
import { Task } from '../models/Task';
import area from '@turf/area';

type GeoJsonLike = Record<string, unknown>;

/** @throws {Error} If `coordinates` is missing or empty. */
function computePolygon(geojson: GeoJsonLike): number {
  const coordinates = geojson['coordinates'];
  const hasCoordinates = Array.isArray(coordinates) && coordinates.length > 0;

  if (!hasCoordinates) {
    throw new Error('Invalid GeoJSON: missing or empty coordinates');
  }

  return area(geojson as unknown as Parameters<typeof area>[0]);
}

/** @throws {Error} If the inner geometry is not a `Polygon`. */
function computeFeature(geojson: GeoJsonLike): number {
  const geometry = geojson['geometry'] as GeoJsonLike | null | undefined;
  const innerType = geometry?.['type'];

  if (innerType !== 'Polygon') {
    throw new Error('Invalid GeoJSON: Feature geometry must be Polygon');
  }

  return area(geojson as unknown as Parameters<typeof area>[0]);
}

const geometryHandlers: Record<string, (g: GeoJsonLike) => number> = {
  Polygon: computePolygon,
  Feature: computeFeature,
};

/**
 * Validates a parsed GeoJSON value (Polygon or Feature<Polygon>) and returns
 * its area in square meters via `@turf/area`.
 *
 * @throws {Error} On any validation failure.
 */
export function calculatePolygonAreaM2(geojson: unknown): number {
  const isObject = typeof geojson === 'object' && geojson !== null;
  const hasType = isObject && 'type' in geojson;

  if (!hasType) {
    throw new Error('Invalid GeoJSON: missing type field');
  }

  const typed = geojson as GeoJsonLike;
  const geometryType = String(typed['type']);
  const handler = geometryHandlers[geometryType];

  if (!handler) {
    throw new Error(
      `Invalid GeoJSON: unsupported geometry type "${geometryType}"`,
    );
  }

  return handler(typed);
}

/**
 * Parses `task.geoJson`, validates it as a Polygon or Feature<Polygon>, and
 * returns `{ area }` in m². Throws on invalid input so TaskRunner sets `Failed`.
 */
export class PolygonAreaJob implements Job {
  async run(task: Task): Promise<{ area: number }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(task.geoJson);
    } catch {
      throw new Error('Invalid GeoJSON: unparseable string');
    }

    const areaM2 = calculatePolygonAreaM2(parsed);
    return { area: areaM2 };
  }
}
