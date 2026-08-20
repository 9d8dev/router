FROM node:24-alpine

WORKDIR /user/app

RUN apk add --no-cache make gcc g++ python3

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run db:generate

EXPOSE 3000

CMD ["pnpm","run","docker-dev"]
