FROM node:20-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer to use the system-installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Stage dependencies
COPY package*.json ./
RUN npm install

# Pass environment variables to the build stage
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_CLIENT_SECRET

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_SECRET=$VITE_GOOGLE_CLIENT_SECRET

# Copy source and build (Vite build)
COPY . .
RUN npm run build

# Expose the port Railway uses (default is 3000)
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
