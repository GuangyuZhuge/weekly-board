FROM node:22-alpine

WORKDIR /app

COPY index.html styles.css app.js server.js README.md ./
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
