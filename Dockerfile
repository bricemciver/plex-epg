FROM node:lts-alpine

COPY . .

RUN npm install && npm run build

EXPOSE 3000

ENTRYPOINT ["npm", "run", "start:prod" ]
