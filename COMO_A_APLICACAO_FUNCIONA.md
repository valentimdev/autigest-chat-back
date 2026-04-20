# Como a aplicação funciona

Este projeto é um backend em NestJS para autenticação de usuários e chat em tempo real. Ele combina:

- API HTTP para autenticação e operações de chat
- WebSocket com Socket.IO para eventos em tempo real
- Prisma como camada de acesso a dados
- PostgreSQL como banco relacional
- JWT para autenticação

O fluxo principal é: o usuário cria conta ou faz login, recebe um token JWT, usa esse token nas rotas protegidas e também na conexão WebSocket, entra em uma conversa, envia mensagens e atualiza leituras.

## 1. Stack e organização geral

Os pontos centrais do sistema estão nestes arquivos:

- `src/main.ts`: sobe a aplicação Nest, habilita CORS e validação global
- `src/app.module.ts`: compõe os módulos principais
- `src/prisma/prisma.service.ts`: inicializa o Prisma com PostgreSQL
- `src/auth/*`: registro, login, validação do token e rota `/auth/me`
- `src/users/*`: criação e busca de usuários
- `src/chat/*`: listagem de conversas, mensagens, criação de conversa direta e gateway WebSocket
- `prisma/schema.prisma`: modelo do banco

Hoje o `AppModule` importa:

- `ConfigModule`
- `PrismaModule`
- `UsersModule`
- `AuthModule`
- `ChatModule`

Existe também `src/gateway/*`, mas esse módulo não é importado em `src/app.module.ts`. Na prática, ele está fora do fluxo real da aplicação.

## 2. Inicialização da aplicação

Quando o processo sobe:

1. O Nest cria a aplicação a partir de `AppModule`.
2. O `ConfigModule` carrega variáveis do arquivo `.env`.
3. O `PrismaService` lê `DATABASE_URL`, cria o adapter `PrismaPg` e conecta no banco no `onModuleInit`.
4. O `main.ts` habilita CORS para `http://localhost:8082`.
5. O `main.ts` também ativa um `ValidationPipe` global com:
   - `whitelist: true`
   - `forbidNonWhitelisted: true`
   - `transform: true`
6. A API escuta na porta `process.env.PORT` ou `3000`.

### Efeito prático do ValidationPipe

Todas as rotas HTTP com DTO passam por validação. Isso significa:

- campos extras são rejeitados
- tipos podem ser convertidos quando o DTO usa `@Type(() => Number)`
- payloads inválidos não chegam ao service

## 3. Configuração por ambiente

As variáveis necessárias no estado atual são:

- `DATABASE_URL`: string de conexão com PostgreSQL
- `JWT_SECRET`: segredo usado para assinar e validar JWT
- `PORT`: opcional

O `.env` presente no projeto já define `DATABASE_URL` e `JWT_SECRET`. O `PORT` não está definido ali, então o fallback é `3000`.

## 4. Modelo de dados

O schema Prisma define cinco entidades.

### User

Representa o usuário autenticável.

- `id`
- `username` único
- `password` com hash bcrypt
- timestamps

### Conversation

Representa uma conversa.

- `type`: `DIRECT` ou `GROUP`
- `directKey`: chave única para impedir duplicidade de conversa direta
- timestamps

### ConversationParticipant

Tabela de relação entre usuários e conversas.

- garante quais usuários participam de cada conversa
- tem índice por `userId` e `conversationId`
- impede duplicidade com `@@unique([conversationId, userId])`

### Message

Representa mensagens enviadas em uma conversa.

- pertence a uma `Conversation`
- possui `senderId`
- guarda `content`
- indexa `conversationId + createdAt`

### MessageRead

Representa confirmação de leitura.

- relaciona `messageId` com `userId`
- só permite um registro por usuário por mensagem
- atualiza `readAt` quando a leitura é refeita

## 5. Fluxo de autenticação

O módulo de autenticação usa `JwtModule.registerAsync`, lendo `JWT_SECRET` do ambiente e emitindo tokens com expiração de `1d`.

### 5.1 Registro

Rota: `POST /auth/register`

Fluxo:

1. O controller recebe `RegisterDto`.
2. O `AuthService.register` gera hash da senha com bcrypt e `salt rounds = 10`.
3. O `UsersService.createUser` verifica se o username já existe.
4. Se já existir, lança `ConflictException`.
5. Se não existir, cria o usuário no banco.
6. O `AuthService.signIn` gera um JWT com payload:
   - `sub`: id do usuário
   - `username`
7. A resposta devolve:
   - `accessToken`
   - `username`
   - `userId`

### 5.2 Login

Rota: `POST /auth/login`

Fluxo:

1. O controller recebe `LoginDto`.
2. O `AuthService.authenticate` chama `validateUser`.
3. O `UsersService.findUserByName` busca o usuário por username.
4. O bcrypt compara a senha informada com o hash salvo.
5. Se falhar, retorna `UnauthorizedException`.
6. Se passar, gera o mesmo JWT do fluxo de registro.

### 5.3 Identidade do usuário logado

