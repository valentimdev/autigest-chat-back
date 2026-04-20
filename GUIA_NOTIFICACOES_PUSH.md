# Guia De Notificacoes Push Entre Usuarios

Este arquivo explica como implementar notificacoes push no seu projeto atual:

- backend: `chat-back` com `NestJS + Prisma`
- frontend mobile: `../chat-front` com `Expo + React Native`

O objetivo e este:

1. um usuario faz login no app
2. o app registra o celular dele no backend
3. esse registro salva um `push token`
4. outro usuario clica em um botao
5. o frontend envia o `userId` do destinatario para uma rota protegida
6. o backend encontra o token do usuario de destino
7. o backend envia a notificacao para o celular dele

Esse fluxo e o mais importante de entender. Se essa parte estiver clara, o resto e implementacao.

---

## 1. O que e uma notificacao push

Uma notificacao push e uma mensagem enviada para o aparelho do usuario mesmo quando ele nao esta com a tela do chat aberta.

No seu caso, o fluxo real nao e:

- usuario A envia direto para o celular do usuario B

O fluxo real e:

- usuario A chama o seu backend
- o seu backend decide quem deve receber
- o backend envia a notificacao para um servico de push
- esse servico entrega a notificacao no celular do usuario B

No ecossistema Expo, a forma mais simples de comecar e usar:

- `expo-notifications` no app
- `Expo Push Service` para o envio

Isso simplifica bastante o processo para quem esta aprendendo.

---

## 2. Como isso se encaixa no seu projeto atual

Hoje o seu projeto tem esta estrutura relevante:

- backend: `src/chat/chat.controller.ts`
- backend: `src/chat/chat.service.ts`
- backend: `prisma/schema.prisma`
- frontend: `../chat-front/app/index.tsx`
- frontend: `../chat-front/app.json`

Hoje o frontend ja faz:

- login
- criar conversa
- listar conversas
- enviar mensagem

Hoje o backend ja tem:

- autenticacao por JWT
- guard de autenticacao
- fluxo de chat entre usuarios

Entao a parte de notificacao entra por cima de uma base que voce ja tem.

Voce nao precisa reconstruir o projeto. Voce precisa adicionar:

1. uma forma de salvar o token do dispositivo
2. uma rota para registrar esse token
3. uma rota ou regra de negocio para enviar a notificacao
4. a captura de permissao no app
5. a obtencao do token no app
6. o envio desse token para o backend

---

## 3. Arquitetura recomendada

Para o seu caso, a arquitetura mais didatica e tambem pratica e esta:

### Frontend

O app React Native:

1. pede permissao para notificacoes
2. gera ou obtem o Expo Push Token
3. envia esse token para o backend autenticado
4. quando o usuario clicar em um botao, chama uma rota protegida

### Backend

O NestJS:

1. recebe o token e salva no banco ligado ao usuario logado
2. recebe um pedido de envio para outro usuario
3. procura todos os tokens ativos do usuario de destino
4. envia a notificacao via Expo Push API

### Banco

O banco precisa de uma tabela nova para guardar tokens por usuario.

Isso e importante porque:

- um usuario pode trocar de celular
- um usuario pode estar logado em mais de um aparelho
- um token pode expirar
- voce nao quer guardar token solto no frontend sem persistencia

---

## 4. Modelo mental correto

Muita gente no inicio pensa assim:

- "eu tenho o `userId`, entao consigo mandar notificacao"

Mas so o `userId` nao envia nada.

O `userId` serve para identificar **quem** deve receber.
Quem realmente permite o envio e o `push token` do dispositivo.

Entao:

- `userId` identifica o dono
- `push token` identifica o aparelho/app

O backend recebe o `userId`, busca os tokens salvos daquele usuario e usa esses tokens para enviar a notificacao.

---

## 5. Fluxo completo do inicio ao fim

### Passo 1. Usuario instala e abre o app

O app pede permissao de notificacao ao sistema operacional.

### Passo 2. O app obtem o token

Se a permissao for concedida, o app gera um token parecido com isso:

```txt
ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
```

### Passo 3. O app envia esse token para o backend

Exemplo conceitual:

```http
POST /notifications/device-token
Authorization: Bearer <jwt>
Content-Type: application/json
```

Body:

