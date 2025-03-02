import { Express } from 'express';

export type CsvJobData = {
  filePath: string;
};

export type CsvJobResult = {
  jobIds: string[];
};

export type CsvUploadResponse = {
  message: string;
  jobIds: string[];
};

export interface ICsvUploadService {
  uploadCsv(file: Express.Multer.File): Promise<CsvUploadResponse>;
  addCacheKey(key: string): void;
}
