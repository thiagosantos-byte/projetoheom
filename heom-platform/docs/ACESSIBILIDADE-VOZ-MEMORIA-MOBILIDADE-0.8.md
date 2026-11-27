# HEOM 0.8.0 — voz, orientação e mobilidade

## Leitura e comando por voz

A Central de Acessibilidade passa a disponibilizar:

- **Ouvir opções:** usa a API de síntese de voz do navegador para ler em português do Brasil cada preferência e informar se está ativada ou desativada.
- **Parar leitura:** interrompe a fala em andamento.
- **Comando de voz:** após o usuário acionar o microfone e conceder permissão, reconhece os comandos curtos “ler opções” e “parar leitura”.
- **Feedback textual:** o estado da leitura, do microfone, de erros e de incompatibilidade é apresentado em uma região `aria-live`.

A síntese de voz depende da disponibilidade de `speechSynthesis` e de uma voz configurada no dispositivo. O reconhecimento depende de `SpeechRecognition` ou `webkitSpeechRecognition`, não funciona em todos os navegadores e pode utilizar processamento externo do navegador. O uso do microfone é iniciado somente após ação explícita. A tela orienta a não falar dados pessoais ou dados de pacientes.

## Apoio à memória e à orientação

O “Modo de orientação simplificada”:

- apresenta o nome da área atual em local consistente;
- descreve em linguagem simples a finalidade do módulo atual;
- mantém uma ação grande e previsível para retornar à visão geral;
- aumenta a legibilidade com tipografia simples e maior espaçamento;
- preserva o acesso a todos os módulos permitidos ao perfil, sem ocultar funções.

É um apoio de interface para pessoas com dificuldades de memória ou orientação, incluindo pessoas que vivem com demência ou Alzheimer. Não é ferramenta clínica nem substitui apoio humano ou treinamento.

## Apoio à mobilidade e aos tremores

O “Modo de interação motora facilitada”:

- aumenta a altura mínima de botões, campos e links interativos;
- aumenta a distância entre controles;
- aumenta o tamanho de botões de navegação e ações de tabela;
- desativa transições e movimentos decorativos;
- evita transformações no hover, reduzindo respostas visuais inesperadas.

É um apoio de interface para tremores, Parkinson e outras limitações motoras. As ações do sistema continuam exigindo interação intencional e respeitam perfis e permissões existentes.

## Verificações desta atualização

- Sintaxe TS/TSX da aplicação validada com o compilador TypeScript disponível.
- Testes unitários do interpretador de comandos por voz: **4 aprovados**, cobrindo “ler opções”, variações com acentos, “parar leitura” e falas desconhecidas.
- Typecheck completo e build não concluídos: o `node_modules` presente no ambiente de autoria está incompleto e não contém vários pacotes de tipos, como `@types/node`, `@types/react` e dependências do Express.
- Não foram realizados testes de microfone/voz em navegadores reais, leitores de tela, dispositivos móveis ou com usuários. O reconhecimento de fala e as vozes instaladas precisam ser validados no equipamento-alvo.

No computador de desenvolvimento, extraia o ZIP e execute a partir de `projetoheom-main/heom-platform`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

O projeto permanece em um único repositório e com o mesmo comando de desenvolvimento integrado. Não foi adicionado serviço separado, Docker ou nova dependência npm.
