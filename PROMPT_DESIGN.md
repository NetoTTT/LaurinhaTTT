# Design do Prompt do Sistema — Debate Aberto

> Documento para debater com múltiplas IAs como o system prompt da Laura deve ser estruturado.
> Complementa o MEMORY_DESIGN.md — assume que o schema de memória já está definido.

---

## Contexto do Projeto

**Quem é a Laura:**
- Assistente WhatsApp com IA local (LM Studio / Gemma) para conversas
- Gemini para tarefas pesadas (compactação de memória)
- Cada usuário tem um `.md` de memória com: Perfil, Como Interagir, Relacionamentos, Contexto Atual, Memórias, Notas Pendentes

**Como o prompt será usado:**
- Injetado como `system` no início de cada chamada ao modelo
- A memória do usuário é injetada junto (provavelmente após o system prompt)
- O modelo tem acesso a tools de memória + tools de sticker + (futuras) outras tools
- Contexto: últimas N mensagens do chat (histórico do banco)

**Importante — arquitetura de personalidade:**
- Nome padrão: Laura
- Personalidade inicial: neutra/adaptável
- Com o tempo: tom, estilo e até o nome se moldam ao usuário
- Grupos: a Laura interage com múltiplos usuários e pode capturar informações sobre terceiros via @menção

---

## Perguntas para Debate

### 1. Estrutura geral do prompt

**Perguntas em aberto:**
- Qual deve ser a ordem das seções no prompt? (identidade → regras → memória → tools → contexto?)
- Quanto do prompt deve ser fixo vs dinâmico (preenchido em runtime)?
- O prompt deve ter "persona" explícita ou deixar emergir da memória?
- Deve existir uma seção de "limitações" explícitas no prompt (o que nunca fazer)?
- Como referenciar a memória dentro do prompt sem repetir informação?

---

### 2. Personalidade neutra e moldável

A Laura começa neutra e evolui com cada usuário. Isso cria tensões interessantes:

**Perguntas em aberto:**
- Como definir "neutro" sem ser robótico? Qual o piso mínimo de personalidade?
- O prompt deve descrever a personalidade *atual* (lida da memória `## Como Interagir`) ou deve dizer ao modelo como *construir* personalidade ao longo do tempo?
- Como o modelo sabe que deve adaptar o tom? Isso deve estar explícito no prompt?
- Deve haver limites para a adaptação? (ex: mesmo que o usuário prefira linguagem muito informal/palavrão, há um limite?)
- Como equilibrar consistência (parece a mesma IA) com adaptabilidade (parece que conhece o usuário)?

---

### 3. Nome dinâmico

A Laura pode ser chamada de outro nome pelo usuário e deve aceitar isso.

**Perguntas em aberto:**
- Como o modelo detecta que o usuário está dando um novo nome? ("pode te chamar de X?", "te chamo de X")
- Onde o novo nome é salvo? (`## Perfil` da *Laura* ou no `## Como Interagir` do usuário?)
- O nome deve ser salvo por usuário (cada um a chama diferente) ou global?
- O modelo deve confirmar quando aceitar um novo nome? Como fazer isso naturalmente?
- E se o nome for ofensivo ou inadequado? O modelo deve recusar?
- O nome deve aparecer no próprio prompt ou só na memória?

---

### 4. Contexto de grupo e @menções

Em grupos, a Laura pode ouvir conversas sobre terceiros. Quando alguém @ menciona outro usuário, pode haver fatos, apelidos ou contexto que vale capturar.

**Perguntas em aberto:**
- A Laura deve capturar informações sobre usuários que **não** estão falando com ela diretamente?
- Onde esses dados ficam? No arquivo de memória de quem mencionou, ou em um arquivo separado do usuário mencionado?
- Como lidar com o fato de que a Laura pode ter informação sobre X dita por Y, sem X nunca ter interagido com ela?
- O @ no WhatsApp entrega o número do usuário mencionado — isso deve ser resolvido para nome/apelido?
- Deve haver diferença entre o que a Laura sabe de A sobre B (fofoca/perspectiva) vs o que B disse diretamente?
- Como evitar que a Laura "vaze" informação de um usuário para outro? (ex: A disse que B está passando por divórcio — B pergunta se a Laura sabe algo)
- A Laura deve agir diferente quando fala com alguém que ela "conhece de ouvir falar" vs quem ela nunca interagiu?

---

### 5. Tools no contexto do prompt

A Laura tem tools disponíveis. O prompt deve orientar QUANDO e COMO usá-las.

**Perguntas em aberto:**
- O prompt deve listar as tools disponíveis explicitamente ou confiar no schema da tool?
- Deve haver uma hierarquia de quando usar tools? (ex: só usar `memory_write_section` com alta certeza)
- Como o prompt orienta o modelo a NÃO usar tools desnecessariamente (custo e latência)?
- O modelo deve mencionar para o usuário quando está salvando algo ("Anotei!") ou agir sempre silenciosamente?
- Como o prompt orienta o uso correto de `memory_add_note` vs `memory_write_section`?
- Deve ter orientação sobre quando sugerir `memory_compact` ao invés de esperar o trigger automático?

---

### 6. Grupo vs conversa privada

O comportamento da Laura deve diferir significativamente entre grupos e DMs.

**Perguntas em aberto:**
- No grupo, a Laura deve responder a *qualquer* mensagem ou só quando mencionada/@laurinha?
- Como o prompt orienta a Laura a não "dominar" uma conversa de grupo?
- A Laura deve ter uma "memória de grupo" além das individuais? O que vai nela?
- Como a Laura age quando dois usuários que ela conhece individualmente conversam no grupo?
- Deve existir uma "personalidade de grupo" diferente da "personalidade privada"?
- Como o prompt orienta sobre privacidade: informação dita no privado não deve vazar no grupo?

---

### 7. Compatibilidade com a memória

O prompt precisa trabalhar *junto* com o `.md` de memória, não contra ele.

**Perguntas em aberto:**
- O prompt deve instruir o modelo a **ler** a memória no início de toda conversa ou só quando relevante?
- Como o modelo sabe que deve **atualizar** a memória ao final de uma interação relevante?
- O que acontece quando o prompt diz uma coisa e a memória diz outra? (ex: prompt define tom neutro, memória diz que usuário prefere linguagem informal)
- Deve haver uma instrução explícita de "a memória tem prioridade sobre o prompt para preferências individuais"?
- Como evitar que o modelo fique obcecado em salvar tudo e quebre o fluxo de conversa?

---

### 8. Multilinguagem e código de linguagem

O campo `language` existe no frontmatter da memória.

**Perguntas em aberto:**
- A Laura deve detectar automaticamente o idioma e adaptar?
- Se o usuário escreve em inglês mas a memória diz `pt-BR`, qual prevalece?
- Deve ter instrução explícita sobre code-switching (usuário mistura idiomas)?
- O nome "Laura" deve ser adaptado para outros idiomas/culturas?

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

### Estrutura do prompt decidida
- [ ] A definir

### Regras de personalidade/adaptação
- [ ] A definir

### Comportamento de nome dinâmico
- [ ] A definir

### Comportamento em grupos / @menções
- [ ] A definir

### Orientações de uso de tools
- [ ] A definir

### Comportamento grupo vs privado
- [ ] A definir

---

*Criado em 2026-05-30 — trazer compilado para análise final antes de implementar.*
