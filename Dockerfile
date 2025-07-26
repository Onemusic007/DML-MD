FROM node:lts-buster

# Clone the repo correctly
RUN git clone https://github.com/Onemusic007/DML-MD.git Groq

# Set working directory
WORKDIR /Groq

# Install dependencies
RUN npm install -g pm2 || yarn install --network-concurrency 1

RUN npm install mongoose dotenv

# Copy additional files (optional – often not needed after cloning repo)
COPY . .

# Keep a dummy server alive for Koyeb health check
EXPOSE 3000

CMD ["pm2-runtime", "index.js"]
