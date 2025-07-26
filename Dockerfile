FROM node:lts-buster

# Install PM2 globally
RUN npm install -g pm2

# Clone the repo directly
RUN git clone https://github.com/Onemusic007/DML-MD.git /Groq

# Set working directory
WORKDIR /Groq

# Install dependencies
RUN npm install

# Optional: if you use yarn instead of npm
# RUN yarn install --network-concurrency 1

# Expose dummy HTTP port to keep Koyeb container alive
EXPOSE 3000

# Start the bot using PM2 runtime
CMD ["pm2-runtime", "index.js"]