```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android"
}
```

### Passo 4. O backend salva esse token no banco

O token fica associado ao usuario autenticado.

### Passo 5. Outro usuario clica em um botao

Exemplo:

- usuario A quer notificar usuario B
- o frontend envia `targetUserId: 2`

### Passo 6. O backend busca os tokens do usuario B

Se o usuario B tiver token salvo, o backend envia a notificacao.

### Passo 7. O celular do usuario B recebe a notificacao

Isso pode acontecer:

- com o app fechado
- com o app em background
- com o app aberto

O comportamento visual depende da plataforma e de como voce configurar os listeners.

---

## 6. O que voce precisa adicionar no banco

Hoje o seu `prisma/schema.prisma` nao tem tabela para token de notificacao. O ideal e criar algo assim:

```prisma
model PushToken {
  id        Int      @id @default(autoincrement())
  userId    Int
  token     String   @unique
  platform  String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lastUsedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, isActive])
}
```

E no model `User`:

```prisma
pushTokens PushToken[]
```

### Por que esse model e importante

Cada linha representa um dispositivo que pode receber notificacao.

Campos importantes:

- `userId`: dono do token
- `token`: token real do Expo
- `platform`: `android` ou `ios`
- `isActive`: permite desativar token invalido sem apagar historico
- `lastUsedAt`: ajuda a diagnosticar se o token ainda esta sendo usado

---

## 7. Rotas recomendadas

Para aprender bem, eu sugiro separar em duas responsabilidades.

### Rota 1. Registrar token do dispositivo

```http
POST /notifications/device-token
```

Responsabilidade:

- receber o token do aparelho do usuario logado
- salvar ou atualizar no banco

### Rota 2. Enviar notificacao para outro usuario

```http
POST /notifications/send-to-user
```

Responsabilidade:

- receber o `targetUserId`
- buscar tokens do usuario de destino
- enviar a notificacao

Mais para frente, voce pode parar de expor essa segunda rota para a UI e disparar automaticamente quando uma mensagem for criada. Mas para aprender, essa rota manual e excelente.

---

## 8. DTOs que fazem sentido no Nest

### `register-push-token.dto.ts`

```ts
import { IsIn, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
```

### `send-push-to-user.dto.ts`

```ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SendPushToUserDto {
  @IsInt()
  @Min(1)
  targetUserId: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
```

Esses DTOs combinam com a forma como seu projeto atual ja usa `class-validator` e `ValidationPipe`.

---

## 9. Estrutura de arquivos sugerida no backend

No `chat-back`, eu criaria um modulo separado:

- `src/notifications/notifications.module.ts`
- `src/notifications/notifications.controller.ts`
- `src/notifications/notifications.service.ts`
- `src/notifications/dto/register-push-token.dto.ts`
- `src/notifications/dto/send-push-to-user.dto.ts`

Separar isso do `chat` ajuda porque notificacao e uma responsabilidade propria.

Se um dia voce trocar Expo por Firebase/APNs direto, esse isolamento fica valioso.

---

## 10. Exemplo de controller

Exemplo conceitual para o seu Nest:

```ts
import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendPushToUserDto } from './dto/send-push-to-user.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AuthGuard)
  @Post('device-token')
  registerDeviceToken(@Request() request, @Body() body: RegisterPushTokenDto) {
    return this.notificationsService.registerDeviceToken(
      request.user.userId,
      body.token,
      body.platform,
    );
  }

  @UseGuards(AuthGuard)
  @Post('send-to-user')
  sendToUser(@Request() request, @Body() body: SendPushToUserDto) {
    return this.notificationsService.sendToUser({
      senderUserId: request.user.userId,
      targetUserId: body.targetUserId,
      title: body.title ?? 'Nova notificacao',
      body: body.body ?? 'Voce recebeu uma notificacao',
    });
  }
}
```

### O que esse controller faz

- usa o mesmo `AuthGuard` que o resto do projeto
- pega o usuario logado via JWT
- nao confia no frontend para dizer quem esta enviando
- usa o backend para decidir a logica real

Isso e correto do ponto de vista de seguranca.

---

## 11. Exemplo de service no backend

### Registrar token

O metodo de registro deve:

1. procurar se o token ja existe
2. se existir, atualizar o `userId`, `platform`, `isActive`
3. se nao existir, criar

