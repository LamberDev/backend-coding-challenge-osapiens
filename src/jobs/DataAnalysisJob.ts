import { Job } from './Job';
import { Task } from '../models/Task';
import booleanWithin from '@turf/boolean-within';
import { Feature, Polygon } from 'geojson';
import countryMapping from '../data/world_data.json';

/** Parses a JSON string, falling back to the raw string if it is invalid JSON. */
function parseInput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class DataAnalysisJob implements Job {
  async run(task: Task): Promise<unknown> {
    console.log(`Running data analysis for task ${task.taskId}...`);

    const inputGeometry: Feature<Polygon> = JSON.parse(task.geoJson);

    let country = 'No country found';
    for (const countryFeature of countryMapping.features) {
      if (
        countryFeature.geometry.type === 'Polygon' ||
        countryFeature.geometry.type === 'MultiPolygon'
      ) {
        const isWithin = booleanWithin(
          inputGeometry,
          countryFeature as Feature<Polygon>,
        );
        if (isWithin) {
          console.log(
            `The polygon is within ${countryFeature.properties?.name}`,
          );
          country = countryFeature.properties?.name;
          break;
        }
      }
    }

    if (task.input != null) {
      return { country, dependency: parseInput(task.input) };
    }
    return country;
  }
}
