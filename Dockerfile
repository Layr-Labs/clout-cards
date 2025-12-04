FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

# Copy Prisma schema and generate Prisma Client
COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

CMD ["npm", "start"]