Exemplo:

```ts
async registerDeviceToken(userId: number, token: string, platform: 'android' | 'ios') {
  const pushToken = await this.prisma.pushToken.upsert({
    where: { token },
    update: {
      userId,
      platform,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      token,
      platform,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });

  return {
    id: pushToken.id,
    token: pushToken.token,
    platform: pushToken.platform,
    isActive: pushToken.isActive,
  };
}
```

### Enviar para outro usuario

Esse metodo deve:

1. verificar se o usuario destino existe
2. buscar tokens ativos dele
3. montar o payload para a Expo
4. enviar via HTTP
5. tratar tokens invalidos

Exemplo conceitual:

```ts
async sendToUser(input: {
  senderUserId: number;
  targetUserId: number;
  title: string;
  body: string;
}) {
  const tokens = await this.prisma.pushToken.findMany({
    where: {
      userId: input.targetUserId,
      isActive: true,
    },
    select: {
      id: true,
      token: true,
    },
  });

  if (tokens.length === 0) {
    return {
      success: false,
      message: 'Usuario de destino nao possui token registrado',
    };
  }

  const messages = tokens.map((item) => ({
    to: item.token,
    sound: 'default',
    title: input.title,
    body: input.body,
    data: {
      senderUserId: input.senderUserId,
      targetUserId: input.targetUserId,
    },
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const result = await response.json();

  return {
    success: true,
    sentCount: tokens.length,
    expoResult: result,
  };
}
```

### Observacao importante

No seu backend atual nao existe dependencia para envio HTTP dedicada. Como o Node moderno ja possui `fetch`, esse caminho pode funcionar sem adicionar biblioteca extra, desde que sua versao de runtime suporte isso.

Se preferir, depois voce pode trocar por `axios`.

---

## 12. Como invalidar tokens ruins

Nem todo token continua valido para sempre.

Exemplos:

- app desinstalado
- token expirado
- usuario limpou dados
- dispositivo mudou

Por isso, quando a Expo responder que um token esta invalido, o backend deve marcar esse token como inativo.

Em vez de apagar direto, prefira:

- `isActive = false`

Isso ajuda a auditar problemas depois.

---

## 13. Instalacao no frontend Expo

No `../chat-front`, voce vai precisar instalar:

```bash
npx expo install expo-notifications expo-device
```

Em muitos casos tambem e util:

```bash
npx expo install expo-constants
```

No seu projeto, `expo-constants` ja existe.

---

## 14. Ajustes no `app.json`

Voce precisa adicionar o plugin de notificacoes.

Hoje o seu `../chat-front/app.json` ainda nao mostra `expo-notifications`.

