import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataAnalysisJob } from './DataAnalysisJob';
import { Task } from '../models/Task';

// Stub out the heavy booleanWithin dependency so tests are fast and
// deterministic.
vi.mock('@turf/boolean-within', () => ({
  default: vi.fn(),
}));

vi.mock('../data/world_data.json', () => ({
  default: {
    features: [
      {
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { name: 'Testland' },
      },
      {
        geometry: { type: 'Point', coordinates: [] }, // non-Polygon: skipped
        properties: { name: 'Ignored' },
      },
    ],
  },
}));

import booleanWithin from '@turf/boolean-within';

const VALID_POLYGON = JSON.stringify({
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return { geoJson: VALID_POLYGON, ...overrides } as Task;
}

describe('DataAnalysisJob', () => {
  const job = new DataAnalysisJob();

  beforeEach(() => {
    vi.mocked(booleanWithin).mockReturnValue(true);
  });

  describe('given task.input is null (no dependency)', () => {
    it('should return the bare country string', async () => {
      // Arrange
      const task = makeTask({ input: null });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toBe('Testland');
    });

    it('should return the bare country string when task.input is undefined', async () => {
      // Arrange
      const task = makeTask({ input: undefined });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toBe('Testland');
    });
  });

  describe('given task.input is present (dependency forwarded its output)', () => {
    it('should return an enriched object containing the country and the parsed dependency', async () => {
      // Arrange
      const forwarded = { area: 12345.67 };
      const task = makeTask({ input: JSON.stringify(forwarded) });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toEqual({ country: 'Testland', dependency: forwarded });
    });

    it('should parse a complex nested forwarded value correctly', async () => {
      // Arrange
      const forwarded = { area: 99, unit: 'm2', meta: { source: 'polygonArea' } };
      const task = makeTask({ input: JSON.stringify(forwarded) });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toMatchObject({ country: 'Testland', dependency: forwarded });
    });

    it('should fall back to the raw string if task.input is not valid JSON', async () => {
      // Arrange
      const task = makeTask({ input: 'not-valid-json' });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toEqual({ country: 'Testland', dependency: 'not-valid-json' });
    });
  });

  describe('given no country match is found', () => {
    it('should return "No country found" when input is null', async () => {
      // Arrange
      vi.mocked(booleanWithin).mockReturnValue(false);
      const task = makeTask({ input: null });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toBe('No country found');
    });

    it('should return enriched object with "No country found" when input is present', async () => {
      // Arrange
      vi.mocked(booleanWithin).mockReturnValue(false);
      const forwarded = { area: 1 };
      const task = makeTask({ input: JSON.stringify(forwarded) });

      // Act
      const result = await job.run(task);

      // Assert
      expect(result).toEqual({ country: 'No country found', dependency: forwarded });
    });
  });
});
