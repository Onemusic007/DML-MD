FROM node:lts-buster

# Clone the repo correctly
RUN git clone https://github.com/Onemusic007/DML-MD.git Groq

# Set working directory
WORKDIR /Groq

# Install dependencies
RUN npm install && npm install -g pm2 || yarn install --network-concurrency 1

RUN npm install mongoose dotenv

# Copy additional files (optional – often not needed after cloning repo)
COPY . .

# Expose port
EXPOSE 9090

# Start the app
CMD ["npm", "start"]

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
