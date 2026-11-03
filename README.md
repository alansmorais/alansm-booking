# AlanSM Booking

Plataforma SaaS multiempresa de agendamentos para barbearias, salões de beleza e profissionais independentes.

---

## 1. Arquitetura Oficial

O sistema adota oficialmente a infraestrutura **Firebase (Google Cloud)** como backend exclusivo:

- **Firebase Authentication:** Gestão de identidade de operadores, login seguro e fluxo obrigatório de confirmação de e-mail antes da ativação do espaço da empresa.
- **Cloud Firestore:** Armazenamento multi-tenant estritamente isolado sob o caminho `/tenants/{tenantId}/...`, com regras de segurança v2 que impedem leitura/escrita direta pelo navegador em dados operacionais privados e bloqueiam vazamento de dados de clientes (PII).
- **Cloud Functions v2:** Lógica de negócio, autorização por papel (`owner`, `admin`, `staff`), serialização de concorrência com travas diárias (`day-guards`), idempotência por hash de requisição, cálculo de disponibilidade em tempo real e proteção contra abusos.
- **Cloudflare Pages:** Hospedagem estática segura e de alta velocidade para o frontend, com pipeline de preview automatizado a partir da branch `preview`.

> **Nota:** Todos os protótipos antigos baseados em Google Apps Script / Google Sheets foram permanentemente descontinuados e removidos da arquitetura oficial.

---

## 2. Modos de Operação do Frontend

O frontend foi projetado com arquitetura dual-mode fail-safe:

1. **Modo Demonstração (Padrão):**
   - Utilizado em visitas diretas na web ou em ambientes sem emuladores.
   - Apresenta dados fictícios seguros em memória local (`localStorage`) para visualização de layout e usabilidade sem necessidade de credenciais de produção.
2. **Modo Firebase Emulator (Integração Real Local):**
   - Ativado exclusivamente em loopback (`localhost`, `127.0.0.1`, `::1`) com a flag `?firebaseEmulator=1` ou via link público com slug (`?s=slug-da-empresa`).
   - Conecta o frontend aos serviços locais do Firebase Emulator: Auth (9099), Firestore (8080) e Functions (5001).
   - Não embute segredos nem realiza chamadas a serviços externos de produção.

---

## 3. Funcionalidades Implementadas e Validadas

| Módulo | Descrição | Status |
| :--- | :--- | :---: |
| **Autenticação & Onboarding** | Cadastro com e-mail/senha, verificação de e-mail e criação do primeiro tenant. | Concluído e Testado |
| **Isolamento Multi-tenant** | Dados, configurações e catálogo isolados por `tenantId`. Acesso cruzado bloqueado em nível de regras e Functions. | Concluído e Testado |
| **Catálogo de Serviços** | Cadastro, edição e desativação de serviços (duração em minutos, preço em centavos, moeda). | Concluído e Testado |
| **Equipe e Profissionais** | Cadastro de membros da equipe com cor identificadora e gestão de papéis (`owner`, `admin`, `staff`). | Concluído e Testado |
| **Expediente e Pausas** | Horários da empresa e profissionais (até 2 períodos diários), intervalos/almoço, folgas e bloqueios pontuais. | Concluído e Testado |
| **Agenda e Calendário** | Grid semanal interativo com visualização de reservas por profissional, estados (Confirmado/Pendente) e bloqueios. | Concluído e Testado |
| **Gestão de Agendamentos** | Ações de transição de estado (`confirmed`, `completed`, `no_show`) e cancelamento com registro de auditoria. | Concluído e Testado |
| **Página Pública de Reservas** | Link compartilhável (`?s=slug`) que exibe catálogo público, calcula slots livres em tempo real e registra agendamentos. | Concluído e Testado |
| **Concorrência e Anti-Abuse** | Day-guards transacionais para evitar double-booking, rate limiting por telefone e chaves de idempotência. | Concluído e Testado |

---

## 4. Ambiente de Desenvolvimento Local

### Pré-requisitos
- Node.js 20+ (testado em Node 22 e 26).
- Java 21 LTS (para o Firebase Emulator Suite).
- `firebase-tools` CLI (`npm install -g firebase-tools` ou via `npx`).

### Como Iniciar

1. **Compilar as Cloud Functions:**
   ```bash
   npm --prefix functions run build
   ```

2. **Iniciar os Emuladores do Firebase:**
   ```bash
   npx firebase-tools emulators:start --only auth,firestore,functions --project demo-alansm-booking
   ```

3. **Iniciar o Servidor do Frontend:**
   Em outro terminal:
   ```bash
   npx serve public -l 4173
   # ou: python -m http.server 4173 --directory public
   ```

4. **Acessar a Aplicação:**
   - **Painel Administrativo Real:** Abra `http://localhost:4173/?firebaseEmulator=1`.
   - **Página Pública de Agendamento:** Abra `http://localhost:4173/?s=slug-da-empresa` (com emuladores ativos).
   - **Modo Demonstração:** Abra `http://localhost:4173/`.