Rota: `GET /auth/me`

Essa rota usa `AuthGuard`.

O guard:

1. Lê `Authorization`.
2. Exige o formato `Bearer <token>`.
3. Valida o token com `JwtService.verifyAsync`.
4. Injeta em `request.user`:
   - `userId`
   - `username`

Se o token não existir, estiver malformado ou inválido, a requisição falha com `401`.

## 6. Fluxo de usuários

O `UsersService` tem duas responsabilidades principais:

- localizar usuário por `username`
- criar usuário novo

Ele não expõe controller próprio. Hoje ele funciona como serviço interno para autenticação.

## 7. Fluxo HTTP do chat

Todas as rotas de `src/chat/chat.controller.ts` usam `AuthGuard`. Sem JWT válido, o usuário não acessa o chat.

### 7.1 Listar conversas

Rota: `GET /chat/conversations`

Fluxo:

1. O controller pega `request.user.userId`.
2. O service busca conversas em que o usuário aparece em `ConversationParticipant`.
3. Inclui:
   - participantes com `id` e `username`
   - a última mensagem da conversa
4. Ordena por `updatedAt desc`.

Resposta por conversa:

- `id`
- `type`
- `participants`
- `lastMessage`
- `createdAt`
- `updatedAt`

### 7.2 Buscar mensagens de uma conversa

Rota: `GET /chat/conversations/:id/messages?take=20`

Fluxo:

1. O DTO valida `take` entre `1` e `100`.
2. O service chama `ensureConversationAccess`.
3. Esse método verifica se existe `ConversationParticipant` para o par `conversationId + userId`.
4. Se não existir, responde `404 Conversation not found`.
5. Se existir, busca mensagens ordenadas por `createdAt desc`.
6. Aplica o limite `take`.
7. Faz `reverse()` antes de responder para devolver em ordem cronológica crescente.

Cada mensagem retorna:

- `id`
- `content`
- `createdAt`
- `updatedAt`
- `sender.userId`
- `sender.username`

### 7.3 Criar ou recuperar conversa direta

Rota: `POST /chat/conversations`

Payload:

```json
{
  "targetUserId": 2
}
```

Fluxo:

1. O usuário autenticado informa o `targetUserId`.
2. O service impede criar conversa consigo mesmo.
3. O service verifica se o usuário alvo existe.
4. É gerada uma `directKey` ordenando os dois ids, por exemplo `1:5`.
5. O Prisma usa `upsert` por `directKey`.
6. Se a conversa já existir, ela é reutilizada.
7. Se não existir, cria uma conversa `DIRECT` com os dois participantes.

Esse desenho evita conversas diretas duplicadas entre o mesmo par de usuários.

### 7.4 Enviar mensagem via HTTP

Rota: `POST /chat/messages`

Payload:

```json
{
  "conversationId": 10,
  "content": "Olá"
}
```

Fluxo:

1. O DTO valida `conversationId` e `content`.
2. O controller faz `body.content.trim()`.
3. O service valida acesso do usuário à conversa.
4. Dentro de uma transação:
   - cria a mensagem
   - atualiza `conversation.updatedAt` com `new Date()`
5. Retorna a mensagem criada com remetente embutido.

Observação importante:

- o fluxo HTTP apenas persiste e retorna a mensagem
- quem emite eventos em tempo real é o gateway WebSocket

## 8. Fluxo WebSocket do chat

O tempo real está em `src/chat/chat.gateway.ts` usando `@WebSocketGateway()` com Socket.IO.

### 8.1 Autenticação do socket

Quando um cliente conecta:

1. O gateway tenta extrair o token de `socket.handshake.auth.token`.
2. Se não encontrar, tenta `socket.handshake.headers.authorization`.
3. Também exige o padrão `Bearer <token>` no header.
4. O token é validado com `JwtService.verifyAsync`.
5. Se for válido, o gateway salva em `socket.data.user`:
   - `userId`
   - `username`
6. Se falhar, o socket é desconectado.

Isso faz com que o mesmo JWT das rotas HTTP também autentique o canal WebSocket.

### 8.2 Entrar em uma sala de conversa

Evento recebido: `conversation.join`

Payload:

```json
{
  "conversationId": 10
}
```

Fluxo:

1. O payload é validado com `class-transformer` + `class-validator`.
2. O gateway recupera o usuário autenticado do socket.
3. O service verifica se ele participa da conversa.
4. O socket entra na room `conversation:<id>`.
5. O gateway retorna um ack com evento `conversation.joined`.

### 8.3 Sair de uma sala

Evento recebido: `conversation.leave`

Fluxo equivalente ao de entrada, mas chama `socket.leave(room)` e responde com `conversation.left`.

### 8.4 Enviar mensagem via WebSocket

Evento recebido: `message.send`

Payload:

```json
{
  "conversationId": 10,
  "content": "Olá"
}
```

Fluxo:

