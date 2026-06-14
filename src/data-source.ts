import { DataSource } from 'typeorm';
import { Task } from './models/Task';
import { Result } from './models/Result';
import { Workflow } from './models/Workflow';
import { config } from './config/env';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.dbPath,
  dropSchema: config.dropSchema,
  entities: [Task, Result, Workflow],
  synchronize: config.synchronize,
  logging: false,
});