---

## Comando único de validação do Preview

Depois de clonar o repositório e instalar Node.js (20+) e Java 21, execute na raiz:

```bash
npm run preview:check
```

Esse comando instala as dependências da raiz e das Firebase Functions e executa, em sequência, os testes dos adaptadores, autenticação, onboarding, convites, equipe, verificações de sintaxe do Worker, testes unitários do Worker e compilação das Functions. Ele para no primeiro erro e **não publica nem altera qualquer ambiente**.

A validação das regras Firestore e os testes de integração que dependem dos emuladores continuam disponíveis no workflow do GitHub Actions. O comando único não configura credenciais privadas, não implanta o Worker e não faz deploy em produção.

---

## 5. Testes Automatizados

O repositório conta com uma suíte abrangente de testes automatizados com cobertura ponta a ponta:

```bash
# Executar a suíte de 12 passos E2E no Firebase Emulator
npx firebase-tools emulators:exec --only auth,firestore,functions --project demo-alansm-booking "node --test tests/e2e-12-steps.test.mjs"

# Executar todas as suítes de regras e integração das Cloud Functions
npx firebase-tools emulators:exec --only auth,firestore,functions --project demo-alansm-booking "node --test tests/e2e-12-steps.test.mjs tests/firestore.rules.test.mjs tests/functions.integration.test.mjs"

# Executar testes unitários e de adaptadores sem emulador
node --test tests/firebase-auth-ui.test.mjs tests/firebase-init.test.mjs tests/onboarding-flow.test.mjs tests/team.test.mjs tests/data-adapter.test.mjs tests/auth-adapter.test.mjs tests/firebase-auth-adapter.test.mjs tests/firebase-workspace-adapter.test.mjs tests/invitation-flow.test.mjs tests/invitation-page.test.mjs tests/workspace-adapter.test.mjs
```

### Os 12 Passos Validados End-to-End:
1. **Criar conta (Auth):** Registro via Firebase Auth e confirmação de e-mail.
2. **Criar empresa (Tenant):** Criação atômica do tenant, associação de dono e índice de slug.
3. **Cadastrar serviço:** Adição de serviço com duração, preço e moeda.
4. **Cadastrar profissional:** Adição de profissional com cor e status ativo.
5. **Configurar expediente e pausas:** Configuração semanal com intervalo de almoço e persistência validada.
6. **Criar agendamento:** Reserva administrativa com verificação de horário e idempotência.
7. **Consultar agenda:** Leitura de agendamentos no período de 31 dias.
8. **Cancelar e atualizar status:** Atualização para `confirmed` e posterior cancelamento com auditoria.
9. **Abrir página pública:** Resolução pública do slug e catálogo sem autenticação.
10. **Realizar reserva pública:** Agendamento pelo link público com upsert de cliente e validação de disponibilidade.
11. **Verificar conflitos:** Rejeição de sobreposição exata (`ALREADY_EXISTS`) e bloqueio pontual de agenda.
12. **Isolamento multi-tenant:** Tentativas de acesso cruzado rejeitadas com `PERMISSION_DENIED`.

---

## 6. Implantação e Cloudflare Pages Preview

- **Projeto Cloudflare Pages:** `alansm-booking-preview`
- **Branch Ativa de Preview:** `preview`
- **Branch de Produção:** `main` (deploys desativados por segurança).
- **Variáveis de Ambiente:** Nenhuma variável herdada do Apps Script (`GAS_WEB_APP_URL` e `BOOKING_ADMIN_EMAIL` foram removidas).
- **URL Pública do Preview:**
  [https://preview.alansm-booking-preview.pages.dev](https://preview.alansm-booking-preview.pages.dev)

---

## 7. Critérios para Ativação de Piloto Real / Produção

Para transicionar do ambiente Preview/Emulator para um piloto com usuários e dados reais:
1. **Provisionamento do Projeto Firebase de Staging/Produção:**
   - Criar projeto no Google Cloud / Firebase Console.
   - Configurar Firebase Authentication (provedores de e-mail e templates de verificação).
   - Configurar Cloud Firestore em modo nativo na região pretendida (`southamerica-east1` ou `us-central1`).
   - Fazer deploy das regras (`firebase deploy --only firestore:rules`).
   - Fazer deploy das Cloud Functions (`firebase deploy --only functions`).
2. **Integração de Domínio Próprio e Gateway de Pagamentos:**
   - Apontar domínio definitivo via Cloudflare DNS.
   - Configurar webhooks do gateway (ex.: Stripe ou Mercado Pago) com validação de assinatura criptográfica.
3. **Configuração de Monitoramento e Alertas:**
   - Habilitar Google Cloud Error Reporting e Cloud Logging.
   - Configurar cotas e alertas de faturamento.
