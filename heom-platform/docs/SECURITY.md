# Segurança — avaliação da versão 0.3.2

## Implementado nesta base

- Senhas armazenadas com bcrypt (custo 12).
- Autenticação local com JWT e expiração configurável.
- Perfis básicos: ADMIN, GESTOR, OPERADOR e CONSULTA.
- Verificação de perfil no backend para operações privilegiadas.
- Validação de payloads por Zod em fluxos principais.
- Helmet, CORS configurável, limite de requisições no login e limite de corpo JSON.
- Parâmetros SQL em consultas PostgreSQL.
- Registro de auditoria para ações principais.
- WebSocket exige autenticação no início da conexão.
- Perfis rápidos sem senha existem somente no servidor `demo-server.ts`. Em produção, só são habilitados mediante `ENABLE_DEMO_PROFILES=true` na instância separada de demonstração; não são registrados pelo servidor institucional.
- O modo demonstrativo vincula API e Vite à interface local (`127.0.0.1`) por padrão; o script institucional habilita o host de rede para a LAN cabeada.

## Riscos e tarefas obrigatórias antes da produção

1. **JWT:** alterar o segredo de exemplo; implantar rotação e revogação de sessão conforme política institucional. Nesta versão, o token é mantido no armazenamento local do navegador.
2. **MQTT:** a configuração de desenvolvimento permite conexão anônima. Produção exige autenticação por gateway, ACL por tópico, TLS quando aplicável e segregação de rede.
3. **HTTPS:** o servidor de desenvolvimento não configura TLS. Implantar proxy reverso interno com certificado confiável.
4. **CORS e origens:** definir a lista exata de hosts institucionais autorizados.
5. **Cookies/sessões:** avaliar migração para cookies `HttpOnly`, `Secure` e `SameSite` em implantação final.
6. **Auditoria:** revisar imutabilidade, retenção, acesso e proteção contra alteração indevida dos registros.
7. **LGPD:** validar finalidade, base legal, minimização, transparência, retenção e acesso com encarregado e áreas responsáveis.
8. **Contas:** implementar política de troca de senha, bloqueio/recuperação, desativação e revisão periódica dos privilégios.
9. **Infraestrutura:** aplicar firewall, hardening, atualização de dependências, monitoramento e backup protegido.
10. **Testes:** executar avaliação de segurança, testes de autorização e análise de dependências antes de uso real.
11. **Perfis de demonstração:** a entrada rápida não exige senha e permite que visitantes alterem registros fictícios. Use somente em uma instância isolada para avaliação pública, sem dados reais. Nunca habilitar `ENABLE_DEMO_PROFILES` no servidor institucional.

## Dados pessoais e pacientes

O modelo inicial não inclui dados de pacientes. Dados de colaboradores são limitados ao necessário para autenticação e responsabilização de operações. O sistema tem finalidade de rastrear ativos, não de vigiar funcionários.

## Não homologado

Este documento não constitui certificação de conformidade LGPD, avaliação de impacto, pentest ou parecer de segurança institucional.
