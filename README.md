# CSV Upload Backend (NestJS)

This is the backend application for the upload csv, built with NestJS. It handles CSV file uploads, processes them asynchronously, integrates exchange rates, and serves product data via RESTful endpoints. The application is designed to be scalable, secure, and robust, supporting large files (up to 1GB or 200k+ lines) with efficient processing and storage.

## Project Overview

The CSV Upload  Backend fulfills the core requirements of the challenge by providing a system to:
- Accept CSV uploads containing product data (`name`, `price`, `expiration`).
- Process these files in the background, integrating exchange rates from an external API.
- Store processed products in a PostgreSQL database with calculated exchange rate values.
- Serve the data with pagination, filtering, and sorting capabilities.

### What We Did
- **CSV Upload and Processing**:
  - Implemented `POST /products/upload` to accept CSV files up to 1GB, returning job IDs (`ProductsController`, `CsvUploadService`).
  - Split large files into chunks (`CHUNK_SIZE` configurable) and processed them asynchronously using BullMQ with streams (`CsvQueueProcessor`, `CsvProcessorService`).
  - Validated and sanitized CSV rows (`CsvRow.toProduct`), converting `price` into exchange rate values (`exchangeRates`) for multiple currencies.

- **Exchange Rate Integration**:
  - Fetched rates from `https://github.com/fawazahmed0/exchange-api` (`ExchangeRateService`), cached in Redis for performance.
  - Calculated converted values (e.g., `price * rate`) stored in `exchangeRates` for each product.

- **Data Storage and Retrieval**:
  - Saved products in PostgreSQL with `ProductRepository`, using TypeORM migrations (`config/migrations`).
  - Provided `GET /products` with pagination, filtering (`name`, `price`, `expiration`), and sorting (`name`, `price`, `expiration`, ASC/DESC) via `ProductQueryService`.
  - Added `GET /products/upload-status/:id` for polling job status (`CsvQueueService`).

- **Testing and Robustness**:
  - Added unit tests for services (`csv-processor.service.spec.ts`, etc.) and integration tests (`products.controller.spec.ts`) using Jest.
  - Implemented file validation (CSV only), sanitization (`sanitize-html`), and a 60s timeout for API calls.

### Challenge Requirements Fulfilled
- **Storage with Exchange Rates**: Products stored with `id`, `name`, `price`, `expiration`, and `exchangeRates` (converted values for USD, EUR, GBP, JPY, BRL).
- **Product Query Endpoint**: `GET /products` supports pagination, filtering, and sorting.
- **Large CSV Support**: Handles 200k+ lines with streams and BullMQ (4 workers).
- **CSV Validation**: Rejects non-CSV files and reports per-line errors.
- **Sanitization**: Sanitizes `name` and validates `price` (non-negative numbers) and `expiration` (YYYY-MM-DD).
- **Background Processing**: Uses BullMQ for scalability.
- **HTTP Status**: Returns 202 for `POST /products/upload`.
- **Environment Configuration**: Loads settings via `@nestjs/config` from `.env`.

### Technologies Used
- **NestJS**: Framework for modular architecture.
- **TypeScript**: Strong typing with interfaces and DTOs.
- **TypeORM**: ORM for PostgreSQL with migrations.
- **BullMQ**: Background job processing with Redis.
- **Redis**: Caching exchange rates and queuing jobs.
- **Axios**: HTTP client for exchange rate API.
- **Sanitize-HTML**: XSS protection for `name`.
- **Jest**: Unit and integration testing.
- **Swagger**: API documentation.

### Improvements Implemented
- **Scalability**: Stream-based processing, configurable chunk sizes (`CHUNK_SIZE`), and multiple workers (`WORKER_CONCURRENCY`).
- **Performance**: Cached exchange rates in Redis, optimized database queries with indices.
- **Robustness**: Retry logic (3 attempts) in BullMQ, detailed error reporting, and cache invalidation on uploads.
- **Code Quality**: Layered architecture (controllers, services, repositories), strong typing, and comprehensive tests.
- **Bug Fix**: Adjusted `ProductQueryService` to cache only non-empty results, ensuring fresh data retrieval.

## Future Improvements
- **Real-Time Feedback**: Implement WebSocket (`@nestjs/websockets`) in `CsvQueueProcessor` for incremental progress updates.
- **Chunked Uploads**: Add `POST /products/upload/chunk` to handle file parts, improving large file uploads.
- **Dynamic Batching**: Adjust `CHUNK_SIZE` based on file size or system load.
- **Security**: Add API key authentication (`@nestjs/passport`) and log injection attempts.
- **Monitoring**: Replace NestJS `Logger` with Winston for detailed logging.
- **Additional Endpoint**: Implement `GET /products/:id` for single product retrieval.

## Getting Started

### Prerequisites
- **Node.js**: Version 18.x or higher (recommended: 20.x for NestJS compatibility).
- **npm**: Version 8.x or higher.
- **Docker**: Required for Redis and PostgreSQL via `docker-compose`.

### Installation
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd products_backend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Environment Variables**:
   - Create a `.env` file in the root directory with the following (adjust as needed):
     ```
     PORT=8000
     CORS_ORIGIN=http://localhost:3000
     REDIS_HOST=localhost
     REDIS_PORT=6379
     DATABASE_TYPE=postgres
     DATABASE_HOST=localhost
     DATABASE_PORT=5432
     DATABASE_USERNAME=postgres
     DATABASE_PASSWORD=postgres
     DATABASE_NAME=products_db
     EXCHANGE_RATE_PRIMARY_URL=https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json
     EXCHANGE_RATE_FALLBACK_URL=https://latest.currency-api.pages.dev/v1/currencies/usd.json
     BATCH_SIZE=10000
     JOB_ATTEMPTS=3
     JOB_BACKOFF_DELAY=1000
     CHUNK_SIZE=1000000
     WORKER_CONCURRENCY=8
     IGNORE_INVALID_LINES=false
     LOG_LEVEL=info
     ```

### Running the Application
1. **Development Mode with All Services**:
   ```bash
   npm run start:dev-all
   ```
   - Starts Redis and PostgreSQL via `docker-compose up -d`.
   - Runs TypeORM migrations (`npm run migration:run`).
   - Launches the NestJS app in watch mode (`npm run start:dev`) on `http://localhost:8000`.

2. **Development Mode (App Only)**:
   - Ensure Redis and PostgreSQL are running externally (e.g., via `docker-compose up -d`).
   - Run migrations:
     ```bash
     npm run migration:run
     ```
   - Start the app:
     ```bash
     npm run start:dev
     ```

3. **Production Mode**:
   - Build the app:
     ```bash
     npm run build
     ```
   - Start Redis and PostgreSQL:
     ```bash
     docker-compose up -d
     ```
   - Run migrations:
     ```bash
     npm run migration:run
     ```
   - Start the app:
     ```bash
     npm run start:prod
     ```

### Running Tests
- **Unit and Integration Tests**:
  ```bash
  npm run test
  ```
- **Verbose Output**:
  ```bash
  npm run test -- --verbose
  ```
- **End-to-End Tests**:
  ```bash
  npm run test:e2e
  ```

## Notes
- The backend assumes Redis (`localhost:6379`) and PostgreSQL (`localhost:5432`) are available. Adjust `.env` if using different hosts/ports.
- Ensure the frontend (e.g., `http://localhost:3000`) is running for full integration.
- Large file processing (e.g., 900MB, 205k+ lines) is optimized with streams and BullMQ, but real-time progress requires WebSocket enhancements.
