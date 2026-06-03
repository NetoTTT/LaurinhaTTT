# Design da Memória por Usuário — Debate Aberto

> Documento para debater com múltiplas IAs o formato ideal do `.md` de memória por usuário.
> Ao final, compilar as respostas e trazer para análise final.

---

## Contexto do Projeto

**O que é:** Um assistente WhatsApp chamado Laurinha, com IA local (LM Studio / Gemma) para conversas e Gemini para tarefas pesadas como compactação de memória.

**Como a memória funciona hoje (motor implementado):**
- Cada usuário tem um arquivo `whatsapp_{id}.md` com frontmatter + seções `## `
- A IA pode ler, escrever seções, adicionar notas rápidas e acionar compactação
- Compactação é feita pelo Gemini: recebe o arquivo atual, devolve versão enxuta
- Limite: ~4000 chars por arquivo, ~8 notas pendentes antes de forçar compactação

**Tools disponíveis para a IA:**
- `memory_read` — lê tudo
- `memory_write_section` — substitui uma seção
- `memory_add_note` — nota rápida em "Notas Pendentes"
- `memory_compact` — aciona Gemini para reorganizar

---

## Perguntas para Debate

### 1. Quais seções o `.md` deve ter?

Candidatas levantadas até agora:
- `## Perfil` — quem é a pessoa (personalidade, papel, interesses)
- `## Como Interagir` — tom, estilo, o que evitar, o que funciona
- `## Memórias` — fatos importantes, eventos, preferências
- `## Notas Pendentes` — buffer rotativo de notas brutas a processar

**Perguntas em aberto:**
- Deve ter seção de **humor/estado emocional atual**? Ou isso é volátil demais para memória?
- Deve ter **histórico de comandos/ações** (quais stickers criou, o que pediu)? Ou isso fica só no banco?
- Faz sentido uma seção de **relacionamentos** (quem ele menciona, família, amigos)?
- Deve ter uma seção de **objetivos/contexto de vida** ou é invasivo demais?
- Quanto separar entre o que a IA **observou** vs o que o usuário **disse explicitamente**?

---

### 2. Como a IA deve decidir o que salvar?

**Perguntas em aberto:**
- A IA deve salvar **toda** informação pessoal mencionada ou só o que julgar relevante a longo prazo?
- Como distinguir informação **efêmera** (tô com fome agora) de **permanente** (sou vegetariano)?
- Quando usar `memory_add_note` (rápido, bruto) vs `memory_write_section` (reescreve a seção inteira)?
- A IA deve avisar o usuário quando salvar algo? Ou agir silenciosamente?
- Deve haver **consentimento explícito** do usuário para salvar certas informações?

---

### 3. Ciclo de vida e rotação

**Perguntas em aberto:**
- As `## Memórias` devem ter **data/validade**? Ex: uma memória de 6 meses atrás ainda vale?
- Como priorizar o que fica quando a compactação remove itens?
- A IA deve ter **níveis de importância** para memórias (crítica / normal / efêmera)?
- Deve existir uma seção "arquivada" ou informação velha simplesmente some?
- Com que frequência compactar? A cada N interações? Quando notas > 8? Ambos?

---

### 4. Formato e granularidade

**Perguntas em aberto:**
- Bullet points curtos ou texto corrido por seção?
- Deve ter **timestamps** nas memórias? Ou polui demais?
- O frontmatter deve ter mais campos além de `interactions` e `last_updated`?
  - Ex: `first_seen`, `last_active`, `sentiment_score`, `language`?
- Deve haver um campo de **versão do schema** para migrações futuras?

---

### 5. Privacidade e segurança

**Perguntas em aberto:**
- Que tipos de informação **nunca** devem ser salvos (senhas, dados financeiros, etc.)?
- O usuário deve poder ver/apagar sua memória via comando?
- Deve haver separação entre memória de **grupo** e memória **individual**?

---

## Espaço para Respostas das IAs

### Resposta: [nome da IA / modelo]

> _Cole aqui a resposta de cada IA que você consultar_

---

### Resposta: [nome da IA / modelo]

> _Cole aqui a resposta de cada IA que você consultar_

---

### Resposta: [nome da IA / modelo]

> _Cole aqui a resposta de cada IA que você consultar_

---

## Compilado Final

> _Preencher após coletar todas as respostas_

### Seções decididas
- [ ] A definir

### Regras de uso decididas
- [ ] A definir

### Campos de frontmatter decididos
- [ ] A definir

---

*Criado em 2026-05-30 — trazer compilado para análise final antes de implementar.*