Um formato comum seria algo assim:

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-notifications",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff",
          "dark": {
            "backgroundColor": "#000000"
          }
        }
      ]
    ]
  }
}
```

### Android

No Android geralmente tambem se configura um canal:

```ts
await Notifications.setNotificationChannelAsync('default', {
  name: 'default',
  importance: Notifications.AndroidImportance.MAX,
});
```

Sem isso, em Android o comportamento pode nao ficar como voce espera.

---

## 15. Onde colocar a logica no seu frontend atual

Como hoje seu app funcional esta quase todo concentrado em `../chat-front/app/index.tsx`, o jeito mais simples de aprender e implementar primeiro nesse arquivo mesmo.

Depois, se quiser, voce extrai para:

- `services/notifications.ts`
- `hooks/use-push-notifications.ts`

Mas para o primeiro aprendizado, pode começar dentro de `app/index.tsx`.

---

## 16. Fluxo no frontend apos login

O melhor momento para registrar o token e quando o usuario ja estiver autenticado.

Motivo:

- a rota de registro deve ser protegida
- voce quer ligar o token ao usuario certo

Entao o fluxo fica assim:

1. usuario faz login
2. `auth` recebe `accessToken` e `userId`
3. um `useEffect` detecta isso
4. o app pede permissao
5. obtem o token
6. envia para `POST /notifications/device-token`

---

## 17. Exemplo de codigo no frontend para obter o token

Exemplo didatico:

```ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
```

Funcao:

```ts
async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    throw new Error('Push notification exige dispositivo fisico.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Permissao de notificacao nao concedida.');
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Nao foi possivel encontrar o projectId do Expo/EAS.');
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenResponse.data;
}
```

### O que essa funcao faz

- garante que nao esta num simulador inadequado
- cria canal no Android
- pede permissao
- pega o token do Expo

---

## 18. Como enviar o token para o backend

No seu `app/index.tsx`, voce ja tem uma funcao `request` que envia JWT automaticamente. Isso e excelente porque a nova rota encaixa bem nela.

Exemplo:

```ts
async function syncPushToken() {
  const token = await registerForPushNotificationsAsync();

  await request('/notifications/device-token', {
    method: 'POST',
    body: JSON.stringify({
      token,
      platform: Platform.OS,
    }),
  });
}
```

Depois voce chama isso quando `auth` estiver preenchido:

```ts
useEffect(() => {
  if (!auth) {
    return;
  }

  void syncPushToken().catch((error) => {
    console.error('Falha ao registrar push token', error);
  });
}, [auth]);
```

---

## 19. Como seria o botao para um usuario notificar outro

Voce disse que quer algo assim:

- clicar em um botao
- informar o `userId`
- enviar notificacao para o celular do outro usuario

No seu frontend atual isso pode ficar perto do fluxo em que voce ja digita `targetUserId`.

Exemplo conceitual:

```ts
async function handleSendNotification() {
  const parsedUserId = Number(targetUserId);

  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    setErrorMessage('Informe um user id valido.');
    return;
  }

  await request('/notifications/send-to-user', {
    method: 'POST',
    body: JSON.stringify({
      targetUserId: parsedUserId,
      title: 'Novo aviso',
      body: `O usuario ${auth?.username} enviou uma notificacao para voce.`,
    }),
  });
}
```

Depois isso pode ser ligado a um `Pressable`.

---

## 20. Como ouvir notificacoes no app

Receber push nao e so enviar. O app tambem pode reagir quando a notificacao chega.

No Expo, voce pode configurar um handler:

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

Tambem pode escutar eventos:

```ts
useEffect(() => {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notificacao recebida com app aberto', notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Usuario tocou na notificacao', response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}, []);
```

### Diferenca importante

- `addNotificationReceivedListener`: dispara quando a notificacao chega com app aberto
- `addNotificationResponseReceivedListener`: dispara quando o usuario toca na notificacao

Isso e importante para, por exemplo, abrir uma conversa especifica.

---

## 21. Melhor evolucao para o seu chat

Depois que o fluxo manual estiver funcionando, a evolucao natural e esta:

- parar de depender de um botao separado
- enviar notificacao automaticamente ao criar uma mensagem

No seu backend atual, o ponto ideal para isso e dentro de:

- `src/chat/chat.service.ts`
- metodo `createMessage(...)`

O fluxo seria:

1. usuario envia mensagem
2. `createMessage` salva no banco
3. backend identifica os participantes da conversa, exceto o remetente
4. backend envia push para eles

Isso e mais proximo de um chat real.

Mas para aprender, eu recomendo esta ordem:

1. primeiro fazer rota manual `send-to-user`
2. validar com um botao
3. depois automatizar no envio de mensagem

---

## 22. Seguranca e regras importantes

### Regra 1. Nunca confiar no frontend para dizer quem e o remetente

O remetente deve vir do JWT:

- `request.user.userId`

Nao do body.

### Regra 2. O backend deve validar o destino

Se quiser endurecer a regra, voce pode permitir envio apenas para:

- usuarios que tenham conversa com o remetente
- contatos validos
- membros da mesma conversa

### Regra 3. Tokens devem ser tratados como dados sensiveis

Eles nao sao senha, mas tambem nao devem ficar sendo expostos em logs sem necessidade.

### Regra 4. O envio deve ser feito no backend

O frontend nao deve falar diretamente com a API da Expo para notificar outro usuario. Isso quebraria seguranca e arquitetura.

---

## 23. Ambiente de teste

Para notificacao push, existem alguns detalhes que costumam travar iniciantes:

### Dispositivo fisico

Geralmente push precisa de dispositivo fisico para validar direito. Emulador e simulador costumam ter limitacoes.

### Expo Go x build real

Dependendo do fluxo e da versao do SDK, notificacoes podem exigir configuracoes especificas ou build de desenvolvimento.

### `projectId`

O `getExpoPushTokenAsync` precisa do `projectId` correto do Expo/EAS.

Se esse campo nao estiver configurado, o token pode nao ser gerado.

---

## 24. Passo a passo pratico de implementacao

Aqui esta a sequencia mais segura para voce executar sem se perder.

### Fase 1. Banco

1. adicionar model `PushToken` no `prisma/schema.prisma`
2. relacionar com `User`
3. gerar migration
4. aplicar migration

### Fase 2. Backend

1. criar modulo `notifications`
2. criar DTO de registro de token
3. criar DTO de envio para usuario
4. criar controller com duas rotas protegidas
5. criar service com `registerDeviceToken`
6. criar service com `sendToUser`
7. integrar modulo no `src/app.module.ts`

### Fase 3. Frontend

1. instalar `expo-notifications` e `expo-device`
2. configurar plugin no `app.json`
3. criar funcao para pedir permissao e obter token
4. apos login, enviar token ao backend
5. criar botao para chamar `/notifications/send-to-user`
6. adicionar listeners para debug e aprendizagem

### Fase 4. Teste

1. logar com usuario A num celular
2. logar com usuario B em outro celular
3. garantir que ambos registraram token
4. no usuario A, informar `userId` do usuario B
5. tocar no botao
6. verificar se usuario B recebeu a notificacao

---

## 25. Exemplo de payload da notificacao

Um bom payload inicial e:

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "sound": "default",
  "title": "Nova mensagem",
  "body": "Joao enviou uma mensagem para voce",
  "data": {
    "type": "chat_message",
    "conversationId": 12,
    "senderUserId": 5
  }
}
```

