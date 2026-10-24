# Use Microsoft's official Playwright image (includes system dependencies & browsers pre-installed)
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source code
COPY . .

# Expose port
EXPOSE 3000
ENV PORT=3000

# Start application
CMD ["node", "server.js"]
