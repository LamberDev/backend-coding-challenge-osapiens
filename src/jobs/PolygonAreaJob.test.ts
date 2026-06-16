import { describe, it, expect } from 'vitest';
import { PolygonAreaJob, calculatePolygonAreaM2 } from './PolygonAreaJob';
import { getJobForTaskType } from './JobFactory';
import { Task } from '../models/Task';

function makeTask(geoJson: string): Task {
  return { geoJson } as Task;
}

const SQUARE_POLYGON_NEAR_EQUATOR = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
});

const FEATURE_WRAPPING_POLYGON = JSON.stringify({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  properties: null,
});

describe('JobFactory', () => {
  describe('given the factory has been loaded', () => {
    it('should return a PolygonAreaJob instance when "polygonArea" is requested', () => {
      // Act
      const job = getJobForTaskType('polygonArea');

      // Assert
      expect(job).toBeInstanceOf(PolygonAreaJob);
    });
  });
});

describe('calculatePolygonAreaM2', () => {
  describe('given a valid GeoJSON Polygon object', () => {
    it('should return a positive area in square meters', () => {
      // Arrange
      const polygon = JSON.parse(SQUARE_POLYGON_NEAR_EQUATOR);

      // Act
      const areaM2 = calculatePolygonAreaM2(polygon);

      // Assert
      expect(typeof areaM2).toBe('number');
      expect(areaM2).toBeGreaterThan(0);
    });
  });

  describe('given a valid GeoJSON Feature wrapping a Polygon', () => {
    it('should return a positive area in square meters', () => {
      // Arrange
      const feature = JSON.parse(FEATURE_WRAPPING_POLYGON);

      // Act
      const areaM2 = calculatePolygonAreaM2(feature);

      // Assert
      expect(typeof areaM2).toBe('number');
      expect(areaM2).toBeGreaterThan(0);
    });
  });

  describe('given a GeoJSON object without a type field', () => {
    it('should throw an error describing the missing type field', () => {
      // Arrange
      const noType = { coordinates: [[0, 0]] };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(noType)).toThrow(
        /missing type field/i,
      );
    });
  });

  describe('given a GeoJSON object with a non-polygon geometry type', () => {
    it('should throw when the type is Point', () => {
      // Arrange
      const point = { type: 'Point', coordinates: [0, 0] };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(point)).toThrow(
        /unsupported geometry type/i,
      );
    });

    it('should throw when the type is LineString', () => {
      // Arrange
      const line = {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(line)).toThrow(
        /unsupported geometry type/i,
      );
    });

    it('should throw when the type is MultiPolygon', () => {
      // Arrange
      const multiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        ],
      };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(multiPolygon)).toThrow(
        /unsupported geometry type/i,
      );
    });
  });

  describe('given a GeoJSON Feature whose inner geometry is not a Polygon', () => {
    it('should throw describing the geometry must be Polygon', () => {
      // Arrange
      const featureWithPoint = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: null,
      };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(featureWithPoint)).toThrow(
        /Feature geometry must be Polygon/i,
      );
    });
  });

  describe('given a GeoJSON Polygon with no coordinates property', () => {
    it('should throw describing the missing coordinates', () => {
      // Arrange
      const polygonNoCoords = { type: 'Polygon' };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(polygonNoCoords)).toThrow(
        /missing or empty coordinates/i,
      );
    });
  });

  describe('given a GeoJSON Polygon with an empty coordinates array', () => {
    it('should throw describing the empty coordinates', () => {
      // Arrange
      const polygonEmptyCoords = { type: 'Polygon', coordinates: [] };

      // Act + Assert
      expect(() => calculatePolygonAreaM2(polygonEmptyCoords)).toThrow(
        /missing or empty coordinates/i,
      );
    });
  });
});

describe('PolygonAreaJob', () => {
  const job = new PolygonAreaJob();

  describe('given task.geoJson is a valid GeoJSON Polygon string', () => {
    it('should return an object with a positive area in square meters', async () => {
      // Arrange
      const task = makeTask(SQUARE_POLYGON_NEAR_EQUATOR);

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toHaveProperty('area');
      expect(typeof result.area).toBe('number');
      expect(result.area).toBeGreaterThan(0);
    });

    it('should not mutate task.status', async () => {
      // Arrange
      const task = makeTask(SQUARE_POLYGON_NEAR_EQUATOR);
      
      task.status = 'queued' as Task['status'];

      // Act
      await job.run(task);

      // Assert
      expect(task.status).toBe('queued');
    });
  });

  describe('given task.geoJson is a valid GeoJSON Feature wrapping a Polygon', () => {
    it('should return an object with a positive area in square meters', async () => {
      // Arrange
      const task = makeTask(FEATURE_WRAPPING_POLYGON);

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toHaveProperty('area');
      expect(result.area).toBeGreaterThan(0);
    });
  });

  describe('given task.geoJson is not valid JSON', () => {
    it('should throw an error so TaskRunner can mark the task as Failed', async () => {
      // Arrange
      const task = makeTask('not-json');

      // Act + Assert
      await expect(job.run(task)).rejects.toThrow(/Invalid GeoJSON/i);
    });
  });

  describe('given task.geoJson parses to an object without a type field', () => {
    it('should throw an error so TaskRunner can mark the task as Failed', async () => {
      // Arrange
      const task = makeTask(JSON.stringify({ coordinates: [] }));

      // Act + Assert
      await expect(job.run(task)).rejects.toThrow(/Invalid GeoJSON/i);
    });
  });

  describe('given task.geoJson has a non-polygon geometry type', () => {
    it('should throw for a Point geometry', async () => {
      // Arrange
      const task = makeTask(
        JSON.stringify({ type: 'Point', coordinates: [0, 0] }),
      );

      // Act + Assert
      await expect(job.run(task)).rejects.toThrow(/Invalid GeoJSON/i);
    });
  });

  describe('given task.geoJson is a Feature with a non-polygon inner geometry', () => {
    it('should throw an error so TaskRunner can mark the task as Failed', async () => {
      // Arrange
      const task = makeTask(
        JSON.stringify({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: null,
        }),
      );

      // Act + Assert
      await expect(job.run(task)).rejects.toThrow(/Invalid GeoJSON/i);
    });
  });

  describe('given task.geoJson is a Polygon with missing coordinates', () => {
    it('should throw an error so TaskRunner can mark the task as Failed', async () => {
      // Arrange
      const task = makeTask(JSON.stringify({ type: 'Polygon' }));

      // Act + Assert
      await expect(job.run(task)).rejects.toThrow(/Invalid GeoJSON/i);
    });
  });
});
