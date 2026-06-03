import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Usado para tarefas pesadas e pontuais (compactação de memória, resumos longos, etc.)
function getModel() {
  return genAI.getGenerativeModel({ model: config.gemini.model });
}

const COMPACT_PROMPT = `Você é um sistema de gestão de memória para um assistente de WhatsApp chamado Laurinha.
Abaixo está a memória atual de um usuário em markdown, incluindo notas brutas pendentes.

Sua tarefa: reescreva esta memória de forma compacta, processando as notas pendentes e reorganizando tudo.

═══ SEÇÕES OBRIGATÓRIAS (nesta ordem) ═══

## Perfil
Fatos estáveis sobre quem a pessoa é: nome preferido, idade, profissão, onde mora, restrições físicas/alimentares.
→ Nunca apagar identidade central. Condensar se repetitivo.

## Como Interagir
Tom preferido, estilo de resposta, o que funciona, o que evitar — construído por observação.
→ Manter padrões comportamentais confirmados. Remover observações fracas ou únicas.

## Relacionamentos
Pessoas e pets mencionados com frequência: nome e vínculo.
→ Manter apenas relações recorrentes. Remover menções casuais únicas.

## Contexto Atual
O que está acontecendo na vida do usuário AGORA: projetos, objetivos, situações em curso.
→ REESCREVER INTEIRAMENTE com base nas notas recentes. Itens com mais de 2 meses sem reforço devem ser removidos.

## Memórias
Fatos importantes que devem sobreviver além do momento atual: eventos marcantes, preferências duráveis, histórico relevante.
→ Condensar itens similares. Preservar fatos únicos e úteis. Marcar com (disse) ou (obs) quando relevante.

═══ PIRÂMIDE DE PRIORIDADE (use ao decidir o que cortar) ═══

1. IDENTIDADE — nome, vínculos familiares, restrições físicas → nunca apagar
2. COMO INTERAGIR — padrões de comunicação → manter se confirmados
3. RELACIONAMENTOS — pessoas recorrentes → manter se úteis
4. CONTEXTO ATUAL — situação presente → reescrever, não acumular
5. MEMÓRIAS DURÁVEIS — eventos e preferências — condensar se necessário
6. MENÇÕES CASUAIS — ditas uma vez, sem reforço → descartar

═══ REGRAS GLOBAIS ═══
- Bullet points curtos com marcador (disse) ou (obs) quando relevante
- Timestamps leves: (mmm/aa) apenas em itens datados
- NÃO inclua frontmatter (---) nem a seção ## Notas Pendentes
- Máximo 2800 caracteres no total
- Responda APENAS com o corpo markdown. Zero texto extra.`;

export async function compactMemoryWithGemini(currentMemory: string): Promise<string> {
  const model = getModel();
  const result = await model.generateContent(`${COMPACT_PROMPT}\n\nMemória atual:\n${currentMemory}`);
  return result.response.text().trim();
}
