FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY index.js ./
COPY routes/ ./routes/
COPY services/ ./services/
COPY public/ ./public/
COPY utils/ ./utils/
COPY Test/ ./Test/

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

CMD ["npx", "pm2-runtime", "start", "index.js", "--name", "runtime_tracker"]