### Por que o campo `data` e valioso

Porque ele permite que, ao tocar na notificacao, o app saiba:

- qual conversa abrir
- quem enviou
- qual tipo de acao deve fazer

Esse campo e essencial em apps reais.

---

## 26. Possiveis erros comuns

### Erro 1. Permissao negada

O usuario negou notificacoes. Nesse caso o app nao recebe token valido.

### Erro 2. Token nao registrado no backend

O app obteve o token, mas voce esqueceu de chamar a rota para salvar.

### Erro 3. `projectId` ausente

O Expo nao consegue gerar o token corretamente.

### Erro 4. Testando apenas em simulador

Muitos testes de push falham por isso.

### Erro 5. Backend aceita qualquer envio sem regra

Funciona tecnicamente, mas pode abrir abuso. Depois vale colocar restricoes.

---

## 27. Caminho minimo para o seu objetivo imediato

Se o seu foco agora e apenas aprender e ver funcionando, faca exatamente isto:

1. criar tabela `PushToken`
2. criar `POST /notifications/device-token`
3. criar `POST /notifications/send-to-user`
4. no `chat-front`, pedir permissao e obter token apos login
5. enviar token para o backend
6. criar botao para chamar `send-to-user` com `targetUserId`

Com isso, voce ja consegue:

- clicar num botao
- informar o `userId`
- mandar notificacao para o outro celular

Isso atende exatamente ao que voce descreveu.

---

## 28. Caminho ideal depois disso

Quando essa primeira versao estiver pronta, a versao mais correta para o seu chat e:

- registrar token no login
- disparar notificacao automaticamente no `createMessage`

Ou seja, em vez de um botao exclusivo para "notificar", a propria mensagem gera a notificacao.

Isso transforma a funcionalidade em algo de chat real.

---

## 29. Resumo final

O conceito principal que voce precisa guardar e este:

- o frontend obtém permissao e token
- o backend salva esse token por usuario
- o botao envia apenas o `targetUserId`
- o backend usa esse `userId` para encontrar os tokens do destinatario
- o backend chama a API de push
- o celular do outro usuario recebe a notificacao

Se voce entender essa relacao entre `userId` e `push token`, voce entendeu a base inteira do sistema.

---

## 30. Proxima implementacao recomendada

Se quiser, o proximo passo ideal e eu transformar este guia em codigo real do seu projeto, criando:

- a migration Prisma
- o modulo `notifications` no Nest
- as rotas de registro e envio
- e o fluxo no `../chat-front/app/index.tsx`

Esse seria o caminho natural depois deste documento.
