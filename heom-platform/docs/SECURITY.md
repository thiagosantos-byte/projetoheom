# Segurança e uso adequado — HEOM 0.4.0

## Modo demonstrativo público

- Os perfis ADMIN, GESTOR, OPERADOR e CONSULTA são personagens locais escolhidos pelo visitante.
- Não existem contas, e-mails, senhas, tokens ou provedor de autenticação no fluxo público.
- As permissões por perfil existem para demonstrar a experiência da interface e as operações locais. Como o visitante controla o navegador e os dados, elas **não são uma barreira de segurança**.
- Todo o inventário da demonstração é fictício e fica no armazenamento do navegador atual. Não há compartilhamento ou integridade garantida entre visitantes.
- Não inserir informações de pacientes, colaboradores, equipamentos reais, números patrimoniais oficiais ou qualquer dado institucional.
- A aplicação pública não deve ser utilizada para decisões clínicas, manutenção real ou operação patrimonial de hospital.

## Antes de uma implantação institucional

A base legada `apps/api/src/server.ts` e as migrations PostgreSQL/MQTT não são usadas pelo modo demonstrativo padrão. Uma implantação institucional deve ser tratada como outro ambiente, com arquitetura e controles próprios, incluindo no mínimo:

1. autenticação institucional, sessões seguras, MFA quando aplicável e política de recuperação de conta;
2. autorização RBAC validada no servidor para cada operação;
3. banco de dados persistente, backup, retenção e restauração testada;
4. armazenamento de mídia privado, controle de acesso e antivírus/validação de conteúdo;
5. TLS, gestão de segredos, firewall, hardening, monitoramento e atualização de dependências;
6. ACL e TLS para MQTT, autenticação dos gateways e validação dos eventos;
7. trilha de auditoria protegida contra alteração indevida;
8. revisão LGPD, finalidade, minimização, retenção e acesso com as áreas responsáveis;
9. testes de segurança, autorização, carga, recuperação e homologação técnica/operacional.

## Não homologado

Este material não é certificação de conformidade LGPD, pentest, parecer de segurança nem autorização para uso em ambiente hospitalar real.
