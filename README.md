# Consulta protegida

Interface estática para revisão compartilhada de documentos.

Os dados e anexos deste repositório são criptografados. A senha não integra o repositório nem a URL. Revisões humanas são armazenadas e trocadas em arquivos criptografados; não há servidor de sincronização.

Criptografia: AES-256-GCM, nonce aleatório por arquivo, chave derivada por PBKDF2-HMAC-SHA-256 com salt aleatório e 600.000 iterações.
