FROM node:lts-buster

# Clone the repo
RUN git clone https://github.com/Onemusic007/DML-MD.git Groq

# Set working directory
WORKDIR /Groq

# Install dependencies including express
RUN npm install -g pm2 && npm install express && npm install || yarn install --network-concurrency 1

# Copy additional files
COPY . .

# Expose port for express health check
EXPOSE 3000

CMD ["pm2-runtime", "index.js"]
