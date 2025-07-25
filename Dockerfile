FROM node:lts-buster
RUN git clone Groq
WORKDIR /root/Groq
RUN npm install && npm install -g pm2 || yarn install --network-concurrency 1
COPY . .
EXPOSE 9090
CMD ["npm", "start"]
