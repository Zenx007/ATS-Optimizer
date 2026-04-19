# ATS Optimizer

Sistema web completo para otimização de currículo com foco em ATS.

Fluxo implementado:
1. Upload do currículo em PDF.
2. Conversão `PDF -> HTML` e armazenamento local.
3. Envio do HTML original + descrição da vaga + dados imutáveis para Gemini.
4. Recebimento de HTML otimizado.
5. Conversão `HTML -> PDF`.
6. Preview do HTML otimizado e download do PDF final.

## Estrutura do projeto

- `api/`: back-end em NestJS
- `front/`: front-end em React (Vite)

## Requisitos

- Node.js 20+
- npm 10+
- Chave da Gemini (`GEMINI_API_KEY`)
- `pdf2htmlEX` instalado no sistema (usado para conversão `PDF -> HTML`)

## 1) Configuração do back-end (NestJS)

```bash
cd api
cp .env.example .env
npm install
npm run start:dev
```

### Variáveis de ambiente (API)

Arquivo: `api/.env`

- `PORT`: porta da API (padrão: `3000`)
- `GEMINI_API_KEY`: chave da Gemini
- `GEMINI_MODEL`: modelo da Gemini (padrão no código: `gemini-2.0-flash`)
- `FRONTEND_URL`: URL do front para CORS (padrão: `http://localhost:5173`)
- `PDF2HTMLEX_BIN`: caminho/nome do binário do `pdf2htmlEX` (padrão: `pdf2htmlEX`)

### Observação sobre geração de PDF

A API usa:
- `pdf2htmlEX` para converter PDF em HTML com alta fidelidade visual.
- `puppeteer` para converter HTML em PDF. Em alguns ambientes Linux, pode ser necessário instalar dependências de sistema do Chromium.

## 2) Configuração do front-end (React)

```bash
cd front
cp .env.example .env
npm install
npm run dev
```

### Variáveis de ambiente (Front)

Arquivo: `front/.env`

- `VITE_API_BASE_URL`: URL da API (padrão: `http://localhost:3000`)

## Endpoints da API

Base URL: `http://localhost:3000`

1. `POST /resumes/upload`
- Upload do PDF (`multipart/form-data`, campo `file`)
- Converte PDF para HTML
- Salva `original.pdf`, `original.html` e `metadata.json`

2. `POST /resumes/:id/convert-pdf-to-html`
- Reconverte o PDF original para HTML

3. `POST /resumes/:id/optimize`
- Body JSON:

```json
{
  "jobDescription": "Descrição da vaga...",
  "immutableData": "Nome, telefone, e-mail, LinkedIn..."
}
```

- Chama Gemini e salva `optimized.html`

4. `POST /resumes/:id/generate-pdf`
- Converte `optimized.html` para `optimized.pdf`

5. `GET /resumes/:id/optimized-html`
- Retorna o HTML otimizado salvo

6. `GET /resumes/:id/download-pdf`
- Download do PDF final otimizado

## Armazenamento local

Cada currículo fica em:

`api/storage/resumes/<resumeId>/`

Arquivos salvos:
- `original.pdf`
- `original.html`
- `optimized.html` (após otimização)
- `optimized.pdf` (após geração)
- `metadata.json` (descrição da vaga, restrições e metadados)

## Prompt interno enviado para Gemini

O prompt foi implementado no serviço `src/gemini/gemini.service.ts` e segue as regras solicitadas:
- usar HTML original + vaga + dados imutáveis
- otimizar para ATS sem inventar experiência
- preservar dados bloqueados
- retornar **somente HTML final** (sem markdown, sem explicações)

## Melhor estratégia prática adotada para conversões

- `PDF -> HTML`: conversão com `pdf2htmlEX`, priorizando fidelidade ao layout original (fontes, espaçamento e posicionamento).
- `HTML -> PDF`: renderização com `puppeteer` para obter PDF final fiel ao HTML otimizado.

## Fluxo de uso no front

1. Selecionar PDF e clicar em **Enviar e converter PDF**.
2. Informar descrição da vaga.
3. Informar dados que não podem ser alterados.
4. Clicar em **Otimizar currículo para ATS**.
5. Visualizar preview HTML.
6. Baixar PDF otimizado.

## Próximas evoluções sugeridas

- Persistência em banco (PostgreSQL + Prisma/TypeORM).
- Autenticação de usuários.
- Histórico de versões de currículo otimizado.
- Sanitização/normalização avançada de HTML.
- Observabilidade (logs estruturados e métricas).
