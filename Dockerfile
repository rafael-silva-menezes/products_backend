# Use Node.js LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Install dependencies required for sqlite3
RUN apk add --no-cache python3 make g++ # Necessário para compilar sqlite3

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

# Start the app
CMD ["npm", "run", "start:dev"]