1. O payload é validado.
2. O usuário autenticado é lido do socket.
3. O gateway chama `chatService.createMessage`.
4. O service persiste a mensagem e atualiza `updatedAt` da conversa.
5. O gateway emite `message.created` para toda a room `conversation:<id>`.
6. O gateway também devolve um ack com o mesmo evento e payload.

Resultado: todos os sockets conectados naquela conversa recebem a nova mensagem em tempo real.

### 8.5 Marcar mensagem como lida

Evento recebido: `message.read`

Payload:

```json
{
  "conversationId": 10,
  "messageId": 99
}
```

Fluxo:

1. O payload é validado.
2. O service confirma que o usuário participa da conversa.
3. O service verifica se a mensagem existe e pertence à conversa informada.
4. O Prisma faz `upsert` em `MessageRead`.
5. Se já havia leitura, atualiza `readAt`.
6. O gateway emite `message.read.updated` para a room.

Isso permite que os participantes recebam recibos de leitura em tempo real.

## 9. Regras de autorização no chat

A proteção do chat não depende só do token válido. O backend também valida se o usuário pertence à conversa.

Isso acontece em:

- listagem de mensagens
- envio de mensagem
- entrada em room WebSocket
- saída de room WebSocket
- marcação de leitura

A validação central está em `ensureConversationAccess`. Se o usuário não pertence à conversa, o backend responde como se a conversa não existisse para ele.

## 10. Formato geral dos dados no fluxo principal

### Cadastro/login

Saída:

```json
{
  "accessToken": "jwt",
  "username": "alice",
  "userId": 1
}
```

### Usuário autenticado

Header HTTP:

```http
Authorization: Bearer <jwt>
```

Handshake Socket.IO, opção 1:

```json
{
  "auth": {
    "token": "<jwt>"
  }
}
```

Handshake Socket.IO, opção 2:

```http
Authorization: Bearer <jwt>
```

### Exemplo de fluxo completo do cliente

1. Faz `POST /auth/register` ou `POST /auth/login`.
2. Salva o `accessToken`.
3. Usa o token em `GET /chat/conversations`.
4. Cria ou recupera uma conversa em `POST /chat/conversations`.
5. Conecta no Socket.IO com o mesmo token.
6. Emite `conversation.join` com o id da conversa.
7. Busca histórico via `GET /chat/conversations/:id/messages`.
8. Envia mensagens via `message.send` ou `POST /chat/messages`.
9. Ao visualizar a mensagem, emite `message.read`.

## 11. Banco, migrations e Prisma

O projeto já possui duas migrations:

- criação inicial de usuários, conversas, participantes e mensagens
- criação da tabela `MessageRead`

Os comandos principais em `package.json` são:

- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:push`

O Prisma Client é gerado a partir de `prisma/schema.prisma`.

## 12. Docker e execução local

### Execução local

Fluxo esperado:

1. subir PostgreSQL
2. instalar dependências
3. gerar Prisma Client
4. aplicar schema/migrations
5. subir o NestJS

Comandos:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

### Dockerfile

O `Dockerfile` faz build em duas etapas:

1. `builder`
   - instala dependências
   - gera Prisma Client
   - compila a aplicação
2. `runner`
   - copia `dist`, `node_modules`, `prisma` e `package.json`
   - expõe a porta `3000`
   - executa `npm run start:prod`

### docker-compose atual

Hoje o `docker-compose.yml` sobe apenas o PostgreSQL. O serviço da aplicação está comentado.

Também há uma inconsistência de configuração:

- o container define `POSTGRES_DB: nest-auth-template`
- mas o healthcheck usa `-d chat_autigest`
- e o `.env` local também aponta para `chat_autigest`

Ou seja, o compose precisa ser alinhado antes de ser considerado a forma oficial de subida completa do ambiente.

## 13. Resposta raiz da API

Existe uma rota simples:

- `GET /`

Ela retorna `"Hello World!"` e hoje funciona só como endpoint básico de verificação.

## 14. Limitações e pontos importantes do estado atual

- O enum `ConversationType` prevê `GROUP`, mas não existe fluxo implementado para criação de grupos.
- Não há paginação por cursor nas mensagens; existe apenas limite por `take`.
- A rota HTTP de envio de mensagem não emite eventos em tempo real por conta própria.
- O gateway legado em `src/gateway` não participa da aplicação atual.
- O CORS está fixo em `http://localhost:8082`.
- Não há módulo específico para busca/listagem pública de usuários.

## 15. Resumo da arquitetura

Em termos práticos, o sistema funciona assim:

1. O NestJS sobe e conecta no PostgreSQL via Prisma.
2. O usuário se autentica e recebe um JWT.
3. O JWT protege as rotas HTTP e a conexão WebSocket.
4. Conversas são controladas por participantes.
5. Mensagens só podem ser vistas ou criadas por quem participa da conversa.
6. O histórico é buscado por HTTP.
7. O tempo real acontece por rooms do Socket.IO.
8. Leituras são persistidas em `MessageRead` e propagadas via evento.

Se você quiser, no próximo passo eu posso transformar este documento em um `README` mais executivo, ou gerar uma segunda versão com diagramas de sequência e arquitetura.
